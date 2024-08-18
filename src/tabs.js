/** BrowserTab
 * @typedef {object} BrowserTab https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/tabs/Tab
 * @property {number} id
 * @property {number} openerTabId
 * @property {number} windowId
 * @property {number} index
 * @property {'loading'|'complete'} status
 * @property {string} favIconUrl
 * @property {string} title
 * @property {string} url
 */

const Tabs = {
  /**
   * @returns {Promise<void>}
   */
  init: async function() {
    if (!browser.tabs.onCreated.hasListener(Tabs._on.created)) {
      browser.tabs.onCreated.addListener(Tabs._on.created);
    }

    if (!browser.tabs.onActivated.hasListener(Tabs._on.activated)) {
      browser.tabs.onActivated.addListener(Tabs._on.activated);
    }

    if (!browser.tabs.onAttached.hasListener(Tabs._on.attached)) {
      browser.tabs.onAttached.addListener(Tabs._on.attached);
    }

    if (!browser.tabs.onUpdated.hasListener(Tabs._on.updated)) {
      browser.tabs.onUpdated.addListener(Tabs._on.updated);
    }

    if (!browser.tabs.onMoved.hasListener(Tabs._on.moved)) {
      browser.tabs.onMoved.addListener(Tabs._on.moved);
    }

    if (!browser.tabs.onRemoved.hasListener(Tabs._on.removed)) {
      browser.tabs.onRemoved.addListener(Tabs._on.removed);
    }
  },

  /**
   * @param {number} tabID
   * @returns {Promise<BrowserTab>}
   */
  get: function(tabID) {
    return new Promise((resolve) => {
      browser.tabs.get(tabID).then((value) => resolve(value ?? null), () => resolve(null));
    });
  },

  /**
   * @param {number} tabID
   * @returns {Promise<void>}
   */
  show: function(tabID) {
    return new Promise((resolve) => {
      browser.tabs.show(tabID).then(() => resolve(), () => resolve());
    });
  },

  /**
   * @param {number} tabID
   * @returns {Promise<void>}
   */
  hide: function(tabID) {
    return new Promise((resolve) => {
      browser.tabs.hide(tabID).then(() => resolve(), () => resolve());
    });
  },

  /**
   * @param {number} tabID
   * @returns {Promise<void>}
   */
  setActive: async function(tabID) {
    await browser.tabs.update(tabID, {active: true});
  },

  /**
   * @param {string} group
   * @param {number|null} [windowID=null] The ID of the window that owns the group
   * @param {boolean} [includeGroupTab=false]
   * @returns {Promise<BrowserTab[]>}
   */
  getTabsInGroup: async function(group, windowID = null, includeGroupTab = false) {
    const retval = [];

    windowID = windowID ?? await Windows.getIDForGroup(group);
    const tabs = await Windows.getAllTabsIn(windowID);
    for (const tab of tabs) {
      const tabGroup = await Tabs.value.get.group(tab.id);
      const isGroupTab = await Tabs.value.get.isGroupTab(tab.id);
      if (tabGroup === group && (includeGroupTab || !isGroupTab)) {
        retval.push(tab);
      }
    }

    return retval;
  },

  /**
   * @param {string} group
   * @returns {Promise<void>}
   */
  highlightTabsInGroup: async function(group) {
    const tabs = await Tabs.getTabsInGroup(group);
    for (const tab of tabs) {
      await browser.tabs.update(tab.id, {highlighted: true, active: false});
    }
  },

  /**
   * @param {string} group
   * @param {number} windowID The ID of the window that owns the group
   * @param {boolean} includeGroupTab
   * @param {number[]} except The IDs of any tabs that shouldn't be part of the calculation
   * @returns {Promise<{min:number, max: number}|null>}
   */
  getGroupIndexSpan: async function(group, windowID, includeGroupTab = false, except = []) {
    let tabs = await Tabs.getTabsInGroup(group, windowID, includeGroupTab);
    tabs = tabs.filter((tab) => !except.includes(tab.id)).sort((a, b) => a.index - b.index);
    if (tabs.length === 0) { return null; }
    return {min: tabs[0].index, max: tabs[tabs.length - 1].index};
  },

  move: {
    /**
     * @param {number} tabID
     * @param {number} index
     * @param {number|null} [windowID]
     * @returns {Promise<void>}
     */
    toIndex: async function(tabID, index, windowID = null) {
      if (windowID == null) {
        await browser.tabs.move(tabID, {index});
      } else {
        await browser.tabs.move(tabID, {index, windowId: windowID});
      }
    },

    /**
     * @param {number} tabID
     * @returns {Promise<void>}
     */
    intoGroup: async function(tabID) {
      const tab = await Tabs.get(tabID);
      const group = await Tabs.value.get.group(tab.id);
      if (group == null) { return; }
      const groupWindowID = await Windows.getIDForGroup(group);
      const span = await Tabs.getGroupIndexSpan(group, groupWindowID, true, [tab.id]);
      if (span == null) { return; }

      if (groupWindowID !== tab.windowId) {
        await Tabs.move.toIndex(tab.id, span.max + 1, groupWindowID);
      } else if (tab.index <= span.min) {
        await Tabs.move.toIndex(tab.id, span.min);
      } else if (tab.index > span.max + 1) {
        await Tabs.move.toIndex(tab.id, span.max + 1);
      }
    },

    /**
     * @param {number} tabID
     * @param {number|null} [windowID=null]
     * @param {number|null} [index=null]
     * @returns {Promise<number>}
     */
    outOfOtherGroups: async function(tabID, windowID = null, index = null) {
      if (windowID == null || index == null) {
        const tab = await Tabs.get(tabID);
        windowID = tab.windowId;
        index = tab.index;
      }

      const except = await Tabs.value.get.group(tabID);
      const groups = await Windows.getAllGroupsIn(windowID);

      for (const group of groups) {
        if (group === except) { continue; }

        const span = await Tabs.getGroupIndexSpan(group, windowID, true);
        if (span == null) { continue; }

        if (index >= span.min & index <= span.max) {
          await Tabs.move.toIndex(tabID, span.max);
          return span.max; // After this we don't need to check any more, if we assume that all tabs BUT the current tab are correct
        }
      }

      return index;
    },
  },

  value: {
    keys: {
      group: 'group',
      isGroupTab: 'group-tab',
      shouldKeepOpenedTabs: 'should-inherit-group',
      iconColor: 'icon-color',
      customIconURL: 'custom-icon-url',
    },

    get: {
      /**
       * @param {number} tabID
       * @returns {Promise<string|null>}
       */
      group: async function(tabID) {
        return Tabs.value.get._value(tabID, Tabs.value.keys.group);
      },

      /**
       * @param {number} tabID
       * @returns {Promise<boolean>}
       */
      isGroupTab: async function(tabID) {
        return Tabs.value.get._value(tabID, Tabs.value.keys.isGroupTab, false);
      },

      /**
       * @param {number} tabID
       * @returns {Promise<boolean>}
       */
      shouldKeepOpenedTabs: async function(tabID) {
        return Tabs.value.get._value(tabID, Tabs.value.keys.shouldKeepOpenedTabs, false);
      },

      /**
       * @param {number} tabID
       * @returns {Promise<string|null>}
       */
      iconColor: async function(tabID) {
        return Tabs.value.get._value(tabID, Tabs.value.keys.iconColor);
      },

      /**
       * @param {number} tabID
       * @returns {Promise<string|null>}
       */
      customIconURL: async function(tabID) {
        return Tabs.value.get._value(tabID, Tabs.value.keys.customIconURL);
      },

      /**
       * @param {number} tabID
       * @param {string} key
       * @param {*} [defaultValue=null]
       * @returns {Promise<*|null>}
       */
      _value: function(tabID, key, defaultValue = null) {
        return new Promise((resolve) => {
          browser.sessions.getTabValue(tabID, key).then((value) => resolve(value ?? defaultValue), () => resolve(defaultValue));
        });
      },
    },

    set: {
      /**
       * @param {number} tabID
       * @param {string} group
       * @returns {Promise<void>}
       */
      group: async function(tabID, group) {
        Groups.groupedTabCache[tabID] = group;
        await Tabs.value.set._value(tabID, Tabs.value.keys.group, group);
      },

      /**
       * @param {number} tabID
       * @param {true} value
       * @returns {Promise<void>}
       */
      isGroupTab: async function(tabID, value) {
        await Tabs.value.set._value(tabID, Tabs.value.keys.isGroupTab, value);
      },

      /**
       * @param {number} tabID
       * @param {boolean} value
       * @returns {Promise<void>}
       */
      shouldKeepOpenedTabs: async function(tabID, value) {
        await Tabs.value.set._value(tabID, Tabs.value.keys.shouldKeepOpenedTabs, value);
      },

      /**
       * @param {number} tabID
       * @param {string} value
       * @returns {Promise<void>}
       */
      iconColor: async function(tabID, value) {
        await Tabs.value.set._value(tabID, Tabs.value.keys.iconColor, value);
      },

      /**
       * @param {number} tabID
       * @param {string} value
       * @returns {Promise<void>}
       */
      customIconURL: async function(tabID, value) {
        await Tabs.value.set._value(tabID, Tabs.value.keys.customIconURL, value);
      },

      /**
       * @param {number} tabID
       * @param {string} key
       * @param {*} value
       * @returns {Promise<void>}
       */
      _value: async function(tabID, key, value) {
        await browser.sessions.setTabValue(tabID, key, value);
      },
    },

    initialize: {
      /**
       * Sets the value, if it wasn't set before
       *
       * @param {number} tabID
       * @param {string} group
       * @returns {Promise<void>}
       */
      group: async function(tabID, group) {
        const currentValue = await Tabs.value.get.group(tabID);
        if (currentValue == null) {
          await Tabs.value.set.group(tabID, group);
        }
      },

      /**
       * Sets the value, if it wasn't set before
       *
       * @param {number} tabID
       * @param {true} value
       * @returns {Promise<void>}
       */
      isGroupTab: async function(tabID, value) {
        const currentValue = await Tabs.value.get.isGroupTab(tabID);
        if (!currentValue) {
          await Tabs.value.set.isGroupTab(tabID, value);
        }
      },

      /**
       * Sets the value, if it wasn't set before
       *
       * @param {number} tabID
       * @param {true} value
       * @returns {Promise<void>}
       */
      shouldKeepOpenedTabs: async function(tabID, value) {
        const currentValue = await Tabs.value.get.shouldKeepOpenedTabs(tabID);
        if (!currentValue) {
          await Tabs.value.set.shouldKeepOpenedTabs(tabID, value);
        }
      },

      /**
       * Sets the value, if it wasn't set before
       *
       * @param {number} tabID
       * @param {string} value
       * @returns {Promise<void>}
       */
      iconColor: async function(tabID, value) {
        const currentValue = await Tabs.value.get.iconColor(tabID);
        if (!currentValue) {
          await Tabs.value.set.iconColor(tabID, value);
        }
      },

      /**
       * Sets the value, if it wasn't set before
       *
       * @param {number} tabID
       * @param {string} value
       * @returns {Promise<void>}
       */
      customIconURL: async function(tabID, value) {
        const currentValue = await Tabs.value.get.customIconURL(tabID);
        if (!currentValue) {
          await Tabs.value.set.customIconURL(tabID, value);
        }
      },
    },

    remove: {
      /**
       * @param {number} tabID
       * @returns {Promise<void>}
       */
      all: async function(tabID) {
        await Tabs.value.remove.group(tabID);
        await Tabs.value.remove.isGroupTab(tabID);
        await Tabs.value.remove.shouldKeepOpenedTabs(tabID);
        await Tabs.value.remove.iconColor(tabID);
        await Tabs.value.remove.customIconURL(tabID);
      },

      /**
       * @param {number} tabID
       * @returns {Promise<void>}
       */
      group: async function(tabID) {
        delete Groups.groupedTabCache[tabID];
        await Tabs.value.remove._value(tabID, Tabs.value.keys.group);
      },

      /**
       * @param {number} tabID
       * @returns {Promise<void>}
       */
      isGroupTab: async function(tabID) {
        await Tabs.value.remove._value(tabID, Tabs.value.keys.isGroupTab);
      },

      /**
       * @param {number} tabID
       * @returns {Promise<void>}
       */
      shouldKeepOpenedTabs: async function(tabID) {
        await Tabs.value.remove._value(tabID, Tabs.value.keys.shouldKeepOpenedTabs);
      },

      /**
       * @param {number} tabID
       * @returns {Promise<void>}
       */
      iconColor: async function(tabID) {
        await Tabs.value.remove._value(tabID, Tabs.value.keys.iconColor);
      },

      /**
       * @param {number} tabID
       * @returns {Promise<void>}
       */
      customIconURL: async function(tabID) {
        await Tabs.value.remove._value(tabID, Tabs.value.keys.customIconURL);
      },

      /**
       * @param {number} tabID
       * @param {string} key
       * @returns {Promise<void>}
       */
      _value: function(tabID, key) {
        return new Promise((resolve) => {
          browser.sessions.removeTabValue(tabID, key).then(() => resolve(), () => resolve());
        });
      },
    },
  },

  _on: {
    /**
     * This is needed due to the fact that me calling move for some reason triggers the onMoved callback for me.
     * In order to not reach stack depth immediately, don't try to process tabs that are being processed.
     *
     * @type {Record<number,true>} Maps tab ID to nothing worth noting
     */
    movedCache: {},

    /**
     * Since Firefox is stupid and doesn't respect finishing callback calls if there are awaits in them,
     * we need to do that part manually ourselves.
     * The fact that Firefox doesn't do this would be fine, if it weren't for the fact that EVERYTHING in plugin dev is asynchronous.
     * This of course means that there is basically NOTHING we can do in a callback without encountering this issue.
     *
     * If we don't do this, we run into issues when we reopen a previously grouped tab: the tab gets removed from the group,
     * but is also marked as the last active tab, which is not great (for obvious reasons).
     * The issue could also be mitigated if we were allowed to look at and set session values for tabs in the onRemoved event, but for some (surely pure genious) reason we can't.
     * @see Tabs._on.created
     * @see Tabs._on.activated
     *
     * @type {Record<number, Promise<void>>} Maps the tab ID to a promise that we can await to be able to resume when the function should ACTUALLY have been called
     */
    creatingCache: {},

    /**
     * @param {BrowserTab} tab
     * @returns {Promise<void>}
     */
    created: async function(tab) {
      let resolve = null;
      Tabs._on.creatingCache[tab.id] = new Promise((_resolve) => resolve = _resolve);

      const group = await Tabs.value.get.group(tab.id);
      const isGroupTab = await Tabs.value.get.isGroupTab(tab.id);

      let windowID = tab.windowId;

      if (isGroupTab) { // Reopened a closed group tab
        const otherGroupTab = await Groups.groupTab.get(group, null, tab.id);
        const tabsInGroup = await Tabs.getTabsInGroup(group, windowID, false);
        if (otherGroupTab != null || tabsInGroup.length === 0) { // There is a new group with the same name as the restored tab - deinit this one
          await Groups.groupTab.deinit(tab.id);
          await browser.tabs.update(tab.id, {url: '/src/group-tab/index.html', loadReplace: true}); // Remove the ?group parameter, which should signal to the tab that it isn't active anymore
        } else { // We can safely restore this tab group
          await Groups.groupTab.init(tab.id, group, windowID);
          await Groups.collapse.allExceptCurrent(windowID);
        }
      } else if (group) { // Reopened a tab that used to be grouped
        const groupTab = await Groups.groupTab.get(group);
        if (groupTab != null && groupTab.windowId === windowID) { // The group still exists in the proper window
          await Groups.collapse.allExceptCurrent(windowID);
          await Groups.groupTab.update(group, windowID, groupTab.id);
        } else { // Group is either gone, or in another window
          await Tabs.value.remove.all(tab.id);
        }
      } else if (tab.openerTabId != null) { // Opened a new tab from another tab
        const openerGroup = await Tabs.value.get.group(tab.openerTabId);
        if (openerGroup != null) {
          const groupTab = await Groups.groupTab.get(openerGroup);
          const shouldKeepOpenedTabs = await Tabs.value.get.shouldKeepOpenedTabs(groupTab.id);
          if (shouldKeepOpenedTabs) {
            await Groups.addTabTo(openerGroup, tab);
            windowID = groupTab.windowId;
          }
        }
      }

      await Tabs.move.outOfOtherGroups(tab.id, tab.windowId, tab.index);
      await Groups.collapse.allExceptCurrent(windowID);

      delete Tabs._on.creatingCache[tab.id];
      resolve();
    },

    /**
     * @param {{previousTabId: number, tabId: number, windowId: number}} info https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/tabs/onActivated#activeinfo_2
     * @returns {Promise<void>}
     */
    activated: async function(info) {
      if (info.tabId in Tabs._on.creatingCache) {
        await Tabs._on.creatingCache[info.tabId];
      }

      const newGroup = await Tabs.value.get.group(info.tabId);
      const oldGroup = await Tabs.value.get.group(info.previousTabId);
      await Groups.collapse.allExcept(newGroup, info.windowId);

      if (newGroup != null) {
        if (newGroup === oldGroup) { // Swapped tabs within the same group - update the last active tab
          Groups.lastActiveTab.set(newGroup, info.tabId);
        } else if (Groups.lastActiveTab.get(newGroup) != null) { // Moved from one group to another - swap to the last active tab of the new group (if any)
          await Tabs.setActive(Groups.lastActiveTab.get(newGroup));
        }
      }
    },

    /**
     * @param {number} tabID
     * @param {{newWindowId: number, newPosition: number}} info https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs/onAttached#attachinfo_2
     * @returns {Promisevdoi>}
     */
    attached: async function(tabID, info) {
      const group = Groups.groupedTabCache[tabID];
      const wasGroupTabOf = Groups.groupTab.cache[tabID];

      if (wasGroupTabOf != null) { // A group tab was moved to a new window, recreate the group
        const oldWindowID = await Windows.getIDForGroup(group);
        await Groups.groupTab.init(tabID, group, oldWindowID);

        const tabs = await Tabs.getTabsInGroup(group, oldWindowID);
        for (const tab of tabs) {
          await Tabs.move.intoGroup(tab.id);
        }

        await Group.collapse.allExceptCurrent(info.newWindowId);
        await Group.collapse.allExceptCurrent(oldWindowID);
      } else if (group) { // A grouped tab was moved to a new window
        const oldWindowID = await Windows.getIDForGroup(group);
        if (info.newWindowId !== oldWindowID) { // Tell the remainder of the group of the deserter
          await Groups.removeTabFrom(group, tabID);
        } else { // Probably part of a group tab move - reattach the tab to the group
          await Groups.addTabTo(group, await Tabs.get(tabID));
        }
      }
    },

    /**
     * @param {number} tabID
     * @param {Partial<BrowserTab>} changeInfo
     * @param {BrowserTab} tab
     * @returns {Promise<void>}
     */
    updated: async function(tabID, changeInfo, tab) {
      if (changeInfo.status !== 'complete') { return; } // Slight performance boost maybe?

      const group = await Tabs.value.get.group(tabID);
      const isGroupTab = await Tabs.value.get.isGroupTab(tabID);

      if (isGroupTab) { // Some naughty user refreshed their group tab. Bad user, bad!
        await Groups.groupTab.init(tabID, group, tab.windowId);
      } else if (group != null) {
        Communication.send.updateTab(group, tab);
      }
    },

    /**
     * This only handles moves within the same window. For swapping between:
     * @see Tabs._on.attached.
     *
     * @param {number} tabID
     * @param {{windowId: number, fromIndex: number, toIndex: number}} info https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/tabs/onMoved#moveinfo_2
     * @returns {Promise<void>}
     */
    moved: async function(tabID, info) {
      if (tabID in Tabs._on.movedCache) { return; }
      Tabs._on.movedCache[tabID] = true;

      const group = await Tabs.value.get.group(tabID);
      const isGroupTab = await Tabs.value.get.isGroupTab(tabID);

      if (isGroupTab) { // A group tab was moved
        // Make sure it's not in the middle of some other group
        const index = await Tabs.move.outOfOtherGroups(tabID, info.windowId, info.toIndex);

        // Move all tabs belonging to it the same distance in the same direction
        const offset = index - info.fromIndex;
        const tabs = await Tabs.getTabsInGroup(group, info.windowId);

        for (const t of tabs) {
          if (t.id in Tabs._on.movedCache) { continue; }
          Tabs._on.movedCache[t.id] = true;

          const tab = await Tabs.get(t.id); // Refresh tab index
          await Tabs.move.toIndex(tab.id, tab.index + offset);

          delete Tabs._on.movedCache[t.id];
        }
      } else if (group != null) { // A tab that's part of a group (but isn't the group tab!) was moved. Make sure it stays within bounds
        await Tabs.move.intoGroup(tabID);
        Communication.send.sortTabs(group, await Tabs.getTabsInGroup(group, info.windowId));
      } else { // A non-group tab was moved. Make sure it doesn't end up in the middle of a group
        await Tabs.move.outOfOtherGroups(tabID, info.windowId, info.toIndex);
      }

      delete Tabs._on.movedCache[tabID];
    },

    /**
     * @param {number} tabID
     * @param {{windowId: number, isWindowClosing: boolean}} info https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/tabs/onRemoved#removeinfo_2
     * @returns {Promise<void>}
     */
    removed: async function(tabID, info) {
      if (tabID in Groups.groupTab.cache) { // Equivalent to "was a group tab"
        await Groups.remove(Groups.groupTab.cache[tabID]);
      } else if (tabID in Groups.groupedTabCache) { // Equivalent to "was part of a group"
        await Groups.removeTabFrom(Groups.groupedTabCache[tabID], tabID);
      }

      delete Groups.groupTab.cache[tabID];
      delete Groups.groupedTabCache[tabID];

      const group = await Windows.getCurrentGroupIn(info.windowId);
      await Groups.collapse.allExcept(group, info.windowId);
      if (group != null) {
        const lastActive = Groups.lastActiveTab.get(group);
        if (lastActive != null) {
          await Tabs.setActive(lastActive);
        }
      }
    },
  },
};