/** GroupTabOpts
 * @typedef {object} GroupTabOpts
 * @property {boolean} shouldKeepOpenedTabs
 * @property {boolean} promptOnClose
 * @property {boolean} rememberLastActiveTab
 * @property {boolean} automaticallyOpenCollapse
 * @property {string|null} iconColor
 * @property {string|null} customIconURL
 */

/** Message
 * @typedef {InitMessage|RenameGroupMessage|AddTabMessage|UpdateTabMessage|SortTabsMessage|RemoveTabMessage|ErrorsMessage|SetIconColorMessage|SwapToTabMessage|SetCustomIconMessage|ToggleOpenCollapseMessage} Message
 */

/** InitMessageData
 * @typedef {object} InitMessageData
 * @property {browser.tabs.Tab[]} tabs
 * @property {GroupTabOpts} opts
 */
/** InitMessage
 * @typedef {InitMessageData & {action: 'init'}} InitMessage
 */

/** RenameGroupMessageData
 * @typedef {object} RenameGroupMessageData
 * @property {string} newName
 */
/** RenameGroupMessage
 * @typedef {RenameGroupMessageData & {action: 'rename-group'}} RenameGroupMessage
 */

/** AddTabMessageData
 * @typedef {object} AddTabMessageData
 * @property {browser.tabs.Tab} tab
 */
/** RenameGroupMessage
 * @typedef {AddTabMessageData & {action: 'add-tab'}} AddTabMessage
 */

/** UpdateTabMessageData
 * @typedef {object} UpdateTabMessageData
 * @property {browser.tabs.Tab} tab
 */
/** UpdateTabMessage
 * @typedef {AddTabMessageData & {action: 'update-tab'}} UpdateTabMessage
 */

/** SortTabsMessageData
 * @typedef {object} SortTabsMessageData
 * @property {browser.tabs.Tab[]} tabs
 */
/** SortTabsMessage
 * @typedef {SortTabsMessageData & {action: 'sort-tabs'}} SortTabsMessage
 */

/** RemoveTabMessageData
 * @typedef {object} RemoveTabMessageData
 * @property {number} tabID
 */
/** RemoveTabMessage
 * @typedef {RemoveTabMessageData & {action: 'remove-tab'}} RemoveTabMessage
 */

/** ErrorsMessageData
 * @typedef {object} ErrorsMessageData
 * @property {string[]} errors
 */
/** ErrorsMessage
 * @typedef {ErrorsMessageData & {action: 'errors'}} ErrorsMessage
 */

/** SetIconColorMessageData
 * @typedef {object} SetIconColorMessageData
 * @property {string} hex
 */
/** SetIconColorMessage
 * @typedef {SetIconColorMessageData & {action: 'set-icon-color'}} SetIconColorMessage
 */

/** SetCustomIconMessageData
 * @typedef {object} SetCustomIconMessageData
 * @property {string} dataURL
 */
/** SetCustomIconMessage
 * @typedef {SetCustomIconMessageData & {action: 'set-custom-icon'}} SetCustomIconMessage
 */

/** SwapToTabMessageData
 * @typedef {object} SwapToTabMessageData
 * @property {number} tabID
 */
/** SwapToTabMessage
 * @typedef {SwapToTabMessageData & {action: 'swap-to-tab'}} SwapToTabMessage
 */

/** ToggleOpenCollapseMessage
 * @typedef {{action: 'toggle-open-collapse'}} ToggleOpenCollapseMessage
 */

const Communication = {
  /**
   * @type {{[groupName: string]: browser.runtime.Port}}
   */
  _ports: {},
  /**
   * @type {{[groupName: string]: ((port: browser.runtime.Port) => void)[]}}
   */
  _onPortGet: {},

  /**
   * @param {string} group
   * @param {number} [timeout=60000] How long to wait for a timeout in milliseconds
   * @returns {Promise<browser.runtime.Port|null>}
   */
  _getPort: function(group, timeout = 60000) {
    return new Promise((resolve) => {
      if (Communication._ports[group] != null) {
        resolve(Communication._ports[group]);
        return;
      }

      const timeoutID = setTimeout(() => {
        if (group in Communication._onPortGet) {
          delete Communication._onPortGet[group];
        }

        resolve(null);
      }, timeout);

      const wrapped = (port) => {
        clearTimeout(timeoutID);
        resolve(port);
      };

      if (group in Communication._onPortGet) {
        Communication._onPortGet[group].push(wrapped);
      } else {
        Communication._onPortGet[group] = [wrapped];
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
    if (port == null) { return; }
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
     * @param {{[key: string]: any}} data
     * @returns {Promise<void>}
     */
    _data: async function(group, action, data) {
      const port = await Communication._getPort(group);
      if (port != null) {
        port.postMessage({action: action, ...JSON.parse(JSON.stringify(data))});
      }
    },

    /**
     * @param {string} group
     * @param {InitMessageData} data
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
     * @param {browser.tabs.Tab} tab
     * @returns {void}
     */
    addTab: function(group, tab) {
      Communication.send._data(group, 'add-tab', {tab});
    },

    /**
     * @param {string} group
     * @param {browser.tabs.Tab} tab
     * @returns {void}
     */
    updateTab: function(group, tab) {
      Communication.send._data(group, 'update-tab', {tab});
    },

    /**
     * @param {string} group
     * @param {browser.tabs.Tab[]} tabs
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
     * @param {browser.runtime.Port} port
     * @returns {void}
     */
    connect: function(port) {
      Communication._ports[port.name] = port;
      port.onMessage.addListener(/** @param {Message} msg */ (msg) => {
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
      'set-opt--remember-last-active-tab': async function(group, msg) {
        const groupTab = await Groups.groupTab.get(group);
        await Tabs.value.set.rememberLastActiveTab(groupTab.id, msg.value);
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
       * @param {SwapToTabMessage} msg
       * @returns {Promise<void>}
       */
      'swap-to-tab': async function(group, msg) {
        await browser.tabs.update(msg.tabID, {active: true});
      },

      /**
       * @param {string} group
       * @param {SetCustomIconMessage} msg
       * @returns {Promise<void>}
       */
      'set-custom-icon': async function(group, msg) {
        const groupTab = await Groups.groupTab.get(group);
        await Tabs.value.set.customIconURL(groupTab.id, msg.dataURL);
      },

      /**
       * @param {string} group
       * @param {ToggleOpenCollapseMessage} msg
       * @returns {Promise<void>}
       */
      'toggle-open-collapse': async function(group, msg) {
        await Groups.open.toggle(group);
      },
    },
  },
};
