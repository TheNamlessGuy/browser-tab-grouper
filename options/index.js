const Local = {
  onResetButtonClick: async function() {
    const background = await browser.runtime.getBackgroundPage();
    const windows = background.getWindows();
    await windows.reset();
  },
};

window.addEventListener('load', () => {
  const resetBtn = document.getElementById('reset-groups-btn');
  resetBtn.addEventListener('click', Local.onResetButtonClick);
});