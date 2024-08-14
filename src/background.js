const Background = {
  /**
   * @returns {Promise<void>}
   */
  main: async function() {
    Communication.init();
    await Runtime.init();
    await Tabs.init();
    await Groups.init();
    await Menus.init();
  },
};

Background.main();