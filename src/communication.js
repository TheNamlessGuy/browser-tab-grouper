/** BrowserPort
 * @typedef {object} BrowserPort
 * @property {string} name
 * @property {(Object) => void} postMessage
 * @property {BrowserPortOnMessage} onMessage
 */

/** BrowserPortOnMessage
 * @typedef {object} BrowserPortOnMessage
 * @property {(callback: (msg: any) => void)} addListener
 */

/** GroupTabOpts
 * @typedef {object} GroupTabOpts
 * @property {boolean} shouldKeepOpenedTabs
 * @property {boolean} promptOnClose
 * @property {boolean} automaticallyOpenCollapse
 * @property {string|null} iconColor
 * @property {string|null} customIconURL
 */

/** InitMessage
 * @typedef {object} InitMessage
 * @property {BrowserTab[]} tabs
 * @property {GroupTabOpts} opts
 */

/** RenameGroupMessage
 * @typedef {object} RenameGroupMessage
 * @property {string} newName
 */

/** AddTabMessage
 * @typedef {object} AddTabMessage
 * @property {BrowserTab} tab
 */

/** UpdateTabMessage
 * @typedef {object} UpdateTabMessage
 * @property {BrowserTab} tab
 */

/** SortTabsMessage
 * @typedef {object} SortTabsMessage
 * @property {BrowserTab[]} tabs
 */

/** RemoveTabMessage
 * @typedef {object} RemoveTabMessage
 * @property {number} tabID
 */

/** ErrorsMessage
 * @typedef {object} ErrorsMessage
 * @property {string[]} errors
 */

/** SetIconColorMessage
 * @typedef {object} SetIconColorMessage
 * @property {string} hex
 */

const Communication = {
  /**
   * @type {Object.<string, BrowserPort>}
   */
  _ports: {},
  /**
   * @type {Object.<string, [(port: BrowserPort) => void>]}
   */
  _onPortGet: {},

  /**
   * @param {string} group
   * @returns {Promise<BrowserPort>}
   */
  _getPort: function(group) {
    return new Promise((resolve) => {
      if (Communication._ports[group] != null) {
        resolve(Communication._ports[group]);
        return;
      }

      if (group in Communication._onPortGet) {
        Communication._onPortGet[group].push(resolve);
      } else {
        Communication._onPortGet[group] = [resolve];
      }
    });
  },

  /**
   * @returns {void}
   */
  init: function() {
    browser.runtime.onConnect.addListener(Communication._on.connect);
  },

  /**
   * @param {string} oldName
   * @param {string} newName
   * @returns {void}
   */
  renameGroup: function(oldName, newName) {
    const port = Communication._ports[oldName];
    port.name = newName;
    delete Communication._ports[oldName];
    Communication._ports[newName] = port;
  },

  /**
   * @param {string} group
   */
  removeGroup: function(group) {
    delete Communication._ports[group];
  },

  send: {
    /**
     * @param {string} group
     * @param {string} action
     * @param {Record<string, any>} data
     * @returns {void}
     */
    _data: async function(group, action, data) {
      const port = await Communication._getPort(group);
      if (port != null) {
        port.postMessage({action: action, ...JSON.parse(JSON.stringify(data))});
      }
    },

    /**
     * @param {string} group
     * @param {InitMessage} data
     * @returns {void}
     */
    init: function(group, data) {
      Communication.send._data(group, 'init', data);
    },

    /**
     * @param {string} group
     * @param {string} newName
     * @returns {void}
     */
    renameGroup: function(group, newName) {
      Communication.send._data(group, 'rename-group', {newName});
    },

    /**
     * @param {string} group
     * @param {BrowserTab} data
     * @returns {void}
     */
    addTab: function(group, tab) {
      Communication.send._data(group, 'add-tab', {tab});
    },

    /**
     * @param {string} group
     * @param {BrowserTab} data
     * @returns {void}
     */
    updateTab: function(group, tab) {
      Communication.send._data(group, 'update-tab', {tab});
    },

    /**
     * @param {string} group
     * @param {BrowserTab[]} tabs
     * @returns {void}
     */
    sortTabs: function(group, tabs) {
      Communication.send._data(group, 'sort-tabs', {tabs});
    },

    /**
     * @param {string} group
     * @param {number} tabID
     * @returns {void}
     */
    removeTab: function(group, tabID) {
      Communication.send._data(group, 'remove-tab', {tabID});
    },

    /**
     * @param {string} group
     * @param {string|string[]} errors
     * @returns {void}
     */
    errors: function(group, errors) {
      Communication.send._data(group, 'errors', {errors: Array.isArray(errors) ? errors : [errors]});
    },
  },

  _on: {
    /**
     * @param {BrowserPort} port
     * @returns {void}
     */
    connect: function(port) {
      Communication._ports[port.name] = port;
      port.onMessage.addListener((msg) => {
        if (msg.action in Communication._on.map) {
          Communication._on.map[msg.action](port.name, msg);
        } else {
          console.error('Unknown action gotten by Communication', {group: port.name, msg});
        }
      });

      if (port.name in Communication._onPortGet) {
        for (const resolve of Communication._onPortGet[port.name]) { resolve(port); }
        delete Communication._onPortGet[port.name];
      }
    },

    map: {
      /**
       * @param {RenameGroupMessage} msg
       * @returns {Promise<void>}
       */
      'rename-group': async function(group, msg) {
        const errors = await Groups.checkNameValidity(msg.newName);
        if (errors.length === 0) {
          await Groups.rename(group, msg.newName);
        } else {
          await Communication.send.errors(group, errors);
          await Communication.send.renameGroup(group, group); // Reset the name
        }
      },

      /**
       * @param {string} group
       * @param {SetIconColorMessage} msg
       */
      'set-icon-color': async function(group, msg) {
        const groupTab = await Groups.groupTab.get(group);
        await Tabs.value.set.iconColor(groupTab.id, msg.hex);
      },

      /**
       * @param {string} group
       * @param {*} msg
       * @returns {Promise<void>}
       */
      'highlight-tabs': async function(group, msg) {
        await Tabs.highlightTabsInGroup(group);
      },

      /**
       * @param {string} group
       * @param {{value: boolean}} msg
       */
      'set-opt--should-keep-opened-tabs': async function(group, msg) {
        const groupTab = await Groups.groupTab.get(group);
        await Tabs.value.set.shouldKeepOpenedTabs(groupTab.id, msg.value);
      },

      /**
       * @param {string} group
       * @param {{value: boolean}} msg
       */
      'set-opt--prompt-on-close': async function(group, msg) {
        const groupTab = await Groups.groupTab.get(group);
        await Tabs.value.set.promptOnClose(groupTab.id, msg.value);
      },

      /**
       * @param {string} group
       * @param {{value: boolean}} msg
       */
      'set-opt--automatically-open-collapse': async function(group, msg) {
        const groupTab = await Groups.groupTab.get(group);
        await Tabs.value.set.automaticallyOpenCollapse(groupTab.id, msg.value);
      },

      /**
       * @param {string} group
       * @param {RemoveTabMessage} msg
       * @returns {Promise<void>}
       */
      'remove-tab': async function(group, msg) {
        await Groups.removeTabFrom(group, msg.tabID);
      },

      /**
       * @param {string} group
       * @param {{tabID: number}} msg
       * @returns {Promise<void>}
       */
      'swap-to-tab': async function(group, msg) {
        await browser.tabs.update(msg.tabID, {active: true});
      },

      /**
       * @param {string} group
       * @param {{dataURL: string}} msg
       * @returns {Promise<void>}
       */
      'set-custom-icon': async function(group, msg) {
        const groupTab = await Groups.groupTab.get(group);
        await Tabs.value.set.customIconURL(groupTab.id, msg.dataURL);
      },

      /**
       * @param {string} group
       * @param {{}} msg
       * @returns {Promise<void>}
       */
      'toggle-open-collapse': async function(group, msg) {
        await Groups.open.toggle(group);
      },
    },
  },
};