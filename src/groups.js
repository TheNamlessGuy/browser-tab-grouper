const Groups = {
  /**
   * When moving a tab from one window to another, it loses all its session data.
   * In order for us to be able to tell the group that the tab is no longer taking part of it, we need to cache the data.
   * @see Tabs._on.attached.
   *
   * @type {Record<number, string>} Maps tab ID to the group the tab is part of.
   */
  groupedTabCache: {},

  /**
   * @returns {Promise<void>}
   */
  init: async function() {
    const windows = await Windows.getAll();
    for (const window of windows) {
      const tabs = await Windows.getAllTabsIn(window.id);
      for (const tab of tabs) {
        const group = await Tabs.value.get.group(tab.id);
        const isGroupTab = await Tabs.value.get.isGroupTab(tab.id);

        if (isGroupTab) {
          await Groups.groupTab.init(tab.id, group, tab.windowId);
        } else {
          Groups.groupedTabCache[tab.id] = group;
        }
      }
    }
  },

  /**
   * @param {boolean|null} incognito When true, only return groups that are in incognito mode. When false, return groups that aren't incognito. When null, return all groups regardless
   * @returns {Promise<string[]>}
   */
  getAll: async function(incognito = null) {
    const retval = [];

    const windows = await Windows.getAll(incognito);
    for (const window of windows) {
      // Since group names are unique, and Windows.getAllGroupsIn returns a unique list, we don't need to do uniqueness checks here
      retval.push(...(await Windows.getAllGroupsIn(window.id)));
    }

    return retval;
  },

  /**
   * @param {string|null} group
   * @param {number} windowID
   * @param {number} index
   * @returns {Promise<string>} The name of the created group
   */
  add: async function(group, windowID, index) {
    group = group ?? await Groups._getNextFreeName();
    await Groups.groupTab.create(group, windowID, index);
    await Menus.addGroup(group);
    await Groups.collapse.allExcept(group, windowID);
    return group;
  },

  /**
   * @param {string} name
   * @returns {string[]}
   */
  checkNameValidity: async function(name) {
    const errors = [];

    if (name.length === 0) {
      errors.push('Name cannot be empty');
    }

    const windowID = await Windows.getIDForGroup(name);
    if (windowID != null) {
      errors.push(`The group name '${name}' is already taken`);
    }

    return errors;
  },

  /**
   * @param {string} oldName
   * @param {string} newName
   * @returns {Promise<void>}
   */
  rename: async function(oldName, newName) {
    await Communication.renameGroup(oldName, newName);
    await Menus.renameGroup(oldName, newName);

    const windowID = await Windows.getIDForGroup(oldName);
    const tabs = await Tabs.getTabsInGroup(oldName, windowID, true);
    for (const tab of tabs) {
      await Tabs.value.set.group(tab.id, newName);
      Groups.groupedTabCache[tab.id] = newName;

      const isGroupTab = await Tabs.value.get.isGroupTab(tab.id);
      if (isGroupTab) {
        Groups.groupTab.cache[tab.id] = newName;
      }
    }

    Communication.send.renameGroup(newName, newName);
  },

  /**
   * @param {string} group
   * @param {number|null} [windowID]
   * @returns {Promise<void>}
   */
  remove: async function(group, windowID = null) {
    await Menus.removeGroup(group);
    await Communication.removeGroup(group);

    windowID = windowID ?? await Windows.getIDForGroup(group);
    const activeGroup = await Windows.getCurrentGroupIn(windowID);

    const tabs = await Tabs.getTabsInGroup(group, windowID);
    for (const tab of tabs) {
      await Groups.removeTabFrom(group, tab.id);
    }

    if (activeGroup === group) {
      await Groups.collapse.allExcept(null, windowID);
    } else {
      await Groups.collapse.allExceptCurrent(windowID);
    }
  },

  /**
   * @param {string} group
   * @param {BrowserTab} tab
   * @returns {Promise<void>}
   */
  addTabTo: async function(group, tab) {
    const isGroupTab = await Tabs.value.get.isGroupTab(tab.id);
    if (isGroupTab) { return; }

    const currentGroup = await Tabs.value.get.group(tab.id);
    if (currentGroup === group) {
      return;
    } else if (currentGroup != null) {
      await Groups.removeTabFrom(currentGroup, tab.id);
    }

    const windowID = await Windows.getIDForGroup(group);
    await Tabs.value.set.group(tab.id, group);
    await Tabs.move.intoGroup(tab.id);
    Communication.send.addTab(group, tab);
    await Groups.collapse.allExceptCurrent(windowID);
  },

  /**
   * @param {string} group
   * @param {number} tabID
   * @returns {Promise<void>}
   */
  removeTabFrom: async function(group, tabID) {
    if (Groups.lastActiveTab._cache[group] === tabID) {
      delete Groups.lastActiveTab._cache[group];
    }

    Communication.send.removeTab(group, tabID);
    await Tabs.value.remove.group(tabID);
    await Tabs.show(tabID);
    await Tabs.move.outOfOtherGroups(tabID);
  },

  collapse: {
    /**
     * @param {string|null} except The name of the group to not collapse, if any
     * @param {number} windowID
     * @returns {Promise<void>}
     */
    allExcept: async function(except, windowID) {
      const tabs = await Windows.getAllTabsIn(windowID);
      for (const tab of tabs) {
        const isGroupTab = await Tabs.value.get.isGroupTab(tab.id);
        if (isGroupTab) {
          await Tabs.show(tab.id);
          continue;
        }

        const group = await Tabs.value.get.group(tab.id);
        if (group == null || group === except) {
          await Tabs.show(tab.id);
        } else {
          await Tabs.hide(tab.id);
        }
      }
    },

    /**
     * @param {number} windowID
     * @returns {Promise<void>}
     */
    allExceptCurrent: async function(windowID) {
      await Groups.collapse.allExcept(await Windows.getCurrentGroupIn(windowID), windowID);
    },
  },

  lastActiveTab: {
    /**
     * @type {Record<string,number>} Maps the group to the tab ID
     */
    _cache: {}, // TODO: Once you can use tabs.query on session values, use session values instead

    /**
     * @param {string} group
     * @returns {number|null} The ID of the last active tab in the group, if any
     */
    get: function(group) {
      return Groups.lastActiveTab._cache[group] ?? null;
    },

    /**
     * @param {string} group
     * @param {number} tabID
     * @returns {void}
     */
    set: function(group, tabID) {
      Groups.lastActiveTab._cache[group] = tabID;
    },

    /**
     * @param {string} group
     * @returns {void}
     */
    remove: function(group) {
      delete Groups.lastActiveTab._cache[group];
    },
  },

  groupTab: {
    /**
     * Since we can't access session data when a tab is removed (for some dumbfuck reason),
     * we need to cache which tabs are group tabs.
     * That way, we can un-group the grouped tabs if the group tab is removed.
     * Something similar happens when you move a group tab to a new window as well.
     *
     * @type {Record<number,string>} Maps tab ID to the group
     */
    cache: {},

    /**
     * @param {string|null} group
     * @returns {string}
     */
    getURL: function(group) {
      let url = '/src/group-tab/index.html';
      if (group != null) { url += `?group=${encodeURIComponent(group)}`; }
      return browser.runtime.getURL(url);
    },

    /**
     * @param {string} group
     * @param {number} windowID
     * @param {number} index
     * @param {boolean} active
     * @returns {Promise<BrowserTab>}
     */
    create: async function(group, windowID, index, active = true) {
      const tab = await browser.tabs.create({
        url: Groups.groupTab.getURL(group),
        index: index,
        active: active,
        windowId: windowID,
      });

      await Groups.groupTab.init(tab.id, group, tab.windowId);
      return tab;
    },

    /**
     * @param {number} tabID
     * @param {string} group
     * @param {number} windowID
     * @returns {Promise<void>}
     */
    init: async function(tabID, group, windowID) {
      Groups.groupTab.cache[tabID] = group;

      await Tabs.value.initialize.group(tabID, group);
      await Tabs.value.initialize.isGroupTab(tabID, true);
      await Tabs.value.initialize.shouldKeepOpenedTabs(tabID, false);
      await Tabs.value.initialize.iconColor(tabID, 'FFFFFF');

      await Groups.groupTab.update(group, windowID, tabID);
    },

    update: async function(group, windowID = null, tabID = null) {
      windowID = windowID ?? await Windows.getIDForGroup(group);
      tabID = tabID ?? (await Groups.groupTab.get(group, windowID)).id;

      Communication.send.init(group, {
        tabs: await Tabs.getTabsInGroup(group, windowID),
        opts: {
          shouldKeepOpenedTabs: await Tabs.value.get.shouldKeepOpenedTabs(tabID),
          iconColor: await Tabs.value.get.iconColor(tabID),
          customIconURL: await Tabs.value.get.customIconURL(tabID),
        },
      });
    },

    /**
     * @param {string} group
     * @param {number|null} windowID
     * @param {number|null} except
     * @returns {Promise<BrowserTab|null>}
     */
    get: async function(group, windowID = null, except = null) {
      windowID = windowID ?? await Windows.getIDForGroup(group, except);

      const tabs = await Windows.getAllTabsIn(windowID);
      for (const tab of tabs) {
        if (except != null && tab.id === except) { continue; }

        const tabGroup = await Tabs.value.get.group(tab.id);
        const isGroupTab = await Tabs.value.get.isGroupTab(tab.id);
        if (isGroupTab && tabGroup === group) {
          return tab;
        }
      }

      return null;
    },

    /**
     * @param {number} tabID
     * @returns {Promise<void>}
     */
    deinit: async function(tabID) {
      await Tabs.value.remove.all(tabID);
      delete Groups.groupTab.cache[tabID];
    },
  },

  /**
   * @returns {Promise<string>}
   */
  _getNextFreeName: async function() {
    const groups = await Groups.getAll();

    let i = 1;
    let retval = `Group ${i}`;
    while (groups.includes(retval)) {
      i += 1;
      retval = `Group ${i}`;
    }

    return retval;
  },
};