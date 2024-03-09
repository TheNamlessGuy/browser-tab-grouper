const Background = {
  /**
   * @returns {Promise<void>}
   */
  main: async function() {
    Communication.init();
    await Tabs.init();
    await Groups.init();
    await Menus.init();
  },
};

Background.main();

async function reset() { // For debugging purposes - should never be used live
  const windows = await Windows.getAll();
  for (const window of windows) {
    const tabs = await Windows.getAllTabsIn(window.id);
    for (const tab of tabs) {
      await Tabs.value.remove.all(tab.id);
      await Tabs.show(tab.id);
    }
  }
}