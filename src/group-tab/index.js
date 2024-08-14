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
  },

  /**
   * @param {string} error
   * @returns {void}
   */
  add: function(error) {
    const element = document.createElement('c-error');
    element.message = error;
    document.getElementById('error-container').append(element);
  },

  /**
   * @param {string[]} errors
   * @returns {void}
   */
  addAll: function(errors) {
    for (const error of errors) {
      Errors.add(error);
    }
  }
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

    Tabs.removeAll();
    for (const tab of msg.tabs) {
      Tabs.add(tab);
    }

    Icon.setColor(msg.opts.iconColor, false);
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
   * @returns {void}
   */
  init: function() {
    const picker = document.getElementById('tab-icon-color');
    picker.addEventListener('change', () => {
      Icon.setColor(picker.value.substring(1), true); // Remove preceeding #
    });
  },

  /**
   * @param {string} hex
   * @param {boolean} push
   * @returns {void}
   */
  setColor: function(hex, push) {
    hex = hex ?? 'FFFFFF';
    document.getElementById('tab-icon-color').value = `#${hex}`;

    Icon.tint(hex);
    if (push) {
      BackgroundPage.send.setIconColor(hex);
    }
  },

  /**
   * @param {string|null} hex A hexadecimal value without the leading #
   * @returns {void}
   */
  tint: function(hex) {
    const color = Icon._hexToRGB(hex);
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 16;
    const g = canvas.getContext('2d');

    const img = new Image();
    img.onload = function() {
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
      document.getElementById('page-icon').href = canvas.toDataURL();
    }
    img.src = '/res/icons/16.png';
  },

  /**
   * Thanks stack overflow :)
   * https://stackoverflow.com/a/11508164
   *
   * @param {string} hex
   * @returns {{r: number, g: number, b: number}}
   */
  _hexToRGB(hex) {
    let bigint = parseInt(hex, 16);
    return {
      r: (bigint >> 16) & 255,
      g: (bigint >> 8) & 255,
      b: bigint & 255,
    };
  }
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
  document.getElementById('should-keep-opened-tabs').addEventListener('change', function() { BackgroundPage.send.setShouldKeepOpenedTabs(document.getElementById('should-keep-opened-tabs').checked); });
}

window.addEventListener('DOMContentLoaded', async () => {
  if (Group.get() == null) { /** @see Tabs._on.created */
    document.getElementById('active-content').classList.add('hidden');
  } else {
    document.getElementById('inactive-content').classList.add('hidden');
    initialize();
  }
});