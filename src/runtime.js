const Runtime = {
  /**
   * @returns {Promise<void>}
   */
  init: async function() {
    if (!browser.runtime.onInstalled.hasListener(Runtime._on.installed)) {
      browser.runtime.onInstalled.addListener(Runtime._on.installed);
    }

    // Runtime.init will always be called when the plugin is started, regardless of if the user flipped the enabled/disabled switch or if the browser itself restarted
    await Runtime._recreateMissingGroupTabs();
  },

  _on: {
    /**
     * @param {{id?: string, previousVersion?: string, reason: "install"|"update"|"browser_update"|"chrome_update"|"shared_module_update", temporary: boolean}} details https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/runtime/onInstalled#details
     * @returns {Promise<void>}
     */
    installed: async function(details) {
      if (details.reason === 'install') {
        await Runtime._reset();
      }
    },
  },

  /**
   * Creates group tabs for groups that have no group tabs
   *
   * @returns {Promise<void>}
   */
  _recreateMissingGroupTabs: async function() {
    const windows = await Windows.getAll();
    for (const window of windows) {
      const groups = await Windows.getAllGroupsIn(window.id);
      for (const group of groups) {
        const groupTab = await Groups.groupTab.get(group, window.id);
        if (groupTab != null) { continue; }

        // The group has no group tab, create a new one
        Communication.removeGroup(group); // If there is a cached port for the group tab, don't use it
        const span = await Tabs.getGroupIndexSpan(group, window.id, false);
        if (span != null) {
          await Groups.groupTab.create(group, window.id, span.min, false);
          await Communication.send.errors(group, ['Group tab had to be restored, some settings may have been lost. Due to how Firefox seems to work (currently), this seems to be expected behavior when the plugin updates. If you see this error under any other circumstances, please leave a comment <a href="https://github.com/TheNamlessGuy/browser-tab-grouper/issues/4">here</a>']);
        }
      }

      await Groups.collapse.allExceptCurrent(window.id);
    }
  },

  /**
   * Resets all the tab values and hidden statuses
   *
   * @returns {Promise<void>}
   */
  _reset: async function() {
    const windows = await Windows.getAll();
    for (const window of windows) {
      const tabs = await Windows.getAllTabsIn(window.id);
      for (const tab of tabs) {
        await Tabs.value.remove.all(tab.id);
        await Tabs.show(tab.id);
      }
    }
  },
}