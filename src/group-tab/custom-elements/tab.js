class CustomTabElement extends HTMLElement {
  _elements = {
    icon: null,
    title: null,
    removeBtn: null,
  };

  constructor() {
    super();

    const style = document.createElement('style');
    style.textContent = `
@import url('/src/group-tab/index.css');

div {
  user-select: none;
  padding: 5px 0;
  display: flex;
  align-items: center;
}

img {
  width: 16px;
  height: 16px;
  margin-right: 5px;
}
span { cursor: pointer; }
button { margin-right: 5px; }
`;

    const container = document.createElement('div');
    container.part = 'body';

    this._elements.removeBtn = document.createElement('button');
    this._elements.removeBtn.classList.add('red');
    this._elements.removeBtn.innerText = '⨯';
    this._elements.removeBtn.title = 'Remove this tab from the group';
    this._elements.removeBtn.addEventListener('click', function() { this.dispatchEvent(new Event('remove-me')); }.bind(this));
    container.append(this._elements.removeBtn);

    this._elements.icon = document.createElement('img');
    container.append(this._elements.icon);

    this._elements.title = document.createElement('span');
    this._elements.title.title = 'Swap to this tab';
    this._elements.title.addEventListener('click', function() { this.dispatchEvent(new Event('swap-to-me')); }.bind(this));
    container.append(this._elements.title);

    this.attachShadow({mode: 'closed'}).append(style, container);
  }

  /**
   * @param {BrowserTab} tab
   * @returns {void}
   */
  setTabData(tab) {
    this._elements.icon.src = tab.favIconUrl;
    this._elements.title.innerText = tab.title;
  }
}

window.addEventListener('DOMContentLoaded', () => customElements.define('c-tab', CustomTabElement));