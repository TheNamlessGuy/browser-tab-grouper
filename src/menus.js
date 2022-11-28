const Menus = {
  _rootID: 'add-to-group',

  _separatorID: 'add-to-group-separator',
  _separatorCreated: false,

  _createSeparator: async function() {
    if (Menus._separatorCreated) { return; }
    Menus._separatorCreated = true;

    browser.menus.create({
      id: Menus._separatorID,
      parentId: Menus._rootID,
      type: 'separator',
    });
  },

  _removeSeparator: async function() {
    if (!Menus._separatorCreated) { return; }
    Menus._separatorCreated = false;

    await browser.menus.remove(Menus._separatorID);
  },

  /**
   * @param {string} group
   * @returns {string}
   */
  _id: function(group) {
    return 'add-to-group--' + group;
  },

  /**
   * @param {string} group
   * @returns {string}
   */
  _title: function(group) {
    return 'Add/Move to group \'' + group + '\'';
  },

  /**
   * @param {browser.tabs.Tab} clickedTab
   * @returns {Promise<browser.tabs.Tab[]>}
   */
  _getRelevantTabs: async function(clickedTab) {
    const selectedTabs = await Tabs.getSelected(clickedTab.windowId);
    return selectedTabs.map(x => x.id).includes(clickedTab.id) ? selectedTabs.sort((a, b) => a.index - b.index) : [clickedTab];
  },

  _onAddToNewGroup: async function(info, tab) {
    const group = await Groups.getNextFreeName();
    const tabs = await Menus._getRelevantTabs(tab);

    await Groups.add(group, tabs[0].windowId, tabs[0].index);
    for (const tab of tabs) {
      await Groups.addTab(group, tab);
    }
  },

  /**
   * @param {string} group
   * @returns {(info: browser.menus.OnClickData, tab: browser.tabs.Tab) => Promise<void>}
   */
  _onAddToGroup: function(group) {
    return async (info, tab) => {
      const tabs = await Menus._getRelevantTabs(tab);

      for (const tab of tabs) {
        await Groups.addTab(group, tab);
      }
    };
  },

  init: async function() {
    const groups = await Groups.getAll();

    browser.menus.create({
      id: Menus._rootID,
      contexts: ['tab'],
      icons: {
        '48': 'res/icons/48.png',
        '32': 'res/icons/32.png',
        '16': 'res/icons/16.png',
      },
      title: 'Add to group',
    });

    browser.menus.create({
      id: 'add-to-group-new',
      parentId: Menus._rootID,
      title: 'Add to new group',
      onclick: Menus._onAddToNewGroup,
    });

    for (const group of groups) {
      Menus.addGroup(group);
    }
  },

  /**
   * @param {string} group
   */
  addGroup: async function(group) {
    Menus._createSeparator();

    browser.menus.create({
      id: Menus._id(group),
      parentId: Menus._rootID,
      title: Menus._title(group),
      onclick: Menus._onAddToGroup(group),
    });
  },

  /**
   * @param {string} oldName
   * @param {string} newName
   */
  renameGroup: async function(oldName, newName) {
    await Menus.removeGroup(oldName);
    await Menus.addGroup(newName);
  },

  /**
   * @param {string} group
   */
  removeGroup: async function(group) {
    await browser.menus.remove(Menus._id(group));

    const groups = await Groups.getAll();
    if (groups.length === 0) {
      await Menus._removeSeparator();
    }
  },
};

/**
 * @returns {typeof Menus}
 */
function getMenus() {
  return Menus;
}