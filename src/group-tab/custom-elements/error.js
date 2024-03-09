class CustomErrorElement extends HTMLElement {
  _message = null;

  constructor() {
    super();

    const style = document.createElement('style');
  style.textContent = `
@import url('/src/group-tab/index.css');

div {
  display: flex;
  justify-content: space-between;
  background-color: var(--error-color);
  color: var(--text-color);
  width: var(--content-container-width);
  border-radius: 5px;
  padding: 3px;
  margin: 3px 0;
}

button {
  border: none;
  background-color: inherit;
}
`;

    const container = document.createElement('div');

    this._message = document.createElement('span');
    container.append(this._message);

    const xButton = document.createElement('button');
    xButton.innerText = '⨯';
    xButton.addEventListener('click', () => this.remove());
    container.append(xButton);

    this.attachShadow({mode: 'closed'}).append(style, container);
  }

  set message(msg) {
    this._message.innerText = msg;
  }
}

window.addEventListener('DOMContentLoaded', () => customElements.define('c-error', CustomErrorElement));