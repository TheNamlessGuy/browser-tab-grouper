const BackgroundPage = {
  /**
   * @type {BrowserPort|null}
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
     * @param {Record<string, *>} extras
     * @returns {*}
     */
    action: function(action, extras = {}) {
      Errors.clear();
      BackgroundPage._port.postMessage({action: action, ...JSON.parse(JSON.stringify(extras))});
    },

    /**
     * @param {string} newName
     * @returns {void}
     */
    rename: function(newName) {
      BackgroundPage.send.action('rename-group', {newName});
    },

    /**
     * @param {string} hex
     * @returns {void}
     */
    setIconColor: function(hex) {
      BackgroundPage.send.action('set-icon-color', {hex});
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
     * @param {number} tabID
     * @returns {void}
     */
    removeTab: function(tabID) {
      BackgroundPage.send.action('remove-tab', {tabID});
    },

    /**
     * @param {number} tabID
     * @returns {void}
     */
    swapToTab: function(tabID) {
      BackgroundPage.send.action('swap-to-tab', {tabID});
    },

    /**
     * @param {string} dataURL
     * @returns {void}
     */
    setCustomIcon: function(dataURL) {
      BackgroundPage.send.action('set-custom-icon', {dataURL});
    },
  },

  _on: {
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
    const container = document.getElementById('error-container');
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
    const element = document.createElement('c-error');
    element.message = error;
    element.addEventListener('removed', function() {
      if (Errors.count() === 0) {
        Icon.update();
      }
    });
    document.getElementById('error-container').append(element);

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
    return document.getElementById('error-container').children.length;
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
    document.getElementById('name-input').value = group;
    Group.setInputWidth();

    const url = new URL(window.location.href);
    url.searchParams.set('group', group);
    window.history.replaceState(null, null, url);

    if (pushToBackend) {
      BackgroundPage.send.rename(group);
    }
  },

  /**
   * @returns {void}
   */
  update: function() {
    const newValue = document.getElementById('name-input').value.trim();
    const oldValue = Group.get();

    if (newValue !== oldValue) {
      Group.set(newValue);
    }
  },

  /**
   * @returns {void}
   */
  setInputWidth: function() {
    const element = document.getElementById('name-input');
    const value = element.value.length < 10 ? 10 : element.value.length;
    element.style.width = `${value}ch`;
  },
};

const Tabs = {
  /**
   * @param {number} tabID
   * @returns {string}
   */
  _id: function(tabID) {
    return `tab--${tabID}`;
  },

  /**
   * @param {BrowserTab} tab
   * @returns {void}
   */
  add: function(tab) {
    const id = Tabs._id(tab.id);
    if (document.getElementById(id) != null) { // We're already displaying this tab
      return;
    }

    const element = document.createElement('c-tab');
    element.id = id;
    element.setTabData(tab);
    element.addEventListener('remove-me', () => BackgroundPage.send.removeTab(tab.id));
    element.addEventListener('swap-to-me', () => BackgroundPage.send.swapToTab(tab.id));
    document.getElementById('tab-container').append(element);
  },

  /**
   * @param {BrowserTab} tab
   * @returns {void}
   */
  update: function(tab) {
    const element = document.getElementById(Tabs._id(tab.id));
    if (element != null) {
      element.setTabData(tab);
    }
  },

  /**
   * @param {number[]} order A list of tab IDs sorted in the correct order
   * @returns {void}
   */
  sort: function(order) {
    const container = document.getElementById('tab-container');
    for (const tabID of order) {
      container.append(document.getElementById(Tabs._id(tabID)));
    }
  },

  /**
   * @param {number} tabID
   * @returns {void}
   */
  remove: function(tabID) {
    const element = document.getElementById(Tabs._id(tabID));
    if (element != null) {
      element.remove();
    }
  },

  /**
   * @returns {void}
   */
  removeAll: function() {
    const container = document.getElementById('tab-container');
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
    document.getElementById('should-keep-opened-tabs').checked = msg.opts.shouldKeepOpenedTabs;
    document.getElementById('prompt-on-close').checked = msg.opts.promptOnClose;

    Tabs.removeAll();
    for (const tab of msg.tabs) {
      Tabs.add(tab);
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
    Tabs.add(msg.tab);
  },

  /**
   * @param {UpdateTabMessage} msg
   * @returns {void}
   */
  'update-tab': function(msg) {
    Tabs.update(msg.tab);
  },

  /**
   * @param {SortTabsMessage} msg
   * @returns {void}
   */
  'sort-tabs': function(msg) {
    Tabs.sort(msg.tabs.map(tab => tab.id));
  },

  /**
   * @param {RemoveTabMessage} msg
   * @returns {void}
   */
  'remove-tab': function(msg) {
    Tabs.remove(msg.tabID);
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
    const picker = document.getElementById('tab-icon-color');
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
    document.getElementById('page-icon').href = img.src;
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
        return document.getElementById('tab-icon-color').value.substring(1); // Remove preceeding #
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
      document.getElementById('tab-icon-color').value = `#${hex}`;

      if (push) {
        BackgroundPage.send.setIconColor(hex);
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
   * @returns {HTMLImageElement}
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

        BackgroundPage.send.setCustomIcon(Icon._customIconURL);
      });
      img.src = URL.createObjectURL(input.files[0]);
    });
    input.click();
  },
};

function initialize() {
  Icon.init();
  Group.set(Group.get(), false, true);
  BackgroundPage.init();

  const nameInput = document.getElementById('name-input');
  nameInput.addEventListener('input', Group.setInputWidth);
  nameInput.addEventListener('blur', Group.update);
  nameInput.addEventListener('keyup', function(e) {
    if (e.key === 'Enter') { Group.update(); }
  });

  document.getElementById('highlight-btn').addEventListener('click', BackgroundPage.send.highlightTabs);
  document.getElementById('upload-custom-icon-btn').addEventListener('click', Icon.uploadCustom);
  document.getElementById('should-keep-opened-tabs').addEventListener('change', function() { BackgroundPage.send.setShouldKeepOpenedTabs(document.getElementById('should-keep-opened-tabs').checked); });
  document.getElementById('prompt-on-close').addEventListener('change', function() { BackgroundPage.send.setPromptOnClose(document.getElementById('prompt-on-close').checked); });
}

window.addEventListener('DOMContentLoaded', async () => {
  if (Group.get() == null) { /** @see Tabs._on.created */
    document.getElementById('active-content').classList.add('hidden');
  } else {
    document.getElementById('inactive-content').classList.add('hidden');
    initialize();
  }
});

window.addEventListener('beforeunload', (e) => {
  if (document.getElementById('prompt-on-close')?.checked) {
    e.preventDefault();
  }
});