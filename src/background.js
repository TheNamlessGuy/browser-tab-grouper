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

  /**
   * @param {URL} a
   * @param {URL} b
   * @returns {boolean}
   */
  urlEqual: function(a, b) {
    if (a.protocol != b.protocol) { return false; }
    if (a.host != b.host) { return false; }
    if (a.pathname != b.pathname) { return false; }

    const aParams = Object.fromEntries(a.searchParams);
    const bParams = Object.fromEntries(b.searchParams);

    const aKeys = Object.keys(aParams);
    const bKeys = Object.keys(bParams);
    if (aKeys.length != bKeys.length) { return false; }

    for (const aKey of aKeys) {
      if (!bKeys.includes(aKey)) { return false; }
      if (aParams[aKey] != bParams[aKey]) { return false; }
    }

    for (const bKey of bKeys) {
      if (!aKeys.includes(bKey)) { return false; }
    }

    return true;
  },
};

Background.main();