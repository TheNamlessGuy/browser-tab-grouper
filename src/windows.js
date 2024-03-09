/** BrowserWindow
 * @typedef {object} BrowserWindow https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/windows/Window
 * @property {number} id
 */

const Windows = {
  /**
   * @returns {Promise<BrowserWindow[]>}
   */
  getAll: async function() {
    return await browser.windows.getAll();
  },

  /**
   * @param {number} windowID
   * @returns {Promise<BrowserTab[]>}
   */
  getAllTabsIn: async function(windowID) {
    return await browser.tabs.query({windowId: windowID});
  },

  /**
   * @param {number} windowID
   * @returns {Promise<string[]>}
   */
  getAllGroupsIn: async function(windowID) {
    const retval = [];

    const tabs = await Windows.getAllTabsIn(windowID);
    for (const tab of tabs) {
      const group = await Tabs.value.get.group(tab.id);
      if (group != null && !retval.includes(group)) {
        retval.push(group);
      }
    }

    return retval;
  },

  /**
   * @param {number} windowID
   * @returns {string|null}
   */
  getCurrentGroupIn: async function(windowID) {
    const tab = (await browser.tabs.query({windowId: windowID, active: true}))[0];
    return await Tabs.value.get.group(tab.id);
  },

  /**
   * Returns the ID of the window the group tab is in. If there is no group tab (uh oh!), return a window with at least one regular grouped tab in it (if any).
   *
   * @param {string} group
   * @returns {Promise<number|null>}
   */
  getIDForGroup: async function(group) {
    let backup = null;

    const windows = await Windows.getAll();
    for (const window of windows) {
      const tabs = await Windows.getAllTabsIn(window.id);
      for (const tab of tabs) {
        const tabGroup = await Tabs.value.get.group(tab.id);
        const isGroupTab = await Tabs.value.get.isGroupTab(tab.id);

        if (tabGroup === group) {
          if (isGroupTab) {
            return window.id;
          }

          backup = window.id;
        }
      }
    }

    return backup;
  },
};