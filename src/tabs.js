const Tabs = {
  _tabs: {},
  _cachedLastActiveTab: {},
  _cachedGroupTabs: {},
  _cachedTabsInGroups: {},

  init: async function() {
    if (!browser.tabs.onCreated.hasListener(Tabs._onCreated)) {
      browser.tabs.onCreated.addListener(Tabs._onCreated);
    }

    if (!browser.tabs.onActivated.hasListener(Tabs._onActivated)) {
      browser.tabs.onActivated.addListener(Tabs._onActivated);
    }

    if (!browser.tabs.onUpdated.hasListener(Tabs._onUpdated)) {
      browser.tabs.onUpdated.addListener(Tabs._onUpdated);
    }

    if (!browser.tabs.onMoved.hasListener(Tabs._onMoved)) {
      browser.tabs.onMoved.addListener(Tabs._onMoved);
    }

    if (!browser.tabs.onAttached.hasListener(Tabs._onAttached)) {
      browser.tabs.onAttached.addListener(Tabs._onAttached);
    }

    if (!browser.tabs.onRemoved.hasListener(Tabs._onRemoved)) {
      browser.tabs.onRemoved.addListener(Tabs._onRemoved);
    }

    const windows = await Windows.getAll();
    for (const window of windows) {
      const tabs = await Windows.getAllTabsIn(window.id);
      for (const tab of tabs) {
        const group = await Tabs.getGroup(tab.id);
        const isGroupTab = await Tabs.isGroupTab(tab.id);

        if (isGroupTab) {
          await Tabs._initTab(tab.id, group, tab.windowId);
        } else if (group) {
          Tabs._cachedTabsInGroups[tab.id] = group;
        }
      }
    }
  },

  /**
   * @param {string} group
   * @param {number} windowID
   * @param {number} index
   */
  createGroupTab: async function(group, windowID, index) {
    const tab = await browser.tabs.create({
      active: true,
      url: '/src/group-tab/index.html',
      windowId: windowID,
      index: index,
    });

    await Tabs.setGroup(tab.id, group);
    await Tabs.setGroupTab(tab.id);

    await Tabs._initTab(tab.id, group, tab.windowId);
  },

  /**
   * @param {number} tabID
   * @param {string} group
   * @param {number} windowID
   */
  _initTab: async function(tabID, group, windowID) {
    await browser.tabs.executeScript(tabID, {file: '/src/group-tab/inject.js'}).catch((e) => {console.error('Failed to attach group script', e)});
    const port = await browser.tabs.connect(tabID);
    port.onMessage.addListener(Tabs._onTabCommunication(group, windowID));
    Tabs._tabs[group] = {port: port};

    Tabs._cachedGroupTabs[tabID] = group;

    await Tabs.sendMessage_init(group, await Tabs.getGroupTabs(group, windowID), windowID);
  },

  /**
   * @param {string} group
   * @param {number} windowID
   * @param {boolean} includeGroupTab
   * @param {number[]} except The IDs of the tabs to ignore
   * @returns {Promise<{min: number, max: number}|null>}
   */
  getGroupIndexSpan: async function(group, windowID, includeGroupTab = false, except = []) {
    const tabs = (await Tabs.getGroupTabs(group, windowID, includeGroupTab)).filter(x => !except.includes(x.id)).sort((a, b) => a.index - b.index);
    if (tabs.length === 0) { return null; }
    return {
      min: tabs[0].index,
      max: tabs[tabs.length - 1].index,
    }
  },

  /**
   * @param {string} oldName
   * @param {string} newName
   * @param {number} windowID
   */
  renameGroup: async function(oldName, newName, windowID) {
    const tabs = await Tabs.getGroupTabs(oldName, windowID, true);
    for (const tab of tabs) {
      await Tabs.removeGroup(oldName, tab.id);
      await Tabs.setGroup(tab.id, newName);

      Tabs._cachedGroupTabs[tab.id] = newName;
      Tabs._cachedTabsInGroups[tab.id] = newName;
    }

    Tabs._tabs[newName] = Tabs._tabs[oldName];
    delete Tabs._tabs[oldName];

    await Tabs.sendMessage_rename(newName);
  },

  // START: Listeners
  /**
   * @param {string} group
   * @param {number} windowID
   * @returns {(msg: Record<string, any>) => Promise<void>}
   */
  _onTabCommunication: function(group, windowID) {
    return async (msg) => {
      if (msg.action === 'removeTab') {
        Groups.removeTab(group, msg.tabID);
      } else if (msg.action === 'swapToTab') {
        Tabs.activate(msg.tabID);
      } else if (msg.action === 'highlightTabs') {
        Tabs.highlightGroup(group, windowID);
      } else if (msg.action === 'set-inherit-group') {
        Tabs.setShouldInheritGroup(group, windowID, msg.value);
      } else if (msg.action === 'rename') {
        const oldName = group;
        const newName = msg.name.trim();

        if (oldName === newName) {
          return;
        }

        if (newName.length === 0) {
          Tabs.sendMessage_errors(group, 'Cannot have an empty group name');
          return;
        }

        const groups = await Groups.getAll();
        if (groups.includes(newName)) {
          Tabs.sendMessage_errors(group, 'There is already a group called ' + newName);
          return;
        }

        group = newName;
        Groups.rename(oldName, newName, windowID);
      }
    };
  },

  /**
   * @param {string} group
   * @param {number} windowID
   */
  highlightGroup: async function(group, windowID) {
    const tabs = await Tabs.getGroupTabs(group, windowID);
    for (const tab of tabs) {
      await Tabs.highlight(tab.id);
    }
  },

  /**
   * @param {browser.tabs.Tab} tab
   */
  _onCreated: async function(tab) {
    const group = await Tabs.getGroup(tab.id);
    const isGroupTab = await Tabs.isGroupTab(tab.id);

    if (isGroupTab) {
      // Reopened a closed group tab
      await Tabs.unsetGroupTab(tab.id);
      await Tabs.removeGroup(group, tab.id);

      // Tell the tab that its no longer a group tab
      await browser.tabs.executeScript(tab.id, {file: '/src/group-tab/inject.js'});
      const port = await browser.tabs.connect(tab.id);
      port.postMessage({action: 'reopened'});
      port.disconnect();
    } else if (group) {
      // Reopened tab that was previously part of a group
      await Tabs.removeGroup(group, tab.id);
    } else if (tab.openerTabId != null) {
      const openerGroup = await Tabs.getGroup(tab.openerTabId);
      const shouldInherit = await Tabs.getShouldInheritGroup(openerGroup, tab.windowID);
      if (openerGroup && shouldInherit) {
        await Groups.addTab(openerGroup, tab);
      }
    }

    await Tabs.moveTabOutOfOtherGroups(tab.id, tab.windowId, tab.index, null);
    await Groups.collapseAllGroupsExceptCurrent(tab.windowId);
  },

  /**
   * @param {{previousTabId: number, tabId: number, windowId: number}} info
   */
  _onActivated: async function(info) {
    const group = await Tabs.getGroup(info.tabId);
    const previousGroup = await Tabs.getGroup(info.previousTabId);
    await Groups.setActive(group, info.windowId);

    if (group) {
      if (group === previousGroup) {
        Tabs._cachedLastActiveTab[group] = info.tabId;
      } else if (Tabs._cachedLastActiveTab[group] != null) {
        Tabs.activate(Tabs._cachedLastActiveTab[group]);
      }
    }
  },

  /**
   * @param {number} tabID
   * @param {{windowId: number, fromIndex: number, toIndex: number}} info
   */
  _onMovedActive: {},
  _onMoved: async function(tabID, info) {
    if (tabID in Tabs._onMovedActive) { return; }
    Tabs._onMovedActive[tabID] = true;
    const group = await Tabs.getGroup(tabID);
    const isGroupTab = await Tabs.isGroupTab(tabID);

    if (isGroupTab) {
      // Moved group tab
      // 1. Make sure it's not in the middle of some other group
      // 2. Move all tabs belonging to it the same distance in the same direction
      const newIndex = await Tabs.moveTabOutOfOtherGroups(tabID, info.windowId, info.toIndex, group);
      const offset = newIndex - info.fromIndex;
      const tabs = await Tabs.getGroupTabs(group, info.windowId);

      for (const _tab of tabs) {
        const tab = await Tabs.get(_tab.id);
        if (tab.id in Tabs._onMovedActive) { continue; }

        Tabs._onMovedActive[tab.id] = true;
        await Tabs.move(tab.id, tab.index + offset);

        delete Tabs._onMovedActive[tab.id];
      }
    } else if (group != null) {
      // Moved tab in group. Make sure it stays within the group
      await Tabs.moveTabIntoGroup(tabID, info.windowId, info.toIndex, group, info.windowId);
      await Tabs.sendMessage_sortTabs(group, await Tabs.getGroupTabs(group, info.windowId));
    } else {
      // Moved non-grouped tab. Make sure it doesn't accidentally end up in the middle of a group
      await Tabs.moveTabOutOfOtherGroups(tabID, info.windowId, info.toIndex, null);
    }

    delete Tabs._onMovedActive[tabID];
  },

  /**
   * @param {number} tabID
   * @param {{newWindowId: number, newPosition: number}} info
   */
  _onAttached: async function(tabID, info) {
    const group = Tabs._cachedTabsInGroups[tabID];
    const wasGroupTab = Tabs._cachedGroupTabs[tabID];

    if (wasGroupTab) {
      // Recreate the group in the new window
      const oldWindowID = await Windows.getIDForGroup(group);
      await Tabs.setGroup(tabID, group);
      await Tabs.setGroupTab(tabID);
      await Tabs._initTab(tabID, group, info.newWindowId);
      const tabs = await Tabs.getGroupTabs(group, oldWindowID);
      for (const tab of tabs) {
        await Tabs.moveTabIntoGroup(tab.id, tab.windowId, tab.index, group, info.newWindowId);
      }
      await Groups.collapseAllGroupsExceptCurrent(info.newWindowId);
      await Groups.collapseAllGroupsExceptCurrent(oldWindowID);
    } else if (group) {
      const windowID = await Windows.getIDForGroup(group);
      if (info.newWindowId !== windowID) {
        // Detach the tab from the group
        await Groups.removeTab(group, tabID);
      } else {
        // Probably part of a group tab move - reattach the tab to the group
        await Groups.addTab(group, await Tabs.get(tabID));
      }
    }
  },

  /**
   * @param {number} tabID
   * @param {Partial<browser.tabs.Tab>} changeInfo
   * @param {browser.tabs.Tab} tab
   * @returns
   */
  _onUpdated: async function(tabID, changeInfo, tab) {
    if (changeInfo.status !== 'complete') { return; }

    const group = await Tabs.getGroup(tabID);
    const isGroupTab = await Tabs.isGroupTab(tabID);

    if (isGroupTab) {
      await Tabs._initTab(tabID, group, tab.windowId);
    } else if (group) {
      await Tabs.sendMessage_updateTab(group, tab);
    }
  },

  /**
   * @param {number} tabID
   * @param {{windowId: number, isWindowClosing: boolean}} info
   */
  _onRemoved: async function(tabID, info) {
    if (tabID in Tabs._cachedGroupTabs) {
      await Groups.remove(Tabs._cachedGroupTabs[tabID], info.windowId);
    } else if (tabID in Tabs._cachedTabsInGroups) {
      await Groups.removeTab(Tabs._cachedTabsInGroups[tabID], tabID);
    }

    delete Tabs._cachedGroupTabs[tabID];
    delete Tabs._cachedTabsInGroups[tabID];
  },
  // END: Listeners

  // START: Tags
  /**
   * @param {number} tabID
   * @param {string} group
   */
  setGroup: async function(tabID, group) {
    Tabs._cachedTabsInGroups[tabID] = group;
    await browser.sessions.setTabValue(tabID, 'group', group);
  },

  /**
   * @param {string} group
   * @param {number} tabID
   * @returns {Promise<void>}
   */
  removeGroup: async function(group, tabID) {
    delete Tabs._cachedTabsInGroups[tabID];
    if (group != null && Tabs._cachedLastActiveTab[group] === tabID) {
      Tabs._cachedLastActiveTab[group] = null;
    }

    await new Promise((resolve) => {
      browser.sessions.removeTabValue(tabID, 'group').then(() => resolve(), () => resolve());
    });
    await Tabs.show(tabID);

    const tab = await Tabs.get(tabID);
    if (tab != null) {
      Tabs.moveTabOutOfOtherGroups(tab.id, tab.windowId, tab.index, null);
    }
  },

  /**
   * @param {number|null} tabID
   * @returns {Promise<string|null>}
   */
  getGroup: async function(tabID) {
    if (tabID == null) { return Promise.resolve(null); }

    return new Promise((resolve) => {
      // @ts-ignore
      browser.sessions.getTabValue(tabID, 'group').then((value) => resolve(value), () => resolve(null));
    });
  },

  /**
   * @param {number} tabID
   */
  setGroupTab: async function(tabID) {
    await browser.sessions.setTabValue(tabID, 'group-tab', true);
  },

  /**
   * @param {number} tabID
   * @returns {Promise<boolean>}
   */
  isGroupTab: async function(tabID) {
    return new Promise((resolve) => {
      // @ts-ignore
      browser.sessions.getTabValue(tabID, 'group-tab').then((value) => resolve(value === true), () => resolve(false));
    });
  },

  /**
   * @param {number} tabID
   * @returns {Promise<void>}
   */
  unsetGroupTab: async function(tabID) {
    delete Tabs._cachedGroupTabs[tabID];
    return new Promise((resolve) => {
      browser.sessions.removeTabValue(tabID, 'group-tab').then(() => resolve(), () => resolve());
    });
  },

  /**
   * @param {number} tabID
   * @param {boolean} value
   */
  setShouldInheritGroup: async function(group, windowID, value) {
    const groupTab = await Tabs.getGroupTab(group, windowID);
    await browser.sessions.setTabValue(groupTab.id, 'should-inherit-group', value);
  },

  getShouldInheritGroup: async function(group, windowID) {
    const groupTab = await Tabs.getGroupTab(group, windowID);
    if (groupTab == null) { return Promise.resolve(null); }
    return new Promise((resolve) => {
      browser.sessions.getTabValue(groupTab.id, 'should-inherit-group').then((value) => resolve(value ?? false), () => resolve(false));
    });
  },
  // END: Tags

  // START: Generics
  /**
   * @param {number} tabID
   * @returns {Promise<browser.tabs.Tab|null>}
   */
  get: async function(tabID) {
    return new Promise((resolve) => {
      browser.tabs.get(tabID).then((value) => resolve(value), () => resolve(null));
    });
  },

  /**
   * @param {number} tabID
   * @returns {Promise<void>}
   */
  remove: async function(tabID) {
    if (tabID in Tabs._cachedGroupTabs) { delete Tabs._cachedGroupTabs[tabID]; }
    if (tabID in Tabs._cachedTabsInGroups) { delete Tabs._cachedTabsInGroups[tabID]; }

    const group = await Tabs.getGroup(tabID);
    if (group != null && group in Tabs._cachedLastActiveTab && Tabs._cachedLastActiveTab[group] === tabID) { delete Tabs._cachedLastActiveTab[group]; }

    return await browser.tabs.remove(tabID);
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
  hide: async function(tabID) {
    return new Promise((resolve) => {
      browser.tabs.hide(tabID).then(() => resolve(), () => resolve());
    });
  },

  /**
   * @param {number} windowID
   * @returns {Promise<browser.tabs.Tab[]>}
   */
  getSelected: async function(windowID) {
    return await browser.tabs.query({windowId: windowID, highlighted: true});
  },

  /**
   * @param {number} tabID
   */
  highlight: async function(tabID) {
    await browser.tabs.update(tabID, {highlighted: true, active: false});
  },

  /**
   * @param {number} tabID
   */
  activate: async function(tabID) {
    await browser.tabs.update(tabID, {active: true});
  },

  /**
   * @param {number} tabID
   * @param {number} index
   */
  move: async function(tabID, index) {
    await browser.tabs.move(tabID, {index: index});
  },

  /**
   * @param {string} group
   * @param {number} windowID
   * @param {boolean} includeGroupTab
   * @returns {Promise<browser.tabs.Tab[]>}
   */
  getGroupTabs: async function(group, windowID, includeGroupTab = false) {
    const tabs = await Windows.getAllTabsIn(windowID);

    const retval = [];
    for (const tab of tabs) {
      const tabGroup = await Tabs.getGroup(tab.id);
      const isGroupTab = await Tabs.isGroupTab(tab.id);
      if (tabGroup === group && (includeGroupTab || !isGroupTab)) {
        retval.push(tab);
      }
    }

    return retval;
  },

  /**
   * @param {number} windowID
   * @returns {Promise<browser.tabs.Tab>}
   */
  getActive: async function(windowID) {
    return (await browser.tabs.query({windowId: windowID, active: true}))[0];
  },

  /**
   * @param {number} windowID
   * @returns {Promise<string|null>}
   */
  getCurrentGroup: async function(windowID) {
    return await Tabs.getGroup((await Tabs.getActive(windowID)).id);
  },

  getGroupTab: async function(group, windowID) {
    const tabs = await Windows.getAllTabsIn(windowID);
    for (const tab of tabs) {
      const tabGroup = await Tabs.getGroup(tab.id);
      const isGroupTab = await Tabs.isGroupTab(tab.id);
      if (group === tabGroup && isGroupTab) {
        return tab;
      }
    }
    return null;
  },
  // END: Generics

  // START: Movement
  /**
   * @param {number} tabID
   * @param {number} currentWindowID
   * @param {number} tabIndex
   * @param {string} group
   * @param {number} windowID
   * @returns {Promise<void>}
   */
  moveTabIntoGroup: async function(tabID, currentWindowID, tabIndex, group, windowID) {
    const data = await Tabs.getGroupIndexSpan(group, windowID, true, [tabID]);
    if (data == null) { return; }

    if (currentWindowID !== windowID) {
      await Windows.moveTabTo(tabID, windowID, data.max + 1);
    } else if (tabIndex < data.min) {
      await Tabs.move(tabID, data.min);
    } else if (tabIndex > data.max + 1) {
      await Tabs.move(tabID, data.max + 1);
    }
  },

  /**
   * @param {number} tabID
   * @param {number} windowID
   * @param {number} index
   * @param {string} except The group to ignore
   * @returns {Promise<number>}
   */
  moveTabOutOfOtherGroups: async function(tabID, windowID, index, except) {
    const groups = await Windows.getAllGroupsIn(windowID);

    for (const group of groups) {
      if (group === except) { continue; }

      const data = await Tabs.getGroupIndexSpan(group, windowID, true);
      if (data == null) { continue; }

      if (index >= data.min && index <= data.max) {
        await Tabs.move(tabID, data.max);
        return data.max;
      }
    }

    return index;
  },
  // END: Movement

  // START: Messaging
  /**
   * @param {string} group
   * @param {Record<string, any>} msg
   */
  _sendMessage: async function(group, msg) {
    if (group in Tabs._tabs) {
      Tabs._tabs[group].port.postMessage(msg);
    }
  },

  /**
   * @param {string} group
   * @param {browser.tabs.Tab[]} tabs
   * @param {number} windowID
   */
  sendMessage_init: async function(group, tabs, windowID) {
    await Tabs._sendMessage(group, {action: 'init', group: group, tabs: tabs, windowID: windowID, inheritGroup: await Tabs.getShouldInheritGroup(group, windowID)});
  },

  /**
   * @param {string} group
   */
  sendMessage_rename: async function(group) {
    await Tabs._sendMessage(group, {action: 'rename', group: group});
  },

  /**
   * @param {string} group
   * @param {browser.tabs.Tab} tab
   */
  sendMessage_newTab: async function(group, tab) {
    await Tabs._sendMessage(group, {action: 'newTab', tab: tab});
  },

  /**
   * @param {string} group
   * @param {browser.tabs.Tab} tab
   */
  sendMessage_updateTab: async function(group, tab) {
    await Tabs._sendMessage(group, {action: 'updateTab', tab: tab});
  },

  /**
   * @param {string} group
   * @param {number} tabID
   */
  sendMessage_removeTab: async function(group, tabID) {
    await Tabs._sendMessage(group, {action: 'removeTab', tabID: tabID});
  },

  /**
   * @param {string} group
   * @param {string|string[]} errors
   */
  sendMessage_errors: async function(group, errors) {
    await Tabs._sendMessage(group, {action: 'errors', errors: Array.isArray(errors) ? errors : [errors]});
  },

  /**
   * @param {string} group
   * @param {browser.tabs.Tab[]} tabs
   */
  sendMessage_sortTabs: async function(group, tabs) {
    await Tabs._sendMessage(group, {action: 'sortTabs', tabs: tabs});
  }
  // END: Messaging
};

/**
 * @returns {typeof Tabs}
 */
function getTabs() {
  return Tabs;
}