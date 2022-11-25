const Windows = {
  // START: Generics
  /**
   * @returns {Promise<browser.windows.Window[]>}
   */
  getAll: async function() {
    return await browser.windows.getAll();
  },

  /**
   * @param {number} windowID
   * @returns {Promise<browser.tabs.Tab[]>}
   */
  getAllTabsIn: async function(windowID) {
    return await browser.tabs.query({windowId: windowID});
  },

  /**
   * @param {number} windowID
   * @returns {Promise<string[]>}
   */
  getAllGroupsIn: async function(windowID) {
    const tabs = await Windows.getAllTabsIn(windowID);

    const retval = [];
    for (const tab of tabs) {
      const group = await Tabs.getGroup(tab.id);
      if (group != null && !retval.includes(group)) {
        retval.push(group);
      }
    }

    return retval;
  },

  /**
   * @param {number} tabID
   * @param {number} windowID
   * @param {number} index
   * @returns {Promise<browser.tabs.Tab>}
   */
  moveTabTo: async function(tabID, windowID, index) {
    // @ts-ignore
    return await browser.tabs.move(tabID, {windowId: windowID, index: index});
  },
  // END: Generics

  reset: async function() {
    const windows = await Windows.getAll();

    for (const window of windows) {
      const tabs = await Windows.getAllTabsIn(window.id);

      for (const tab of tabs) {
        await Tabs.removeGroup(tab.id);
        await browser.sessions.removeTabValue(tab.id, 'group-tab');
      }
    }
  },
};

function getWindows() {
  return Windows;
}