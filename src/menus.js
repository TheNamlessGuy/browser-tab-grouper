const Menus = {
  _rootID: 'add-to-group',
  _newGroupID: 'add-to-new-group',
  _noActionsID: 'no-actions-available',

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
   * @param {'Add'|'Move'} group
   * @returns {string}
   */
  _title: function(group, action) {
    return `${action} to group '${group}'`;
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

  /**
   * @param {browser.menus.OnClickData & {contexts: browser.menus.ContextType[], menuIds: string[]}} info
   * @param {browser.tabs.Tab} tab
   */
  _onShow: async function(info, tab) {
    const group = await Tabs.getGroup(tab.id);
    const isGroupTab = await Tabs.isGroupTab(tab.id);
    const groups = await Groups.getAll();

    if (group == null) {
      // Is part of no group
      await browser.menus.update(Menus._noActionsID, {visible: false});
      await browser.menus.update(Menus._newGroupID, {visible: true});
      await browser.menus.update(Menus._separatorID, {visible: groups.length > 0});

      for (const g of groups) {
        await Menus._showGroup(g, 'Add');
      }
    } else if (isGroupTab) {
      // Is group tab
      await browser.menus.update(Menus._noActionsID, {visible: true});
      await browser.menus.update(Menus._newGroupID, {visible: false});
      await browser.menus.update(Menus._separatorID, {visible: false});

      for (const group of groups) {
        await Menus._showGroup(group, false);
      }
    } else {
      // Is part of group
      await browser.menus.update(Menus._noActionsID, {visible: false});
      await browser.menus.update(Menus._newGroupID, {visible: true});
      await browser.menus.update(Menus._separatorID, {visible: groups.length > 1});

      for (const g of groups) {
        if (g === group) {
          await Menus._showGroup(g, false);
        } else {
          await Menus._showGroup(g, 'Move');
        }
      }
    }

    await browser.menus.refresh();
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
      id: Menus._newGroupID,
      parentId: Menus._rootID,
      title: 'Add to new group',
      onclick: Menus._onAddToNewGroup,
    });

    browser.menus.create({
      id: Menus._noActionsID,
      parentId: Menus._rootID,
      title: 'No actions available',
      enabled: false,
      visible: false,
    });

    for (const group of groups) {
      Menus.addGroup(group);
    }

    if (!browser.menus.onShown.hasListener(Menus._onShow)) {
      browser.menus.onShown.addListener(Menus._onShow);
    }
  },

  /**
   * @param {string} group
   * @param {'Add'|'Move'|false} mode
   */
  _showGroup: async function(group, mode) {
    if (mode === false) {
      await browser.menus.update(Menus._id(group), {visible: false});
    } else {
      await browser.menus.update(Menus._id(group), {visible: true, title: Menus._title(group, mode)});
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
      title: Menus._title(group, 'Add'),
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