let _port = null;
let _msgListener = null;

function onTabMessage(msg) {
  _port.postMessage(msg);
}

const _connectionListener = (port) => {
  _port = port;

  _msgListener = (msg) => {
    if (msg.action === 'init') {
      msg.callback = onTabMessage;
    }

    document.dispatchEvent(new CustomEvent('tab-grouper-event', {detail: msg, bubbles: true}));
  };
  _port.onMessage.addListener(_msgListener);
};
browser.runtime.onConnect.addListener(_connectionListener);