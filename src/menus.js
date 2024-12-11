/** OnClickData
 * @typedef {object} OnClickData https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions/API/menus/OnClickData
 * @property {string} menuItemId
 * @property {number} button
 * @property {('Alt'|'Command'|'Ctrl'|'MacCtrl'|'Shift')[]} modifiers
 */

/** MenuGroupVerb
 * @typedef {'Add'|'Move'|'Remove'} MenuGroupVerb
 */

const Menus = {
  /**
   * @returns {Promise<void>}
   */
  init: async function() {
    await browser.menus.removeAll();

    if (!browser.menus.onShown.hasListener(Menus._on.show)) {
      browser.menus.onShown.addListener(Menus._on.show);
    }

    if (!browser.menus.onClicked.hasListener(Menus._on.clicked)) {
      browser.menus.onClicked.addListener(Menus._on.clicked);
    }

    browser.menus.create({
      id: Menus._ids.root,
      title: 'Add to group',
      contexts: ['tab'],
      icons: {
        '48': 'res/icons/48.png',
        '32': 'res/icons/32.png',
        '16': 'res/icons/16.png',
      },
    });

    browser.menus.create({
      id: Menus._ids.openCollapse,
      title: 'Open/collapse group',
      contexts: ['tab'],
      icons: {
        '48': 'res/icons/48.png',
        '32': 'res/icons/32.png',
        '16': 'res/icons/16.png',
      },
    });

    browser.menus.create({
      id: Menus._ids.addToNewGroup,
      parentId: Menus._ids.root,
      title: 'Add to new group',
      visible: false,
    });

    browser.menus.create({
      id: Menus._ids.noActionsAvailable,
      parentId: Menus._ids.root,
      title: 'No actions available',
      visible: false,
      enabled: false,
    });

    browser.menus.create({
      id: Menus._ids.separator,
      parentId: Menus._ids.root,
      type: 'separator',
    });

    const groups = await Groups.getAll();
    for (const group of groups) {
      await Menus.addGroup(group);
    }
  },

  /**
   * @param {string} group
   * @returns {Promise<void>}
   */
  addGroup: async function(group) {
    await browser.menus.update(Menus._ids.separator, {visible: true});

    browser.menus.create({
      id: Menus._ids.group(group),
      parentId: Menus._ids.root,
      title: Menus._groupTitle(group, 'Add'),
    });
  },

  /**
   * @param {string} oldName
   * @param {string} newName
   * @returns {Promise<void>}
   */
  renameGroup: async function(oldName, newName) {
    await Menus.removeGroup(oldName);
    await Menus.addGroup(newName);
  },

  /**
   * @param {string} group
   * @returns {Promise<void>}
   */
  removeGroup: async function(group) {
    await browser.menus.remove(Menus._ids.group(group));

    const groups = await Groups.getAll();
    await browser.menus.update(Menus._ids.separator, {visible: groups.length > 0});
  },

  /**
   * If the user has a selection of tabs and clicks on a tab within that selection, return all selected tabs
   * If not, return the clicked tab.
   *
   * @param {BrowserTab} clickedTab
   * @returns {Promise<BrowserTab[]>}
   */
  _getRelevantTabs: async function(clickedTab) {
    let selected = await browser.tabs.query({windowId: clickedTab.windowId, highlighted: true});
    if (selected.map(tab => tab.id).includes(clickedTab.id)) {
      return selected.sort((a, b) => a.index - b.index);
    }

    return [clickedTab];
  },

  _ids: {
    root: 'root',
    openCollapse: 'open-collapse',
    addToNewGroup: 'add-to-new-group',
    noActionsAvailable: 'no-actions-available',
    separator: 'separator',
    groupPrefix: 'group--',

    /**
     * @param {string} group
     * @returns {string}
     */
    group: (group) => `${Menus._ids.groupPrefix}${group}`,

    /**
     * @param {string} id
     * @returns {string}
     */
    extractGroup: (id) => id.substring(Menus._ids.groupPrefix.length),
  },

  _on: {
    /**
     * @param {OnClickData} info
     * @param {BrowserTab} tab
     * @returns {Promise<void>}
     */
    show: async function(info, tab) {
      const group = await Tabs.value.get.group(tab.id);
      const isGroupTab = await Tabs.value.get.isGroupTab(tab.id);
      const groups = await Groups.getAll(tab.incognito);
      const otherGroups = await Groups.getAll(!tab.incognito);

      if (group == null) { // The clicked tab isn't part of any group
        await browser.menus.update(Menus._ids.openCollapse, {visible: false});
        await browser.menus.update(Menus._ids.noActionsAvailable, {visible: false});
        await browser.menus.update(Menus._ids.addToNewGroup, {visible: true});
        await browser.menus.update(Menus._ids.separator, {visible: groups.length > 0});
        await browser.menus.update(Menus._ids.root, {title: 'Add to group', visible: true});

        for (const g of groups) {
          await Menus._showGroup(g, 'Add');
        }

        for (const g of otherGroups) {
          await Menus._showGroup(g, false);
        }
      } else if (isGroupTab) { // The clicked tab is a group tab
        await browser.menus.update(Menus._ids.root, {visible: false});
        const automaticallyOpenCollapse = await Tabs.value.get.automaticallyOpenCollapse(tab.id);
        await browser.menus.update(Menus._ids.openCollapse, {visible: !automaticallyOpenCollapse});
      } else { // The clicked tab is part of a group, and is a regular tab
        await browser.menus.update(Menus._ids.openCollapse, {visible: false});
        await browser.menus.update(Menus._ids.noActionsAvailable, {visible: false});
        await browser.menus.update(Menus._ids.addToNewGroup, {visible: true});
        await browser.menus.update(Menus._ids.separator, {visible: groups.length > 0});
        await browser.menus.update(Menus._ids.root, {title: 'Change grouping', visible: true});

        for (const g of groups) {
          if (g === group) {
            await Menus._showGroup(g, 'Remove');
          } else {
            await Menus._showGroup(g, 'Move');
          }
        }

        for (const g of otherGroups) {
          await Menus._showGroup(g, false);
        }
      }

      await browser.menus.refresh();
    },

    /**
     * @param {string} group
     * @param {BrowserTab} clickedTab
     * @returns {Promise<void>}
     */
    groupAction: async function(group, clickedTab) {
      const tabGroup = await Tabs.value.get.group(clickedTab.id);
      const tabs = await Menus._getRelevantTabs(clickedTab);

      if (tabGroup === group) { // verb = 'Remove'
        for (const tab of tabs) {
          await Groups.removeTabFrom(group, tab.id);
          await Groups.collapse.allExceptCurrent(tab.windowId);
        }
      } else { // verb = 'Add' || 'Move'
        for (const tab of tabs) {
          await Groups.addTabTo(group, tab);
        }
      }
    },

    /**
     * @param {OnClickData} info
     * @param {BrowserTab} clickedTab
     * @returns {Promise<void>}
     */
    clicked: async function(info, clickedTab) {
      if (info.menuItemId === Menus._ids.addToNewGroup) {
        Menus._on.addToNewGroup(clickedTab);
      } else if (info.menuItemId.startsWith(Menus._ids.groupPrefix)) {
        Menus._on.groupAction(Menus._ids.extractGroup(info.menuItemId), clickedTab);
      } else if (info.menuItemId === Menus._ids.openCollapse) {
        Menus._on.onOpenCollapseToggle(clickedTab);
      }
    },

    /**
     * @param {BrowserTab} clickedTab
     * @returns {Promise<void>}
     */
    addToNewGroup: async function(clickedTab) {
      const tabs = await Menus._getRelevantTabs(clickedTab);

      const group = await Groups.add(null, tabs[0].windowId, tabs[0].index);
      for (const tab of tabs) {
        await Groups.addTabTo(group, tab);
      }
    },

    /**
     * @param {BrowserTab} clickedTab
     * @returns {Promise<void>}
     */
    onOpenCollapseToggle: async function(clickedTab) {
      const group = await Tabs.value.get.group(clickedTab.id);
      await Groups.open.toggle(group, clickedTab.windowId);
    },
  },

  /**
   * @param {string} group
   * @param {MenuGroupVerb} verb
   * @returns {string}
   */
  _groupTitle: function(group, verb) {
    const prepositions = {'Add': 'to', 'Move': 'to', 'Remove': 'from'};
    return `${verb} ${prepositions[verb]} group '${group}'`;
  },

  /**
   * @param {string} group
   * @param {MenuGroupVerb|false} verb
   * @returns {Promise<void>}
   */
  _showGroup: async function(group, verb) {
    if (verb === false) {
      await browser.menus.update(Menus._ids.group(group), {visible: false});
    } else {
      await browser.menus.update(Menus._ids.group(group), {
        visible: true,
        title: Menus._groupTitle(group, verb),
      });
    }
  },
};