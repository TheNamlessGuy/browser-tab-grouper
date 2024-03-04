let pluginCallback = null;
/**
 * @param {Record<string, any>} msg
 */
function respond(msg) {
  if (pluginCallback == null) {
    console.log('Could not send msg ' + JSON.stringify(msg) + ' as there was no plugin callback');
  } else {
    pluginCallback(msg);
  }
}

/**
 * @param {string} name
 */
function setGroupName(name) {
  document.title = name;

  /** @type {HTMLInputElement} */
  const elem = document.getElementById('group-name-id');
  elem.value = name;
  elem.placeholder = name;
}

/**
 * @param {HTMLTemplateElement} template
 * @returns {HTMLElement}
 */
function initTemplate(template) {
  return template.content.firstElementChild.cloneNode(true);
}

/**
 * @param {browser.tabs.Tab} data
 * @returns {void}
 */
function addTab(data) {
  // data = {id: <>, title: <>, icon: <>}
  const container = document.getElementById('tabs-container');

  const id = 'tab--' + data.id;

  if (document.getElementById(id) != null) {
    return; // We already display this tab
  }

  /** @type {HTMLDivElement} */
  const tab = initTemplate(document.getElementById('tab-template'));
  tab.id = id;

  /** @type {HTMLSpanElement} */
  const title = tab.getElementsByClassName('tab-title')[0];
  title.innerText = data.title;
  title.addEventListener('click', () => respond({action: 'swapToTab', tabID: data.id}));

  /** @type {HTMLImageElement} */
  const icon = tab.getElementsByClassName('tab-icon')[0];
  icon.src = data.favIconUrl;

  /** @type {HTMLSpanElement} */
  const removeBtn = tab.getElementsByClassName('tab-remove')[0];
  removeBtn.addEventListener('click', () => respond({action: 'removeTab', tabID: data.id}));

  tab.dataset.position = data.index.toString();

  container.appendChild(tab);
}

/**
 * @returns {void}
 */
function sortTabs() {
  const tabs = Array.from(document.getElementsByClassName('tab'));
  tabs.sort((a, b) => parseInt(a.dataset.position) - parseInt(b.dataset.position));
  for (const tab of tabs) {
    tab.parentNode.appendChild(tab);
  }
}

function clearErrors() {
  const errors = document.getElementById('errors');
  errors.classList.add('hidden');
  while (errors.firstChild) {
    errors.removeChild(errors.lastChild);
  }
}

/**
 * @param {string} msg
 */
function addError(msg) {
  const errors = document.getElementById('errors');
  errors.classList.remove('hidden');

  /** @type {HTMLDivElement} */
  const error = initTemplate(document.getElementById('error-template'));
  error.getElementsByClassName('error-msg')[0].innerText = msg;
  errors.appendChild(error);
}

const Actions = {
  /**
   * @param {{action: 'errors', errors: string[]}} msg
   */
  errors: function(msg) {
    for (const error of msg.errors) {
      addError(error);
    }
  },

  /**
   * @param {{action: 'init', callback: (msg: Record<string, any>) => void, group: string, tabs: browser.tabs.Tab[], inheritGroup: boolean}} msg
   */
  init: function(msg) {
    setGroupName(msg.group);

    pluginCallback = msg.callback;

    const save = document.getElementById('group-name-save');
    save.addEventListener('click', () => respond({action: 'rename', name: document.getElementById('group-name-id').value}));

    document.getElementById('highlight-tabs').addEventListener('click', () => respond({action: 'highlightTabs'}));

    const inheritGroup = document.getElementById('inherit-group');
    inheritGroup.checked = msg.inheritGroup;
    inheritGroup.addEventListener('change', () => respond({action: 'set-inherit-group', value: inheritGroup.checked}));

    for (const tab of msg.tabs) {
      addTab(tab);
    }

    sortTabs();
  },

  /**
   * @param {{action: 'rename', group: string}} msg
   */
  rename: function(msg) {
    setGroupName(msg.group);
  },

  /**
   * @param {{action: 'newTab', tab: browser.tabs.Tab}} msg
   */
  newTab: async function(msg) {
    addTab(msg.tab);
  },

  /**
   * @param {{action: 'updateTab', tab: browser.tabs.Tab}} msg
   */
  updateTab: async function(msg) {
    const tab = document.getElementById('tab--' + msg.tab.id);
    if (!tab) {
      return;
    }

    /** @type {HTMLImageElement} */
    const icon = tab.getElementsByClassName('tab-icon')[0];
    icon.src = msg.tab.favIconUrl;

    /** @type {HTMLSpanElement} */
    const title = tab.getElementsByClassName('tab-title')[0];
    title.innerText = msg.tab.title;
  },

  /**
   * @param {{action: 'removeTab', tabID: number}} msg
   */
  removeTab: async function(msg) {
    // msg = {action: 'removeTab', tabID: <>}
    const tab = document.getElementById('tab--' + msg.tabID);
    if (tab) {
      tab.parentNode.removeChild(tab);
    }
  },

  /**
   * @param {{action: 'reopened'}} msg
   */
  reopened: async function(msg) {
    document.getElementById('active-content').classList.add('hidden');
    document.getElementById('inactive-content').classList.remove('hidden');
  },

  sortTabs: async function(msg) {
    for (const tab of msg.tabs) {
      const elem = document.getElementById('tab--' + tab.id);
      if (elem) {
        elem.dataset.position = tab.index;
      }
    }

    sortTabs();
  },
}

document.addEventListener('tab-grouper-event', (e) => {
  clearErrors();
  if ('action' in e.detail && e.detail.action in Actions) {
    Actions[e.detail.action](e.detail);
  }
});