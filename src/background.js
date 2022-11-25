async function init() {
  // await Windows.reset(); // For debugging
  await Menus.init();
  await Tabs.init();
}

init();