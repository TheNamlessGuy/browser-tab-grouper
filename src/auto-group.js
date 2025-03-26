const AutoGroup = {
  STORAGE_KEY: 'autoGroupRules',

  async getRules() {
    const data = await browser.storage.local.get(AutoGroup.STORAGE_KEY);
    return data[AutoGroup.STORAGE_KEY] ?? {};
  },

  async setRules(rules) {
    await browser.storage.local.set({ [AutoGroup.STORAGE_KEY]: rules });
  },

  async addRule(group, regexString) {
    const rules = await AutoGroup.getRules();
    if (!(group in rules)) rules[group] = [];
    if (!rules[group].includes(regexString)) rules[group].push(regexString);
    await AutoGroup.setRules(rules);
  },

  async removeRule(group, regexString) {
    const rules = await AutoGroup.getRules();
    if (group in rules) {
      rules[group] = rules[group].filter(r => r !== regexString);
      if (rules[group].length === 0) delete rules[group];
      await AutoGroup.setRules(rules);
    }
  },

  async matchGroupForURL(url) {
    const rules = await AutoGroup.getRules();
    for (const [group, patterns] of Object.entries(rules)) {
      for (const pattern of patterns) {
        try {
          if (new RegExp(pattern).test(url)) {
            return group;
          }
        } catch (_) {
          // invalid regex — skip silently
        }
      }
    }
    return null;
  }
};

// If you're using plain script loading
if (typeof window !== 'undefined') {
  window.AutoGroup = AutoGroup;
}
window.AutoGroup = AutoGroup;