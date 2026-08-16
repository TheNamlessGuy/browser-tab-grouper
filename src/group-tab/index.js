const BackgroundPage = {
  /**
   * @type {browser.runtime.Port|null}
   */
  _port: null,

  /**
   * @returns {void}
   */
  init: function() {
    BackgroundPage._port = browser.runtime.connect({name: Group.get()});
    BackgroundPage._port.onMessage.addListener(BackgroundPage._on.message);
  },

  send: {
    /**
     * @param {string} action
     * @param {{[key: string]: any}} extras
     * @returns {void}
     */
    action: function(action, extras = {}) {
      Errors.clear();
      BackgroundPage._port.postMessage({action: action, ...JSON.parse(JSON.stringify(extras))});
    },

    /**
     * @param {RenameGroupMessageData} data
     * @returns {void}
     */
    rename: function(data) {
      BackgroundPage.send.action('rename-group', data);
    },

    /**
     * @param {SetIconColorMessageData} data
     * @returns {void}
     */
    setIconColor: function(data) {
      BackgroundPage.send.action('set-icon-color', data);
    },

    /**
     * @returns {void}
     */
    highlightTabs: function() {
      BackgroundPage.send.action('highlight-tabs');
    },

    /**
     * @param {boolean} value
     * @returns {void}
     */
    setShouldKeepOpenedTabs: function(value) {
      BackgroundPage.send.action('set-opt--should-keep-opened-tabs', {value});
    },

    /**
     * @param {boolean} value
     * @returns {void}
     */
    setPromptOnClose: function(value) {
      BackgroundPage.send.action('set-opt--prompt-on-close', {value});
    },

    /**
     * @param {boolean} value
     * @returns {void}
     */
    rememberLastActiveTab: function(value) {
      BackgroundPage.send.action('set-opt--remember-last-active-tab', {value});
    },

    /**
     * @param {boolean} value
     * @returns {void}
     */
    automaticallyOpenCollapse: function(value) {
      BackgroundPage.send.action('set-opt--automatically-open-collapse', {value});
    },

    /**
     * @param {RemoveTabMessageData} data
     * @returns {void}
     */
    removeTab: function(data) {
      BackgroundPage.send.action('remove-tab', data);
    },

    /**
     * @param {SwapToTabMessageData} data
     * @returns {void}
     */
    swapToTab: function(data) {
      BackgroundPage.send.action('swap-to-tab', data);
    },

    /**
     * @param {SetCustomIconMessageData} data
     * @returns {void}
     */
    setCustomIcon: function(data) {
      BackgroundPage.send.action('set-custom-icon', data);
    },

    /**
     * @returns {void}
     */
    toggleOpenCollapse: function() {
      BackgroundPage.send.action('toggle-open-collapse');
    },
  },

  _on: {
    /**
     * @param {Message} msg
     */
    message: function(msg) {
      if (msg.action in Actions) {
        Actions[msg.action](msg);
      } else {
        console.error('Unknown action gotten by tab group', {group: Group.get(), msg});
      }
    },
  },
};

const Errors = {
  /**
   * @returns {void}
   */
  clear: function() {
    const container = Elements.errorContainer();
    while (container.children.length > 0) {
      container.children[0].remove();
    }

    Icon.update();
  },

  /**
   * @param {string} error
   * @param {boolean} updateIcon
   * @returns {void}
   */
  add: function(error, updateIcon = true) {
    const element = /** @type {CustomErrorElement} */ (document.createElement('c-error'));
    element.message = error;
    element.addEventListener('removed', function() {
      if (Errors.count() === 0) {
        Icon.update();
      }
    });
    Elements.errorContainer().append(element);

    if (updateIcon) {
      Icon.update();
    }
  },

  /**
   * @param {string[]} errors
   * @returns {void}
   */
  addAll: function(errors) {
    for (const error of errors) {
      Errors.add(error, false);
    }

    Icon.update();
  },

  /**
   * @returns {number}
   */
  count: function() {
    return Elements.errorContainer().children.length;
  },
};

const Group = {
  /**
   * @returns {string}
   */
  get: function() {
    const group = new URL(window.location.href).searchParams.get('group');
    return group == null ? null : decodeURIComponent(group);
  },

  /**
   * @param {string} group
   * @param {boolean} [pushToBackend=true]
   * @param {boolean} [force=false]
   * @returns {void}
   */
  set: function(group, pushToBackend = true, force = false) {
    if (!force && Group.get() === group) { return; }

    document.title = (!!group) ? group : 'No group name';
    Elements.nameInput().value = group;
    Group.setInputWidth();

    const url = new URL(window.location.href);
    url.searchParams.set('group', group);
    window.history.replaceState(null, null, url);

    if (pushToBackend) {
      BackgroundPage.send.rename({newName: group});
    }
  },

  /**
   * @returns {void}
   */
  update: function() {
    const newValue = Elements.nameInput().value.trim();
    const oldValue = Group.get();

    if (newValue !== oldValue) {
      Group.set(newValue);
    }
  },

  /**
   * @returns {void}
   */
  setInputWidth: function() {
    const element = Elements.nameInput();
    const value = element.value.length < 10 ? 10 : element.value.length;
    element.style.width = `${value}ch`;
  },
};

const FrontendTabs = {
  /**
   * @param {number} tabID
   * @returns {string}
   */
  _id: function(tabID) {
    return `tab--${tabID}`;
  },

  /**
   * @param {browser.tabs.Tab} tab
   * @returns {void}
   */
  add: function(tab) {
    const id = FrontendTabs._id(tab.id);
    if (Elements.tab(id) != null) { // We're already displaying this tab
      return;
    }

    const element = /** @type {CustomTabElement} */ (document.createElement('c-tab'));
    element.id = id;
    element.setTabData(tab);
    element.addEventListener('remove-me', () => BackgroundPage.send.removeTab({tabID: tab.id}));
    element.addEventListener('swap-to-me', () => BackgroundPage.send.swapToTab({tabID: tab.id}));
    Elements.tabContainer().append(element);
  },

  /**
   * @param {browser.tabs.Tab} tab
   * @returns {void}
   */
  update: function(tab) {
    const element = Elements.tab(FrontendTabs._id(tab.id));
    if (element != null) {
      element.setTabData(tab);
    }
  },

  /**
   * @param {number[]} order A list of tab IDs sorted in the correct order
   * @returns {void}
   */
  sort: function(order) {
    const container = Elements.tabContainer();
    for (const tabID of order) {
      container.append(Elements.tab(FrontendTabs._id(tabID)));
    }
  },

  /**
   * @param {number} tabID
   * @returns {void}
   */
  remove: function(tabID) {
    const element = Elements.tab(FrontendTabs._id(tabID));
    if (element != null) {
      element.remove();
    }
  },

  /**
   * @returns {void}
   */
  removeAll: function() {
    const container = Elements.tabContainer();
    while (container.children.length > 0) {
      container.children[0].remove();
    }
  },
};

const Actions = {
  /**
   * @param {ErrorsMessage} msg
   * @returns {void}
   */
  'errors': function(msg) {
    Errors.addAll(msg.errors);
  },

  /**
   * @param {InitMessage} msg
   * @returns {void}
   */
  'init': function(msg) {
    Elements.shouldKeepOpenedTabs().checked = msg.opts.shouldKeepOpenedTabs;
    Elements.promptOnClose().checked = msg.opts.promptOnClose;
    Elements.rememberLastActiveTab().checked = msg.opts.rememberLastActiveTab;
    Elements.automaticallyOpenCollapse().checked = msg.opts.automaticallyOpenCollapse;
    Elements.openCollapsegroupBtn().classList.toggle('hidden', msg.opts.automaticallyOpenCollapse);

    FrontendTabs.removeAll();
    for (const tab of msg.tabs) {
      FrontendTabs.add(tab);
    }

    Icon._customIconURL = msg.opts.customIconURL;
    Icon.color.set(msg.opts.iconColor, false);
    Icon.update();
  },

  /**
   * @param {RenameGroupMessage} msg
   * @returns {void}
   */
  'rename-group': function(msg) {
    Group.set(msg.newName, false);
  },

  /**
   * @param {AddTabMessage} msg
   * @returns {void}
   */
  'add-tab': function(msg) {
    FrontendTabs.add(msg.tab);
  },

  /**
   * @param {UpdateTabMessage} msg
   * @returns {void}
   */
  'update-tab': function(msg) {
    FrontendTabs.update(msg.tab);
  },

  /**
   * @param {SortTabsMessage} msg
   * @returns {void}
   */
  'sort-tabs': function(msg) {
    FrontendTabs.sort(msg.tabs.map(tab => tab.id));
  },

  /**
   * @param {RemoveTabMessage} msg
   * @returns {void}
   */
  'remove-tab': function(msg) {
    FrontendTabs.remove(msg.tabID);
  },
};

const Icon = {
  /**
   * @type {string|null}
   */
  _customIconURL: null,

  /**
   * @returns {void}
   */
  init: function() {
    const picker = Elements.tabIconColor();
    picker.addEventListener('change', () => {
      Icon.color.set(Icon.color.get.hex(), true);
      Icon.update();
    });
  },

  get: {
    /**
     * @param {string} url
     * @returns {Promise<HTMLImageElement>}
     */
    _imageFromURL: function(url) {
      return new Promise((resolve) => {
        const img = document.createElement('img');
        img.addEventListener('load', () => resolve(img));
        img.src = url;
      });
    },

    /**
     * @returns {Promise<HTMLImageElement>}
     */
    default: async function() {
      return Icon.get._imageFromURL('/res/icons/16.png');
    },

    /**
     * @returns {Promise<HTMLImageElement|null>}
     */
    custom: async function() {
      if (Icon._customIconURL == null) {
        return null;
      }

      return Icon.get._imageFromURL(Icon._customIconURL);
    },
  },

  /**
   * @param {HTMLImageElement} img
   * @returns {void}
   */
  _set: function(img) {
    Elements.pageIcon().href = img.src;
  },

  /**
   * @returns {Promise<void>}
   */
  update: async function() {
    let img = await Icon.get.default();
    img = Icon._tint(img);
    img = await Icon._overlayCustomIcon(img);
    img = Icon._overlayNotification(img);
    Icon._set(img);
  },

  color: {
    get: {
      /**
       * @returns {string}
       */
      hex: function() {
        return Elements.tabIconColor().value.substring(1); // Remove preceeding #
      },

      /**
       * Thanks stack overflow :)
       * https://stackoverflow.com/a/11508164
       *
       * @returns {{r: number, g: number, b: number}}
       */
      rgb: function() {
        const bigint = parseInt(Icon.color.get.hex(), 16);
        return {
          r: (bigint >> 16) & 255,
          g: (bigint >> 8) & 255,
          b: bigint & 255,
        };
      },
    },

    /**
     * @param {string} hex
     * @param {boolean} push
     * @returns {void}
     */
    set: function(hex, push) {
      hex = hex ?? 'FFFFFF';
      Elements.tabIconColor().value = `#${hex}`;

      if (push) {
        BackgroundPage.send.setIconColor({hex: hex});
      }
    },
  },

  /**
   * @param {HTMLImageElement} img
   * @returns {HTMLImageElement}
   */
  _tint: function(img) {
    const color = Icon.color.get.rgb();

    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;

    const g = canvas.getContext('2d');
    g.drawImage(img, 0, 0);

    const data = g.getImageData(0, 0, 16, 16);
    for (let i = 0; i < data.data.length; i += 4) {
      if (
        data.data[i + 0] === 255 && // r
        data.data[i + 1] === 255 && // g
        data.data[i + 2] === 255    // b
      ) {
        data.data[i + 0] = color.r;
        data.data[i + 1] = color.g;
        data.data[i + 2] = color.b;
      }
    }

    g.putImageData(data, 0, 0);
    img.src = canvas.toDataURL();
    return img;
  },

  /**
   * @param {HTMLImageElement} img
   * @returns {Promise<HTMLImageElement>}
   */
  _overlayCustomIcon: async function(img) {
    const customIcon = await Icon.get.custom();
    if (customIcon == null) { return img; }

    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;

    const g = canvas.getContext('2d');
    g.drawImage(img, 0, 0, 12, 12);
    g.drawImage(customIcon, 4, 4, 12, 12);

    img.src = canvas.toDataURL();
    return img;
  },

  /**
   * @param {HTMLImageElement} img
   * @returns {HTMLImageElement}
   */
  _overlayNotification: function(img) {
    if (Errors.count() === 0) { return img; }

    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;

    const g = canvas.getContext('2d');
    g.drawImage(img, 0, 0);
    g.arc(12, 4, 4, 0, 2 * Math.PI, false);
    g.fillStyle = 'red';
    g.fill();

    img.src = canvas.toDataURL();
    return img;
  },

  /**
   * @returns {void}
   */
  uploadCustom: function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      if (!input.files || !input.files[0]) { return; }

      const img = document.createElement('img');
      img.addEventListener('load', () => {
        URL.revokeObjectURL(img.src);

        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;

        canvas.getContext('2d').drawImage(img, 0, 0, 16, 16);

        Icon._customIconURL = canvas.toDataURL();
        Icon.update();

        BackgroundPage.send.setCustomIcon({dataURL: Icon._customIconURL});
      });
      img.src = URL.createObjectURL(input.files[0]);
    });
    input.click();
  },
};

const Elements = {
  /** @param {string} id */
  tab: (id) => { return /** @type {CustomTabElement|null} */ (document.getElementById(id))},

  activeContent: () => { return /** @type {HTMLDivElement} */ (document.getElementById('active-content')); },
  inactiveContent: () => { return /** @type {HTMLDivElement} */ (document.getElementById('inactive-content')); },

  pageIcon: () => { return /** @type {HTMLLinkElement} */ (document.getElementById('page-icon')); },
  tabContainer: () => { return /** @type {HTMLDivElement} */ (document.getElementById('tab-container')); },
  nameInput: () => { return /** @type {HTMLInputElement} */ (document.getElementById('name-input')); },
  errorContainer: () => { return /** @type {HTMLDivElement} */ (document.getElementById('error-container')); },
  openCollapsegroupBtn: () => { return /** @type {HTMLButtonElement} */ (document.getElementById('open-collapse-group-btn')); },
  highlightBtn: () => { return /** @type {HTMLButtonElement} */ (document.getElementById('highlight-btn')); },
  uploadCustomIconBtn: () => { return /** @type {HTMLButtonElement} */ (document.getElementById('upload-custom-icon-btn')); },

  automaticallyOpenCollapse: () => { return /** @type {LabeledCheckboxElement} */ (document.getElementById('automatically-open-collapse')); },
  rememberLastActiveTab: () => { return /** @type {LabeledCheckboxElement} */ (document.getElementById('remember-last-active-tab')); },
  shouldKeepOpenedTabs: () => { return /** @type {LabeledCheckboxElement} */ (document.getElementById('should-keep-opened-tabs')); },
  promptOnClose: () => { return /** @type {LabeledCheckboxElement} */ (document.getElementById('prompt-on-close')); },

  tabIconColor: () => { return /** @type {LabeledColorPickerElement} */ (document.getElementById('tab-icon-color')); },
};

function initialize() {
  Icon.init();
  Group.set(Group.get(), false, true);
  BackgroundPage.init();

  const nameInput = Elements.nameInput();
  nameInput.addEventListener('input', Group.setInputWidth);
  nameInput.addEventListener('blur', Group.update);
  nameInput.addEventListener('keyup', function(e) {
    if (e.key === 'Enter') { Group.update(); }
  });

  Elements.highlightBtn().addEventListener('click', BackgroundPage.send.highlightTabs);
  Elements.uploadCustomIconBtn().addEventListener('click', Icon.uploadCustom);
  Elements.openCollapsegroupBtn().addEventListener('click', function() { BackgroundPage.send.toggleOpenCollapse(); });
  Elements.shouldKeepOpenedTabs().addEventListener('change', function() { BackgroundPage.send.setShouldKeepOpenedTabs(Elements.shouldKeepOpenedTabs().checked); });
  Elements.promptOnClose().addEventListener('change', function() { BackgroundPage.send.setPromptOnClose(Elements.promptOnClose().checked); });
  Elements.rememberLastActiveTab().addEventListener('change', function() { BackgroundPage.send.rememberLastActiveTab(Elements.rememberLastActiveTab().checked); });
  Elements.automaticallyOpenCollapse().addEventListener('change', function() {
    const checked = Elements.automaticallyOpenCollapse().checked;
    BackgroundPage.send.automaticallyOpenCollapse(checked);
    Elements.openCollapsegroupBtn().classList.toggle('hidden', checked);
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  if (Group.get() == null) { /** @see Tabs._on.created */
    Elements.activeContent().classList.add('hidden');
  } else {
    Elements.inactiveContent().classList.add('hidden');
    initialize();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (Elements.promptOnClose().checked) {
    e.preventDefault();
  }
});
