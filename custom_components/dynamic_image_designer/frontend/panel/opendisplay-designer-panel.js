import { mountDesigner } from '../app/main.js';

const TAG = 'opendisplay-designer-panel';

class OpenDisplayDesignerPanel extends HTMLElement {
  constructor() {
    super();
    this._hass = null;
    this._teardown = null;
  }

  set hass(value) {
    this._hass = value;
    if (this._teardown?.setHass) {
      this._teardown.setHass(value);
    }
  }

  get hass() {
    return this._hass;
  }

  connectedCallback() {
    this.style.display = 'block';
    this.style.height = '100%';
    this.style.minHeight = '0';
    this.style.overflow = 'hidden';
    if (!this._teardown) {
      this._teardown = mountDesigner(this, this._hass);
    } else if (this._teardown.setHass) {
      this._teardown.setHass(this._hass);
    }
  }

  disconnectedCallback() {
    if (this._teardown?.destroy) {
      this._teardown.destroy();
      this._teardown = null;
    }
  }
}

if (!customElements.get(TAG)) {
  customElements.define(TAG, OpenDisplayDesignerPanel);
}
