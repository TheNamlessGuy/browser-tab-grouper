const Groups = {
  /**
   * @param {string} group
   * @param {number} windowID
   * @param {number} index
   */
  add: async function(group, windowID, index) {
    await Tabs.createGroupTab(group, windowID, index);
    await Menus.addGroup(group);

    await Groups.setActive(group, windowID);
  },

  /**
   * @param {string} group
   * @param {number} windowID
   */
  remove: async function(group, windowID) {
    const activeGroup = await Tabs.getCurrentGroup(windowID);

    const tabs = await Tabs.getGroupTabs(group, windowID);
    for (const tab of tabs) {
      await Tabs.removeGroup(tab.id);
    }

    if (activeGroup === group) {
      await Groups.setActive(null, windowID);
    } else {
      await Groups.collapseAllGroupsExceptCurrent(windowID);
    }

    await Menus.removeGroup(group);
  },

  /**
   * @param {string} group
   * @param {browser.tabs.Tab} tab
   * @returns {Promise<void>}
   */
  addTab: async function(group, tab) {
    const isGroupTab = await Tabs.isGroupTab(tab.id);
    if (isGroupTab) { return; }

    const currentGroup = await Tabs.getGroup(tab.id);
    if (currentGroup != null) {
      if (currentGroup === group) {
        return;
      } else {
        await Groups.removeTab(group, tab.id);
      }
    }

    const windowID = await Windows.getIDForGroup(group);
    await Tabs.moveTabIntoGroup(tab.id, tab.windowId, tab.index, group, windowID);
    await Tabs.setGroup(tab.id, group);
    await Tabs.sendMessage_newTab(group, tab);
    await Groups.collapseAllGroupsExceptCurrent(windowID);
  },

  /**
   * @param {string} group
   * @param {number} tabID
   */
  removeTab: async function(group, tabID) {
    await Tabs.removeGroup(tabID);
    await Tabs.sendMessage_removeTab(group, tabID);
  },

  /**
   * @param {string} oldName
   * @param {string} newName
   * @param {number} windowID
   */
  rename: async function(oldName, newName, windowID) {
    await Tabs.renameGroup(oldName, newName, windowID);
    await Menus.renameGroup(oldName, newName);
  },

  /**
   * @returns {Promise<string>}
   */
  getNextFreeName: async function() {
    const groups = await Groups.getAll();

    let i = 1;
    let retval = 'Group ' + i;
    while (groups.includes(retval)) {
      i += 1;
      retval = 'Group ' + i;
    }

    return retval;
  },

  /**
   * @param {string} group
   * @param {number} windowID
   */
  setActive: async function(group, windowID) {
    await Groups.collapseAllGroupsExcept(group, windowID);
  },

  /**
   * @param {number} windowID
   */
  collapseAllGroupsExceptCurrent: async function(windowID) {
    await Groups.collapseAllGroupsExcept(await Tabs.getCurrentGroup(windowID), windowID);
  },

  /**
   * @param {string} except Group to except
   * @param {number} windowID
   */
  collapseAllGroupsExcept: async function(except, windowID) {
    const tabs = await Windows.getAllTabsIn(windowID);

    for (const tab of tabs) {
      const isGroupTab = await Tabs.isGroupTab(tab.id);
      if (isGroupTab) {
        await Tabs.show(tab.id);
        continue;
      }

      const group = await Tabs.getGroup(tab.id);
      if (group == null || group === except) {
        await Tabs.show(tab.id);
      } else {
        await Tabs.hide(tab.id);
      }
    }
  },

  /**
   * @returns {Promise<string[]>}
   */
  getAll: async function() {
    const windows = await Windows.getAll();

    const retval = [];
    for (const window of windows) {
      const groups = await Windows.getAllGroupsIn(window.id);
      for (const group of groups) {
        if (!retval.includes(group)) {
          retval.push(group);
        }
      }
    }

    return retval;
  },
};

/**
 * @returns {typeof Groups}
 */
function getGroups() {
  return Groups;
}