class LabeledCheckboxElement extends HTMLElement {
  _checkbox = null;

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
  cursor: pointer;
  margin-left: 5px;
}

span {
  --size: 14px;
  --half-size: calc(var(--size) / 2);
  --quarter-size: calc(var(--half-size) / 2);
  position: relative;
  display: inline-block;
  cursor: pointer;
  width: var(--size);
  height: var(--size);
  border: 1px solid var(--border-color);
  border-radius: 5px;
}
span:after {
  position: absolute;
  content: '';
}

span.checked {
  background-color: var(--foreground-color);
}
span.checked:after {
  left: 4px;
  top: 1px;
  width: var(--quarter-size);
  height: var(--half-size);
  border-color: var(--text-color);
  border-width: 0 3px 3px 0;
  border-style: solid;
  transform: rotate(45deg);
}
`;

    const container = document.createElement('div');

    this._checkbox = document.createElement('span');
    this._checkbox.addEventListener('click', this._onClicked.bind(this));
    container.append(this._checkbox);

    const label = document.createElement('label');
    label.innerText = this.innerText;
    label.addEventListener('click', function() { this._checkbox.click(); }.bind(this));
    container.append(label);

    this.attachShadow({mode: 'closed'}).append(style, container);
  }

  get checked() {
    return this._checkbox.classList.contains('checked');
  }

  set checked(value) {
    this._checkbox.classList.toggle('checked', value);
  }

  _onClicked() {
    this._checkbox.classList.toggle('checked');
    this.dispatchEvent(new Event('change'));
  }
}

window.addEventListener('DOMContentLoaded', () => customElements.define('labeled-checkbox', LabeledCheckboxElement));