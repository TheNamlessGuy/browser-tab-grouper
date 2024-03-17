const Background = {
  /**
   * @returns {Promise<void>}
   */
  main: async function() {
    if (!browser.runtime.onInstalled.hasListener(Background._onInstalled)) {
      browser.runtime.onInstalled.addListener(Background._onInstalled);
    }

    Communication.init();
    await Tabs.init();
    await Groups.init();
    await Menus.init();
  },

  /**
   * @returns {Promise<void>}
   */
  reset: async function() {
    const windows = await Windows.getAll();
    for (const window of windows) {
      const tabs = await Windows.getAllTabsIn(window.id);
      for (const tab of tabs) {
        await Tabs.value.remove.all(tab.id);
        await Tabs.show(tab.id);
      }
    }
  },

  /**
   * @param {{id?: string, previousVersion?: string, reason: "install"|"update"|"browser_update"|"chrome_update"|"shared_module_update", temporary: boolean}} details https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onInstalled#details
   * @returns {Promise<void>}
   */
  _onInstalled: async function(details) {
    if (details.reason === 'install') {
      await Background.reset();
    }
  },
};

Background.main();