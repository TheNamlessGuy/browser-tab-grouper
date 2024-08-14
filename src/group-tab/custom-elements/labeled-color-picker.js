class LabeledColorPickerElement extends HTMLElement {
  _picker = null;

  constructor() {
    super();

    const style = document.createElement('style');
    style.textContent = `
@import url('/src/group-tab/index.css');

div {
  display: flex;
  align-items: center;
}

label {
  user-select: none;
  margin-left: 5px;
}

input {
  --size: 16px;
  cursor: pointer;
  width: var(--size);
  height: var(--size);
  padding: 1px;
}
`;

    const container = document.createElement('div');

    this._picker = document.createElement('input');
    this._picker.type = 'color';
    this._picker.addEventListener('input', () => this.dispatchEvent(new Event('input')));
    this._picker.addEventListener('change', () => this.dispatchEvent(new Event('change')));
    container.append(this._picker);

    const label = document.createElement('label');
    label.innerText = this.innerText;
    container.append(label);

    this.attachShadow({mode: 'closed'}).append(style, container);
  }

  get value() {
    return this._picker.value;
  }

  set value(value) {
    this._picker.value = value;
  }
}

window.addEventListener('DOMContentLoaded', () => customElements.define('labeled-color-picker', LabeledColorPickerElement));