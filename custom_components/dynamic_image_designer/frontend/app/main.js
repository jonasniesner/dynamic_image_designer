import yaml from '../vendor/js-yaml.mjs';
import {
  dumpPayloadYaml,
  formatPayloadYamlBlock,
  buildServiceCallSnippet,
} from './yaml_util.js';
import { paintPayloadSketch, computePreviewCssSize } from './preview_sketch.js';
import {
  canvasClientToTagPoint,
  estimateItemBounds,
  getResizeHandles,
  hitTestHandle,
  hitTestPayload,
  resizePayloadItem,
  translatePayloadItem,
} from './sketch_hit.js';
import { setupEntityAutocomplete } from './entity_autocomplete.js';

/** @typedef {{ setHass: (h:any)=>void; destroy: ()=>void }} MountResult */

/** OpenDisplay drawcustom element presets (aligned with imagegen/registry). Key = `type`. */
/** @type {Record<string, Record<string, unknown>>} */
const PALETTE_DEFAULTS = {
  text: {
    type: 'text',
    value: 'Hello',
    x: 8,
    y: 8,
    size: 22,
    color: 'black',
  },
  multiline: {
    type: 'multiline',
    x: 8,
    y: 12,
    value: 'Alpha|Beta|Gamma',
    delimiter: '|',
    offset_y: 22,
    size: 18,
    color: 'black',
  },
  line: {
    type: 'line',
    x_start: 8,
    y_start: 20,
    x_end: 120,
    y_end: 80,
    color: 'black',
    width: 2,
  },
  rectangle: {
    type: 'rectangle',
    x_start: 8,
    y_start: 8,
    x_end: 104,
    y_end: 56,
    outline: 'black',
    fill: 'white',
    width: 2,
  },
  rectangle_pattern: {
    type: 'rectangle_pattern',
    x_start: 8,
    y_start: 68,
    x_size: 10,
    y_size: 10,
    x_repeat: 4,
    y_repeat: 2,
    x_offset: 4,
    y_offset: 4,
    outline: 'black',
    fill: 'white',
  },
  polygon: {
    type: 'polygon',
    points: [
      [24, 16],
      [100, 32],
      [88, 88],
      [20, 64],
    ],
    outline: 'black',
    fill: 'white',
  },
  circle: {
    type: 'circle',
    x: 80,
    y: 72,
    radius: 28,
    outline: 'black',
    fill: 'white',
    width: 2,
  },
  ellipse: {
    type: 'ellipse',
    x_start: 8,
    y_start: 94,
    x_end: 180,
    y_end: 118,
    outline: 'black',
    fill: 'white',
    width: 2,
  },
  arc: {
    type: 'arc',
    x: 148,
    y: 72,
    radius: 32,
    start_angle: 0,
    end_angle: 220,
    outline: 'black',
    fill: 'white',
    width: 2,
  },
  icon: {
    type: 'icon',
    value: 'mdi:home',
    x: 16,
    y: 24,
    size: 32,
    color: 'black',
    anchor: 'la',
  },
  icon_sequence: {
    type: 'icon_sequence',
    x: 8,
    y: 118,
    size: 20,
    spacing: 6,
    direction: 'right',
    icons: ['mdi:sun-wireless', 'mdi:cloud', 'mdi:weather-night'],
    fill: 'black',
    anchor: 'la',
  },
  qrcode: {
    type: 'qrcode',
    x: 8,
    y: 8,
    data: 'https://home-assistant.io',
    border: 1,
    boxsize: 2,
  },
  dlimg: {
    type: 'dlimg',
    x: 8,
    y: 8,
    url: '/local/your-logo.png',
    xsize: 72,
    ysize: 48,
  },
  plot: {
    type: 'plot',
    x_start: 8,
    y_start: 16,
    x_end: 200,
    y_end: 96,
    data: [{ entity: 'sun.sun', color: '#c62828', name: 'Sun' }],
    duration: 86400,
  },
  progress_bar: {
    type: 'progress_bar',
    x_start: 8,
    y_start: 100,
    x_end: 264,
    y_end: 118,
    progress: 62,
    fill: 'black',
    background: 'white',
    outline: 'black',
    direction: 'right',
    width: 2,
    show_percentage: true,
  },
  diagram: {
    type: 'diagram',
    x: 12,
    height: 100,
    width: 268,
    margin: 22,
    bars: {
      values: 'A,8;B,14;C,10',
      margin: 8,
      legend_size: 9,
      font: 'ppb.ttf',
      legend_color: 'black',
      color: 'black',
    },
  },
};

/** Order and short labels for palette chips (`type` = kind). */
const ELEMENT_PALETTE_ORDER = /** @type {const} */ ([
  ['text', 'text'],
  ['multiline', 'multi'],
  ['line', 'line'],
  ['rectangle', 'rect'],
  ['rectangle_pattern', 'pattern'],
  ['polygon', 'poly'],
  ['circle', 'circle'],
  ['ellipse', 'ellipse'],
  ['arc', 'arc'],
  ['icon', 'icon'],
  ['icon_sequence', 'icons'],
  ['qrcode', 'qr'],
  ['dlimg', 'image'],
  ['plot', 'plot'],
  ['progress_bar', 'bar'],
  ['diagram', 'chart'],
]);

const MIME_OD_PALETTE = 'application/x-opendisplay-designer-palette';
const VIRTUAL_DEVICE_ID = '__virtual__';
const HISTORY_LIMIT = 80;
const KNOWN_ELEMENT_TYPES = new Set(Object.keys(PALETTE_DEFAULTS));

/** @type {Record<string, { label: string; payload: unknown[] }>} */
const PAYLOAD_TEMPLATES = {
  blank: {
    label: 'Blank',
    payload: [],
  },
  hello: {
    label: 'Hello label',
    payload: [{ type: 'text', value: 'Hello', x: 12, y: 14, size: 24, color: 'black' }],
  },
  weather_card: {
    label: 'Weather card',
    payload: [
      { type: 'text', value: '{{ states("weather.home") }}', x: 12, y: 12, size: 18, color: 'black' },
      { type: 'icon', value: 'mdi:weather-partly-cloudy', x: 10, y: 40, size: 28, color: 'black' },
      { type: 'text', value: '{{ states("sensor.outdoor_temperature") }} C', x: 48, y: 44, size: 24, color: 'black' },
      { type: 'line', x_start: 8, y_start: 80, x_end: 280, y_end: 80, color: 'black', width: 1 },
      { type: 'text', value: 'Updated {{ states("sensor.time") }}', x: 10, y: 90, size: 14, color: 'black' },
    ],
  },
  status_dashboard: {
    label: 'Status dashboard',
    payload: [
      { type: 'rectangle', x_start: 8, y_start: 8, x_end: 288, y_end: 120, outline: 'black', fill: 'white', width: 2 },
      { type: 'text', value: 'Home status', x: 16, y: 16, size: 20, color: 'black' },
      { type: 'text', value: 'Door: {{ states("binary_sensor.front_door") }}', x: 16, y: 46, size: 16, color: 'black' },
      { type: 'text', value: 'Alarm: {{ states("alarm_control_panel.home") }}', x: 16, y: 66, size: 16, color: 'black' },
      { type: 'progress_bar', x_start: 16, y_start: 94, x_end: 280, y_end: 112, progress: 50, fill: 'black', background: 'white', outline: 'black', width: 1 },
    ],
  },
};

/** @type {readonly string[]} */
const OPENDISPLAY_DOMAINS = /** @type {const} */ (['opendisplay']);
const COLOR_FALLBACK = /** @type {const} */ (['white', 'black']);
const COLOR_SYNONYMS = {
  b: 'black',
  w: 'white',
  r: 'red',
  y: 'yellow',
  a: 'accent',
  ha: 'accent',
};

/** @param {unknown} err */
function errMsg(err) {
  if (err && typeof err === 'object') {
    const message = Reflect.get(err, 'message');
    const code = Reflect.get(err, 'code');
    const body = Reflect.get(err, 'body');
    let bodyStr = '';
    if (body && typeof body === 'object' && body.message) {
      bodyStr = String(body.message);
    }
    return (
      [typeof message === 'string' ? message : '', bodyStr].filter(Boolean).join(' — ') ||
      (typeof code === 'string' ? code : 'Error')
    );
  }
  return String(err);
}

/**
 * @param {any} hass
 * @returns {Array<{ id: string; name: string }>}
 */
function listOpenDisplayDevices(hass) {
  const devices = hass?.devices;
  if (!devices || typeof devices !== 'object') {
    return [];
  }
  /** @type {Array<{ id: string; name: string }>} */
  const out = [];
  for (const [id, d] of Object.entries(devices)) {
    if (!d || typeof d !== 'object') continue;
    const ids = /** @type {{ identifiers?: unknown }} */ (d).identifiers;
    if (!Array.isArray(ids)) continue;
    const hit = ids.some(
      /** @returns {boolean} */ (tuple) =>
        Array.isArray(tuple) && OPENDISPLAY_DOMAINS.includes(tuple[0])
    );
    if (!hit) continue;
    /** @type {any} */
    const dn = d;
    const name = String(
      dn.name_by_user ||
        dn.name ||
        dn.original_name ||
        id
    ).trim();
    out.push({ id, name });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  out.push({ id: VIRTUAL_DEVICE_ID, name: 'Virtual device (local sketch)' });
  return out;
}

/**
 * @param {any} hass
 * @param {string} deviceId
 */
function entitiesForDevice(hass, deviceId) {
  const reg = hass?.entities;
  if (!reg || typeof reg !== 'object') {
    return [];
  }
  return Object.entries(reg).filter(
    ([, e]) => e && typeof e === 'object' && e.device_id === deviceId
  );
}

/**
 * @param {any} hass
 * @param {string} deviceId
 * @returns {string | null}
 */
function imageEntityForDevice(hass, deviceId) {
  const imgs = entitiesForDevice(hass, deviceId)
    .map(([, ent]) => String(/** @type {{ entity_id?: string }} */ (ent).entity_id || ''))
    .filter((eid) => eid.startsWith('image.'));
  if (imgs.length === 0) {
    return null;
  }
  return (
    imgs.find(
      (eid) =>
        hass.states[eid]?.attributes?.entity_picture != null &&
        hass.states[eid]?.attributes?.entity_picture !== ''
    ) ?? imgs[0]
  );
}

/** @param {unknown} val */
function parsePositiveInt(val) {
  const n = parseInt(String(val ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** @param {string} c */
function normalizeColorName(c) {
  const s = String(c || '').trim().toLowerCase();
  if (!s) return '';
  if (COLOR_SYNONYMS[s]) return COLOR_SYNONYMS[s];
  return s;
}

/** @param {string} modelBlob */
function modelHasRed(modelBlob) {
  return /bwry|bwr|red|tri[-\s]?color/.test(modelBlob);
}

/** @param {string} modelBlob */
function modelHasYellow(modelBlob) {
  return /bwry|bwy|yellow|tri[-\s]?color/.test(modelBlob);
}

/**
 * Tag pixel size from OpenDisplay tag Width/Height sensor entities on the device.
 * @returns {{ w: number; h: number }}
 */
function dimensionsFromOpenDisplaySensors(hass, deviceId) {
  let w = 0;
  let h = 0;
  for (const [eid, ent] of entitiesForDevice(hass, deviceId)) {
    if (!String(eid).startsWith('sensor.')) continue;
    const reg = hass?.entities?.[eid];
    const tk =
      reg?.translation_key ??
      /** @type {{ translation_key?: string }} */ (ent).translation_key;
    if (tk !== 'width' && tk !== 'height') continue;
    const plat =
      reg?.platform ?? /** @type {{ platform?: string }} */ (ent).platform;
    if (plat && plat !== 'opendisplay') continue;
    const v = parsePositiveInt(hass.states[eid]?.state);
    if (!v) continue;
    if (tk === 'width') w = v;
    if (tk === 'height') h = v;
  }
  return { w, h };
}

/**
 * Infer tag size from the last HA-rendered preview bitmap (OpenDisplay JPEG).
 * @param {HTMLImageElement | null | undefined} imgEl
 * @returns {{ tagW: number; tagH: number } | null}
 */
function dimensionsFromPreviewImage(imgEl) {
  if (!imgEl || imgEl.hidden) return null;
  if (!imgEl.complete) return null;
  const nw = imgEl.naturalWidth;
  const nh = imgEl.naturalHeight;
  if (!(nw > 8 && nh > 8)) return null;
  return { tagW: nw, tagH: nh };
}

/**
 * OpenDisplay sets DeviceInfo hw_version to "{width}x{height}" for tags (AP + BLE).
 * @param {any} hass
 * @param {string} deviceId
 * @returns {{ tagW: number; tagH: number } | null}
 */
function dimensionsFromDeviceRegistry(hass, deviceId) {
  const d = hass?.devices?.[deviceId];
  if (!d || typeof d !== 'object') return null;
  const dev = /** @type {Record<string, unknown>} */ (d);
  const hw = String(dev.hw_version || dev.hardware_version || '').trim();
  if (!hw) return null;
  const m = hw.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
  if (!m) return null;
  const w = parsePositiveInt(m[1]);
  const h = parsePositiveInt(m[2]);
  if (!w || !h) return null;
  return { tagW: w, tagH: h };
}

/**
 * @param {string[]} colors
 * @returns {string[]}
 */
function uniqueColors(colors) {
  const out = [];
  const seen = new Set();
  for (const cRaw of colors) {
    const c = normalizeColorName(cRaw);
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/**
 * @param {string} text
 */
function parsePayloadYaml(text) {
  const doc = yaml.load(text.trim() || '[]');
  if (!Array.isArray(doc)) {
    throw new Error('Payload must be a YAML list (array) of draw elements');
  }
  return doc;
}

/**
 * @param {any} hass
 * @param {string} entityId
 * @param {string | undefined} prevPic
 * @param {number} timeoutMs
 */
async function waitForPictureChange(hass, entityId, prevPic, timeoutMs = 8000) {
  const sleep = (/** @type {number} */ ms) =>
    new Promise((/** @type {(v: void) => void} */ r) => setTimeout(r, ms));
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const pic = hass.states[entityId]?.attributes?.entity_picture;
    if (pic && pic !== prevPic) {
      await sleep(80);
      const settled = hass.states[entityId]?.attributes?.entity_picture;
      if (settled && settled !== prevPic) return settled;
      if (!settled && pic !== prevPic) return pic;
      continue;
    }
    await sleep(100);
  }
  return hass.states[entityId]?.attributes?.entity_picture || '';
}

/**
 * @param {HTMLElement} host
 * @param {any} initialHass
 * @returns {MountResult}
 */
export function mountDesigner(host, initialHass) {
  const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
  shadow.replaceChildren();

  const root = document.createElement('div');
  root.className = 'od-root';
  root.innerHTML = `
    <div class="od-toolbar od-card">
      <div class="od-field compact-bot">
        <select id="od-device"></select>
      </div>
      <div class="od-virtual-size" id="od-virtual-size">
        <label for="od-virtual-w">W</label>
        <input id="od-virtual-w" type="number" min="16" max="4096" value="296" />
        <label for="od-virtual-h">H</label>
        <input id="od-virtual-h" type="number" min="16" max="4096" value="128" />
      </div>
    </div>
    <div class="od-main">
      <div class="od-col od-card od-col-edit">
        <h2>Payload (YAML)</h2>
        <div class="od-editor-wrap">
          <textarea id="od-payload" class="od-payload-ta" spellcheck="false" aria-label="drawcustom YAML payload"></textarea>
        </div>
        <p id="od-parse-status" class="od-parse-status" hidden></p>
        <div id="od-diagnostics" class="od-diagnostics" hidden></div>
        <div class="od-actions">
          <button type="button" class="secondary" id="od-undo" title="Undo (Ctrl/Cmd+Z)">Undo</button>
          <button type="button" class="secondary" id="od-redo" title="Redo (Ctrl/Cmd+Shift+Z or Ctrl+Y)">Redo</button>
        </div>
        <div class="od-actions row2">
          <select id="od-preset"></select>
          <button type="button" class="secondary" id="od-apply-preset">Apply template</button>
          <button type="button" id="od-preview">HA preview now</button>
          <button type="button" id="od-send">Send to tag</button>
        </div>
      </div>
      <div class="od-col od-card od-col-visual">
        <div class="od-visual-stack">
          <div class="od-visual-panel od-combined">
            <div class="od-preview-head">
              <h3>Preview</h3>
              <div class="od-color-swatches" id="od-color-swatches" aria-label="Available display colors"></div>
              <div class="od-preview-modes" role="radiogroup" aria-label="Preview layout">
                <label><input type="radio" name="od-pvm" value="sketch" checked /> Sketch</label>
                <label><input type="radio" name="od-pvm" value="overlay" /> Overlay</label>
                <label><input type="radio" name="od-pvm" value="ha" /> HA render</label>
              </div>
            </div>
            <div class="od-palette" id="od-palette-root">
              <span class="od-palette-label">Add</span>
            </div>
            <div class="od-preview-frame od-combined-frame pvm-sketch" id="od-preview-frame">
              <span class="od-muted od-preview-placeholder" id="od-preview-placeholder">Select device; auto-preview runs after edits when enabled.</span>
              <div id="od-ha-loading" class="od-ha-loading" hidden aria-hidden="true">
                <div class="od-spin" aria-label="loading"></div>
              </div>
              <img id="od-preview-img" alt="Home Assistant rendered image" hidden />
              <canvas id="od-sketch" width="296" height="128" aria-label="Sketch preview"></canvas>
            </div>
            <p id="od-ha-stale-hint" class="od-ha-stale-hint" hidden>
              Underlying HA bitmap is older than your YAML — use Preview or wait for auto dry-run.
            </p>
            <div id="od-ha-status" class="od-ha-status"></div>
          </div>
        </div>
        <details class="od-details">
          <summary>Service options & export</summary>
          <div class="od-field">
            <label for="od-bg">background</label>
            <select id="od-bg">
              <option>white</option><option>black</option><option>accent</option><option>red</option><option>yellow</option>
            </select>
          </div>
          <div class="od-row-inline">
            <div class="od-field">
              <label for="od-rot">rotate</label>
              <select id="od-rot">
                <option value="0">0</option><option value="90">90</option><option value="180">180</option><option value="270">270</option>
              </select>
            </div>
            <div class="od-field">
              <label for="od-dither">dither</label>
              <select id="od-dither">
                <option value="0">0</option><option value="1">1</option><option value="2" selected>2</option>
              </select>
            </div>
          </div>
          <div class="od-field">
            <label for="od-ttl">ttl (s)</label>
            <input type="number" id="od-ttl" min="0" max="86400" value="60" />
          </div>
          <div class="od-field">
            <label for="od-refresh">refresh_type</label>
            <select id="od-refresh">
              <option value="0" selected>0 full</option><option value="1">1</option><option value="2">2</option><option value="3">3</option>
            </select>
          </div>
          <button type="button" class="secondary" id="od-copy">Copy automation YAML</button>
          <pre class="od-export" id="od-export"></pre>
        </details>
      </div>
    </div>
  `;

  const base = new URL('./styles.css', import.meta.url).href;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = base;
  shadow.append(link, root);

  /** @type {any} */
  let hass = initialHass;

  const $ = /** @type {(s:string)=>HTMLElement} */ (sel) =>
    /** @type {HTMLElement} */ (shadow.querySelector(sel));

  const previewFrame = /** @type {HTMLElement} */ ($('#od-preview-frame'));
  const sketchCanvas = /** @type {HTMLCanvasElement} */ (
    shadow.querySelector('#od-sketch')
  );
  const previewImgEl = /** @type {HTMLImageElement} */ ($('#od-preview-img'));
  const colorSwatchesEl = /** @type {HTMLElement} */ ($('#od-color-swatches'));
  const virtualSizeWrap = /** @type {HTMLElement} */ ($('#od-virtual-size'));
  const virtualWInput = /** @type {HTMLInputElement} */ ($('#od-virtual-w'));
  const virtualHInput = /** @type {HTMLInputElement} */ ($('#od-virtual-h'));
  const sendBtn = /** @type {HTMLButtonElement} */ ($('#od-send'));

  const paletteRoot = /** @type {HTMLElement} */ (shadow.querySelector('#od-palette-root'));
  for (const row of ELEMENT_PALETTE_ORDER) {
    const kind = row[0];
    const short = row[1];
    if (!(kind in PALETTE_DEFAULTS)) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'od-palette-chip';
    btn.draggable = true;
    btn.dataset.odKind = kind;
    btn.textContent = short;
    btn.title = kind;
    paletteRoot.appendChild(btn);
  }
  paletteRoot.addEventListener('dragstart', (ev) => {
    const chip = /** @type {HTMLElement | null} */ (
      /** @type {HTMLElement} */ (ev.target).closest('.od-palette-chip[data-od-kind]')
    );
    if (!chip) return;
    const kind = chip.dataset.odKind || '';
    try {
      ev.dataTransfer?.setData(MIME_OD_PALETTE, kind);
      ev.dataTransfer?.setData('text/plain', kind);
    } catch {
      /* noop */
    }
    const dt = ev.dataTransfer;
    if (dt) dt.effectAllowed = 'copy';
  });

  const defaultPayload = `- type: text
  value: Hello World!
  x: 0
  y: 0
  size: 40
  color: black
`;
  /** @type {HTMLTextAreaElement} */ ($('#od-payload')).value = defaultPayload;

  const wrap = /** @type {HTMLElement} */ (shadow.querySelector('.od-editor-wrap'));
  const ac = setupEntityAutocomplete(
    wrap,
    /** @type {HTMLTextAreaElement} */ ($('#od-payload')),
    () => hass,
    {
      getColorSuggestions: () => cachedAvailableColors,
    }
  );

  let lastValidPayload = /** @type {unknown[] | null} */ (null);
  let lastParseError = /** @type {string | null} */ (null);

  let sketchDebounceTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
  let haPreviewDebounceTimer = /** @type {ReturnType<typeof setTimeout> | null} */ (null);
  let haGeneration = 0;
  /** Bump per dry-run; only the latest preview apply wins (drops stale completions). */
  let haDryApplyTicket = 0;
  /** Bumped whenever YAML/content changes so stale image loads cannot auto-switch view. */
  let yamlPreviewBump = 0;
  /** When set, first successful image load selects HA if bump still matches. */
  let pendingAutoHaBumpTarget = /** @type {number | null} */ (null);
  /** `yaml_preview_bump` value the loaded HA bitmap last matched (dry-run request time). */
  let haBmpReflectsYamlBump = /** @type {number | null} */ (null);
  let selectedItemIdx = -1;
  let cachedAvailableColors = [...COLOR_FALLBACK];
  /** @type {string[]} */
  let undoStack = [];
  /** @type {string[]} */
  let redoStack = [];
  let suppressHistoryCapture = false;
  /** @type {{
   *  pointerId:number;
   *  mode:'move'|'resize';
   *  idx:number;
   *  lastTx:number;
   *  lastTy:number;
   *  handle?: { id:string; kind:string; x:number; y:number; vertexIndex?:number } | null;
   * } | null} */
  let sketchEdit = null;

  function availableDisplayColors() {
    const devId = effectiveDeviceId();
    if (!devId || devId === VIRTUAL_DEVICE_ID) return [...COLOR_FALLBACK];
    const imgEntity = imageEntityForDevice(hass, devId);
    const attrs = imgEntity ? hass?.states?.[imgEntity]?.attributes : null;
    const dev = hass?.devices?.[devId];
    /** @type {string[]} */
    const colors = ['white', 'black'];
    const pushAny = (v) => {
      if (Array.isArray(v)) {
        for (const c of v) colors.push(String(c));
      } else if (v && typeof v === 'object') {
        for (const k of Object.keys(v)) colors.push(String(k));
      } else if (typeof v === 'string') {
        colors.push(v);
      }
    };
    pushAny(attrs?.available_colors);
    pushAny(attrs?.colors);
    pushAny(attrs?.color_table);
    const modelBlob = [
      attrs?.model,
      attrs?.friendly_name,
      dev?.model,
      dev?.name,
      dev?.manufacturer,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (modelHasRed(modelBlob)) colors.push('red');
    if (modelHasYellow(modelBlob)) colors.push('yellow');
    const uniq = uniqueColors(colors)
      .map((c) => {
        if (c !== 'accent') return c;
        if (modelHasYellow(modelBlob)) return 'yellow';
        if (modelHasRed(modelBlob)) return 'red';
        return '';
      })
      .filter((c) => c && c !== 'blue');
    const final = uniqueColors(uniq);
    return final.length > 0 ? final : [...COLOR_FALLBACK];
  }

  function colorChipHex(name) {
    const n = normalizeColorName(name);
    if (n === 'black') return '#000000';
    if (n === 'white') return '#ffffff';
    if (n === 'red') return '#cc0000';
    if (n === 'yellow') return '#d8b400';
    if (n === 'accent') return '#2a6cff';
    if (n === 'gray' || n === 'grey' || n === 'half_black') return '#888';
    if (n.startsWith('#')) return n;
    return '#666';
  }

  function refreshColorSwatches() {
    cachedAvailableColors = availableDisplayColors();
    colorSwatchesEl.replaceChildren();
    for (const c of cachedAvailableColors.slice(0, 6)) {
      const chip = document.createElement('span');
      chip.className = 'od-color-chip';
      chip.title = c;
      chip.setAttribute('aria-label', c);
      chip.style.background = colorChipHex(c);
      if (normalizeColorName(c) === 'white') chip.style.borderColor = 'rgba(0,0,0,0.35)';
      colorSwatchesEl.appendChild(chip);
    }
  }

  function yamlEditShowSketch() {
    yamlPreviewBump += 1;
    pendingAutoHaBumpTarget = null;
    const sketchInp = shadow.querySelector('input[name="od-pvm"][value="sketch"]');
    if (sketchInp) /** @type {HTMLInputElement} */ (sketchInp).checked = true;
    syncPreviewFrameClass();
    scheduleRedrawSketch();
  }

  function bumpYamlPreviewGenOnly() {
    yamlPreviewBump += 1;
    pendingAutoHaBumpTarget = null;
    refreshHaStaleUi();
  }

  function refreshHaStaleUi() {
    const hint =
      /** @type {HTMLElement | null} */ (shadow.querySelector('#od-ha-stale-hint'));
    const mode = getPreviewMode();
    const hasBmp = previewImageHasSrc();
    const ref =
      haBmpReflectsYamlBump !== null &&
      typeof haBmpReflectsYamlBump === 'number' &&
      !Number.isNaN(/** @type {number} */ (haBmpReflectsYamlBump));

    const stale =
      mode === 'overlay' &&
      hasBmp &&
      ref &&
      yamlPreviewBump !== /** @type {number} */ (haBmpReflectsYamlBump);

    previewFrame.classList.toggle('od-overlay-ha-stale', stale);
    if (hint) hint.hidden = !stale;
  }

  function showToast(msg, isErr) {
    const t = document.createElement('div');
    t.className = `od-toast${isErr ? ' err' : ''}`;
    t.textContent = msg;
    shadow.appendChild(t);
    setTimeout(() => t.remove(), 5000);
  }

  function refreshDeviceSelect() {
    const sel = /** @type {HTMLSelectElement} */ ($('#od-device'));
    const devices = listOpenDisplayDevices(hass);
    const cur = sel.value;
    sel.innerHTML = '';
    if (devices.length === 0) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'No OpenDisplay devices in the registry';
      sel.appendChild(opt);
      const virt = document.createElement('option');
      virt.value = VIRTUAL_DEVICE_ID;
      virt.textContent = 'Virtual device (local sketch)';
      sel.appendChild(virt);
      return;
    }
    for (const d of devices) {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name;
      sel.appendChild(opt);
    }
    if (cur && devices.some((d) => d.id === cur)) {
      sel.value = cur;
    }
  }

  function refreshDeviceUiMode() {
    const isVirtual = isVirtualDeviceSelected();
    virtualWInput.disabled = !isVirtual;
    virtualHInput.disabled = !isVirtual;
    virtualSizeWrap.classList.toggle('is-locked', !isVirtual);
    sendBtn.hidden = isVirtual;
    if (isVirtual) {
      $('#od-ha-status').textContent = 'Virtual mode: local sketch only.';
    }
    refreshColorSwatches();
  }

  function syncDimensionInputsFromSelectedDevice() {
    const fallback = { tagW: 296, tagH: 128 };
    const devId = effectiveDeviceId();
    if (!devId || devId === VIRTUAL_DEVICE_ID) return;
    const { w, h } = dimensionsFromOpenDisplaySensors(hass, devId);
    const regDim = dimensionsFromDeviceRegistry(hass, devId);
    const imgDim = dimensionsFromPreviewImage(previewImgEl);
    const tagW = (w > 0 && h > 0 ? w : 0) || regDim?.tagW || imgDim?.tagW || fallback.tagW;
    const tagH = (w > 0 && h > 0 ? h : 0) || regDim?.tagH || imgDim?.tagH || fallback.tagH;
    virtualWInput.value = String(tagW);
    virtualHInput.value = String(tagH);
  }

  function effectiveDeviceId() {
    return /** @type {HTMLSelectElement} */ ($('#od-device')).value;
  }

  function isVirtualDeviceSelected() {
    return effectiveDeviceId() === VIRTUAL_DEVICE_ID;
  }

  function getTagPx() {
    const devId = effectiveDeviceId();
    const fallback = { tagW: 296, tagH: 128 };
    if (!devId) return fallback;
    if (devId === VIRTUAL_DEVICE_ID) {
      const vw = parsePositiveInt(virtualWInput.value);
      const vh = parsePositiveInt(virtualHInput.value);
      return {
        tagW: vw || fallback.tagW,
        tagH: vh || fallback.tagH,
      };
    }
    const { w, h } = dimensionsFromOpenDisplaySensors(hass, devId);
    if (w > 0 && h > 0) return { tagW: w, tagH: h };
    const fromDev = dimensionsFromDeviceRegistry(hass, devId);
    if (fromDev) return fromDev;
    const fromImg = dimensionsFromPreviewImage(previewImgEl);
    if (fromImg) return fromImg;
    return fallback;
  }

  /** Pixel size for layout: prefer HA JPEG dimensions when loaded so overlay matches render. */
  function layoutPreviewDims() {
    const fromImg = dimensionsFromPreviewImage(previewImgEl);
    if (fromImg) return fromImg;
    return getTagPx();
  }

  /** Keep sketch canvas and #od-preview-img in the same CSS box (overlay alignment). */
  function applyCombinedPreviewLayout() {
    const { tagW, tagH } = layoutPreviewDims();
    const { cssW, cssH } = computePreviewCssSize(previewFrame, tagW, tagH);
    previewFrame.style.setProperty('--od-preview-w', `${cssW}px`);
    previewFrame.style.setProperty('--od-preview-h', `${cssH}px`);
    return { tagW, tagH, cssW, cssH };
  }

  function drawSketchMessage(canvas, msg) {
    const { cssW, cssH } = applyCombinedPreviewLayout();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    delete canvas.__odPxToTag;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#666';
    ctx.font = '13px system-ui,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(msg, cssW / 2, cssH / 2);
  }

  function updateMeta() {
    /* top bar now shows size in W/H fields only */
    refreshColorSwatches();
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normalizeParsedPayload(parsed) {
    return Array.isArray(parsed) ? parsed : [];
  }

  function renderDiagnostics(diags) {
    const box = /** @type {HTMLElement} */ ($('#od-diagnostics'));
    box.replaceChildren();
    if (!Array.isArray(diags) || diags.length === 0) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const title = document.createElement('strong');
    title.textContent = `Diagnostics (${diags.length})`;
    box.appendChild(title);
    for (const d of diags) {
      const line = document.createElement('div');
      line.className = `od-diag-item od-diag-${d.level === 'warn' ? 'warn' : 'err'}`;
      line.textContent = d.message;
      box.appendChild(line);
    }
  }

  function collectPayloadDiagnostics(parsed) {
    /** @type {{ level:'error'|'warn'; message:string }[]} */
    const out = [];
    if (!Array.isArray(parsed)) {
      out.push({ level: 'error', message: 'Payload is not a YAML list.' });
      return out;
    }
    for (let i = 0; i < parsed.length; i += 1) {
      const item = parsed[i];
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        out.push({ level: 'error', message: `Item ${i + 1}: must be an object.` });
        continue;
      }
      const rec = /** @type {Record<string, unknown>} */ (item);
      const type = String(rec.type || '').trim().toLowerCase();
      if (!type) {
        out.push({ level: 'error', message: `Item ${i + 1}: missing type.` });
        continue;
      }
      if (!KNOWN_ELEMENT_TYPES.has(type)) {
        out.push({ level: 'warn', message: `Item ${i + 1}: unknown type "${type}" (preview fallback only).` });
      }
      if ((type === 'text' || type === 'multiline') && !String(rec.value ?? '').trim()) {
        out.push({ level: 'warn', message: `Item ${i + 1}: ${type} has empty value.` });
      }
      if ((type === 'line' || type === 'rectangle' || type === 'ellipse' || type === 'plot' || type === 'progress_bar') &&
        (rec.x_start == null || rec.y_start == null || rec.x_end == null || rec.y_end == null)) {
        out.push({ level: 'warn', message: `Item ${i + 1}: ${type} is missing one or more *_start/*_end coordinates.` });
      }
      if ((type === 'icon' || type === 'icon_sequence') && Number(rec.size) <= 0) {
        out.push({ level: 'warn', message: `Item ${i + 1}: ${type} size should be > 0.` });
      }
    }
    return out;
  }

  function pushUndoSnapshot(rawYaml) {
    if (suppressHistoryCapture) return;
    const current = String(rawYaml ?? '');
    if (undoStack.length > 0 && undoStack[undoStack.length - 1] === current) return;
    undoStack.push(current);
    if (undoStack.length > HISTORY_LIMIT) {
      undoStack = undoStack.slice(undoStack.length - HISTORY_LIMIT);
    }
    redoStack = [];
    updateUndoRedoUi();
  }

  function updateUndoRedoUi() {
    const undoBtn = /** @type {HTMLButtonElement} */ ($('#od-undo'));
    const redoBtn = /** @type {HTMLButtonElement} */ ($('#od-redo'));
    undoBtn.disabled = undoStack.length <= 1;
    redoBtn.disabled = redoStack.length === 0;
  }

  function applyYamlTextSnapshot(yamlText, reason = '') {
    suppressHistoryCapture = true;
    taPayload.value = yamlText;
    suppressHistoryCapture = false;
    lastValidPayload = null;
    lastParseError = null;
    validatePayload();
    rebuildExportSnippet();
    scheduleRedrawSketch();
    scheduleDebouncedHaPreview();
    if (reason) {
      $('#od-ha-status').textContent = reason;
    }
  }

  function undoPayloadEdit() {
    if (undoStack.length <= 1) return;
    const current = undoStack.pop();
    if (current != null) redoStack.push(current);
    const prev = undoStack[undoStack.length - 1] || '';
    applyYamlTextSnapshot(prev, 'Undo applied.');
    updateUndoRedoUi();
  }

  function redoPayloadEdit() {
    if (redoStack.length === 0) return;
    const next = redoStack.pop();
    if (next == null) return;
    undoStack.push(next);
    applyYamlTextSnapshot(next, 'Redo applied.');
    updateUndoRedoUi();
  }

  function refreshPresetOptions() {
    const presetSel = /** @type {HTMLSelectElement} */ ($('#od-preset'));
    presetSel.innerHTML = '';
    for (const [id, meta] of Object.entries(PAYLOAD_TEMPLATES)) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = meta.label;
      presetSel.appendChild(opt);
    }
  }

  function applySelectedPreset() {
    const presetSel = /** @type {HTMLSelectElement} */ ($('#od-preset'));
    const id = presetSel.value;
    const preset = PAYLOAD_TEMPLATES[id];
    if (!preset) {
      showToast('Template not found.', true);
      return;
    }
    const parsed = normalizeParsedPayload(deepClone(preset.payload));
    clearSelection();
    applyEditedPayload(parsed);
    validatePayload();
    showToast(`Template loaded: ${preset.label}`, false);
  }

  function validatePayload() {
    const ta = /** @type {HTMLTextAreaElement} */ ($('#od-payload'));
    const status = /** @type {HTMLElement} */ ($('#od-parse-status'));
    try {
      const arr = parsePayloadYaml(ta.value);
      lastValidPayload = arr;
      lastParseError = null;
      status.hidden = true;
      status.textContent = '';
      renderDiagnostics(collectPayloadDiagnostics(arr));
      return true;
    } catch (e) {
      lastValidPayload = null;
      lastParseError = errMsg(e);
      status.textContent = lastParseError || 'Invalid YAML';
      status.hidden = false;
      renderDiagnostics([
        { level: 'error', message: status.textContent || 'Invalid YAML' },
      ]);
      return false;
    }
  }

  function silentParsePayload() {
    try {
      return parsePayloadYaml(/** @type {HTMLTextAreaElement} */ ($('#od-payload')).value);
    } catch {
      return null;
    }
  }

  function readServiceData(dryRun) {
    return {
      background: /** @type {HTMLSelectElement} */ ($('#od-bg')).value,
      rotate: Number(/** @type {HTMLSelectElement} */ ($('#od-rot')).value),
      dither: Number(/** @type {HTMLSelectElement} */ ($('#od-dither')).value),
      ttl: Number(/** @type {HTMLInputElement} */ ($('#od-ttl')).value || 60),
      refresh_type: Number(
        /** @type {HTMLSelectElement} */ ($('#od-refresh')).value
      ),
      'dry-run': dryRun,
    };
  }

  function rebuildExportSnippet() {
    const devId = effectiveDeviceId();
    const parsed = silentParsePayload();
    const payloadBlock = formatPayloadYamlBlock(
      Array.isArray(parsed) ? parsed : []
    );
    if (devId === VIRTUAL_DEVICE_ID) {
      /** @type {HTMLPreElement} */ ($('#od-export')).textContent =
        'Virtual device selected: export/send is disabled (no Home Assistant target device_id).';
      return;
    }
    /** @type {HTMLPreElement} */ ($('#od-export')).textContent = devId
      ? buildServiceCallSnippet(
          devId,
          {
            background: /** @type {HTMLSelectElement} */ ($('#od-bg')).value,
            rotate: Number(/** @type {HTMLSelectElement} */ ($('#od-rot')).value),
            dither: Number(
              /** @type {HTMLSelectElement} */ ($('#od-dither')).value
            ),
            ttl: Number(/** @type {HTMLInputElement} */ ($('#od-ttl')).value || 60),
            refresh_type: /** @type {HTMLSelectElement} */ (
              $('#od-refresh')
            ).value,
            dry_run: false,
          },
          payloadBlock
        )
      : 'Pick a device id to export.';
  }

  function scheduleRedrawSketch() {
    if (sketchDebounceTimer) {
      clearTimeout(sketchDebounceTimer);
    }
    sketchDebounceTimer = setTimeout(redrawSketch, 90);
  }

  function redrawSketch() {
    sketchDebounceTimer = null;
    const canvas = /** @type {HTMLCanvasElement} */ (shadow.querySelector('#od-sketch'));
    const parsed = silentParsePayload();
    if (!parsed) {
      selectedItemIdx = -1;
      drawSketchMessage(canvas, lastParseError || 'Invalid YAML');
      return;
    }
    if (selectedItemIdx >= parsed.length) selectedItemIdx = -1;
    const { tagW, tagH, cssW, cssH } = applyCombinedPreviewLayout();
    const bg = /** @type {HTMLSelectElement} */ ($('#od-bg')).value;
    const rot = Number(/** @type {HTMLSelectElement} */ ($('#od-rot')).value);
    const mode = getPreviewMode();
    const selectedParsed = silentParsePayload();
    let selectedBounds = null;
    let selectedHandles = null;
    let activeHandleId = null;
    if (
      selectedItemIdx >= 0 &&
      selectedParsed &&
      selectedItemIdx < selectedParsed.length
    ) {
      const selected = selectedParsed[selectedItemIdx];
      selectedBounds = estimateItemBounds(selected, hass, tagW, tagH);
      selectedHandles = getResizeHandles(selected, hass, tagW, tagH);
      activeHandleId = sketchEdit?.handle?.id ?? null;
    }
    paintPayloadSketch(
      canvas,
      hass,
      parsed,
      tagW,
      tagH,
      bg,
      rot,
      '#cc2200',
      mode === 'overlay',
      { cssW, cssH },
      selectedBounds,
      selectedHandles,
      activeHandleId
    );
  }

  function scheduleDebouncedHaPreview() {
    if (haPreviewDebounceTimer) {
      clearTimeout(haPreviewDebounceTimer);
    }
    haPreviewDebounceTimer = setTimeout(() => {
      haPreviewDebounceTimer = null;
      void quietAutoHaPreview().catch(() => {});
    }, 620);
  }

  async function quietAutoHaPreview() {
    if (isVirtualDeviceSelected()) return;
    const devId = effectiveDeviceId();
    if (!devId) return;
    const parsed = silentParsePayload();
    if (!parsed) return;
    haGeneration += 1;
    const myGen = haGeneration;
    const loading = $('#od-ha-loading');
    loading.hidden = false;
    try {
      await invokeDrawcustom(true, parsed, true);
    } catch {
      /* dry-run failures are surfaced only for manual Preview */
    } finally {
      if (myGen === haGeneration) loading.hidden = true;
    }
    if (myGen === haGeneration) {
      $('#od-ha-status').textContent = `Last HA render ${new Date().toLocaleTimeString()}`;
    }
  }

  /**
   * @param {boolean} dryRun
   * @param {unknown[]} payloadArr
   * @param {boolean} quiet
   */
  async function invokeDrawcustom(dryRun, payloadArr, quiet) {
    const devId = effectiveDeviceId();
    if (!devId) throw new Error('No device');
    if (devId === VIRTUAL_DEVICE_ID) {
      throw new Error(
        'Virtual device has no Home Assistant target. Use a real OpenDisplay device for HA preview/send.'
      );
    }

    const imgBefore = imageEntityForDevice(hass, devId);
    const previewTicket =
      dryRun && imgBefore ? ++haDryApplyTicket : /** @type {-1 | number} */ (-1);

    const data = {
      ...readServiceData(dryRun),
      payload: payloadArr,
    };
    const picBefore =
      imgBefore && hass.states[imgBefore]?.attributes?.entity_picture;
    const yamlBumpWhenRequestStarted = yamlPreviewBump;
    await hass.callService(
      'opendisplay',
      'drawcustom',
      data,
      { device_id: devId }
    );
    if (dryRun && imgBefore && previewTicket >= 0) {
      const picAfter = await waitForPictureChange(hass, imgBefore, picBefore);
      if (previewTicket === haDryApplyTicket && picAfter) {
        applyPreviewPicture(picAfter, yamlBumpWhenRequestStarted);
      }
    }
    if (!quiet) {
      if (!dryRun) {
        showToast('Queued to OpenDisplay.', false);
      } else if (!imgBefore) {
        showToast('Dry-run OK (no image entity for preview)', false);
      } else {
        showToast('HA preview refreshed.', false);
      }
    }
  }

  /**
   * Manual preview / send with toast + validation
   * @param {boolean} dryRun
   */
  async function interactiveDrawcustom(dryRun) {
    const devId = effectiveDeviceId();
    if (!devId) {
      showToast('Select an OpenDisplay device.', true);
      return;
    }
    if (!validatePayload() || !lastValidPayload) {
      showToast(lastParseError || 'Fix YAML', true);
      return;
    }
    const payloadArr = /** @type {unknown[]} */ (lastValidPayload);
    $('#od-ha-loading').hidden = false;
    try {
      await invokeDrawcustom(dryRun, payloadArr, false);
      $('#od-ha-status').textContent = `Last HA render ${new Date().toLocaleTimeString()}`;
    } catch (e) {
      showToast(errMsg(e), true);
    } finally {
      $('#od-ha-loading').hidden = true;
    }
  }

  /**
   * @param {string} picPath
   * @param {number} [yamlBumpWhenRequestStarted]
   */
  function applyPreviewPicture(picPath, yamlBumpWhenRequestStarted) {
    if (!picPath) return;
    pendingAutoHaBumpTarget = yamlPreviewBump;
    const img = previewImgEl;
    img.dataset.odRequestBump = String(
      yamlBumpWhenRequestStarted ?? yamlPreviewBump
    );
    const abs = /^https?:/i.test(picPath)
      ? picPath
      : `${window.location.origin}${picPath.startsWith('/') ? picPath : `/${picPath}`}`;
    const sep = abs.includes('?') ? '&' : '?';
    img.src = `${abs}${sep}t=${Date.now()}`;
    img.hidden = false;
    refreshPreviewPlaceholderVisibility();
  }

  function clearHaDryRunPreview() {
    pendingAutoHaBumpTarget = null;
    haBmpReflectsYamlBump = null;
    delete previewImgEl.dataset.odRequestBump;
    previewImgEl.removeAttribute('src');
    previewImgEl.hidden = true;
    refreshPreviewPlaceholderVisibility();
    refreshHaStaleUi();
  }

  function copyExport() {
    rebuildExportSnippet();
    const text = /** @type {HTMLPreElement} */ ($('#od-export')).textContent || '';
    navigator.clipboard.writeText(text).then(
      () => showToast('Copied', false),
      () => showToast('Copy failed', true)
    );
  }

  const taPayload = /** @type {HTMLTextAreaElement} */ ($('#od-payload'));

  /** @returns {'sketch' | 'overlay' | 'ha'} */
  function getPreviewMode() {
    const el = shadow.querySelector('input[name="od-pvm"]:checked');
    const v = el ? /** @type {HTMLInputElement} */ (el).value : 'sketch';
    if (v === 'overlay' || v === 'ha') return v;
    return 'sketch';
  }

  function syncPreviewFrameClass() {
    previewFrame.classList.remove(
      'pvm-sketch',
      'pvm-overlay',
      'pvm-ha',
      'od-overlay-ha-stale'
    );
    previewFrame.classList.add(`pvm-${getPreviewMode()}`);
    refreshPreviewPlaceholderVisibility();
    refreshHaStaleUi();
  }

  function previewImageHasSrc() {
    const s = previewImgEl.getAttribute('src');
    return !!(s && s.trim());
  }

  function refreshPreviewPlaceholderVisibility() {
    const ph = $('#od-preview-placeholder');
    const mode = getPreviewMode();
    ph.hidden =
      mode === 'sketch' ||
      !!(mode !== 'sketch' && previewImageHasSrc());
  }

  /** When HA-only mode, return to editable view (prefer overlay when a bitmap exists). */
  function leaveHaForEdit() {
    if (getPreviewMode() !== 'ha') return;
    const sel = previewImageHasSrc()
      ? 'overlay'
      : 'sketch';
    const inp = shadow.querySelector(
      `input[name="od-pvm"][value="${sel}"]`
    );
    if (inp) /** @type {HTMLInputElement} */ (inp).checked = true;
    syncPreviewFrameClass();
    redrawSketch();
  }

  function clearSelection() {
    selectedItemIdx = -1;
    sketchEdit = null;
    sketchCanvas.style.cursor = '';
  }

  function applyEditedPayload(parsed) {
    /** @type {HTMLTextAreaElement} */ ($('#od-payload')).value = dumpPayloadYaml(
      parsed
    );
    lastValidPayload = null;
    lastParseError = null;
    /** @type {HTMLElement} */ ($('#od-parse-status')).hidden = true;
    $('#od-parse-status').textContent = '';
    bumpYamlPreviewGenOnly();
    pushUndoSnapshot(taPayload.value);
    updateUndoRedoUi();
    rebuildExportSnippet();
    scheduleRedrawSketch();
    scheduleDebouncedHaPreview();
    renderDiagnostics(collectPayloadDiagnostics(parsed));
  }

  sketchCanvas.addEventListener('pointerdown', (ev) => {
    const parsed = silentParsePayload();
    if (!parsed) return;
    leaveHaForEdit();
    const pt = canvasClientToTagPoint(sketchCanvas, ev.clientX, ev.clientY);
    if (!pt) return;
    const { tagW, tagH } = getTagPx();

    /** @type {ReturnType<typeof getResizeHandles> | null} */
    let currentHandles = null;
    if (selectedItemIdx >= 0 && selectedItemIdx < parsed.length) {
      currentHandles = getResizeHandles(parsed[selectedItemIdx], hass, tagW, tagH);
      const h = hitTestHandle(pt.tx, pt.ty, currentHandles);
      if (h) {
        sketchCanvas.setPointerCapture(ev.pointerId);
        sketchEdit = {
          pointerId: ev.pointerId,
          mode: h.kind === 'meta' ? 'move' : 'resize',
          idx: selectedItemIdx,
          lastTx: pt.tx,
          lastTy: pt.ty,
          handle: h,
        };
        sketchCanvas.style.cursor = 'grabbing';
        ev.preventDefault();
        scheduleRedrawSketch();
        return;
      }
    }

    const idx = hitTestPayload(pt.tx, pt.ty, parsed, hass, tagW, tagH);
    if (idx < 0) {
      clearSelection();
      scheduleRedrawSketch();
      return;
    }
    selectedItemIdx = idx;
    sketchCanvas.setPointerCapture(ev.pointerId);
    sketchEdit = {
      pointerId: ev.pointerId,
      mode: 'move',
      idx,
      lastTx: pt.tx,
      lastTy: pt.ty,
      handle: null,
    };
    sketchCanvas.style.cursor = 'grabbing';
    ev.preventDefault();
    scheduleRedrawSketch();
  });

  sketchCanvas.addEventListener('pointermove', (ev) => {
    if (!sketchEdit) {
      const parsed = silentParsePayload();
      const pt = canvasClientToTagPoint(sketchCanvas, ev.clientX, ev.clientY);
      if (!parsed || !pt || selectedItemIdx < 0 || selectedItemIdx >= parsed.length) {
        sketchCanvas.style.cursor = '';
        return;
      }
      const { tagW, tagH } = getTagPx();
      const hs = getResizeHandles(parsed[selectedItemIdx], hass, tagW, tagH);
      const hh = hitTestHandle(pt.tx, pt.ty, hs);
      sketchCanvas.style.cursor =
        hh?.cursor ||
        (hitTestPayload(pt.tx, pt.ty, parsed, hass, tagW, tagH) >= 0 ? 'grab' : '');
      return;
    }
    const parsed = silentParsePayload();
    if (!parsed || sketchEdit.idx >= parsed.length) {
      sketchEdit = null;
      sketchCanvas.style.cursor = '';
      return;
    }
    const pt = canvasClientToTagPoint(sketchCanvas, ev.clientX, ev.clientY);
    if (!pt) return;
    const dx = pt.tx - sketchEdit.lastTx;
    const dy = pt.ty - sketchEdit.lastTy;
    sketchEdit.lastTx = pt.tx;
    sketchEdit.lastTy = pt.ty;
    if (dx === 0 && dy === 0) return;
    const el = parsed[sketchEdit.idx];
    if (!el || typeof el !== 'object' || Array.isArray(el)) return;

    if (sketchEdit.mode === 'resize' && sketchEdit.handle) {
      const { tagW, tagH } = getTagPx();
      resizePayloadItem(el, sketchEdit.handle, dx, dy, { hass, tagW, tagH });
    } else {
      translatePayloadItem(el, dx, dy);
    }
    applyEditedPayload(parsed);
    ev.preventDefault();
  });

  function stopSketchEdit() {
    sketchEdit = null;
    sketchCanvas.style.cursor = '';
    scheduleRedrawSketch();
  }

  sketchCanvas.addEventListener('pointerup', stopSketchEdit);
  sketchCanvas.addEventListener('lostpointercapture', stopSketchEdit);

  previewImgEl.addEventListener('pointerdown', () => leaveHaForEdit());

  previewFrame.addEventListener('dragover', (e) => {
    e.preventDefault();
    try {
      e.dataTransfer.dropEffect = 'copy';
    } catch {
      /* noop */
    }
  });

  previewFrame.addEventListener('drop', (e) => {
    e.preventDefault();
    yamlEditShowSketch();
    const kindRaw =
      e.dataTransfer?.getData(MIME_OD_PALETTE) ||
      e.dataTransfer?.getData('text/plain') ||
      '';
    const kind = String(kindRaw).trim();
    /** @type {Record<string, unknown> | undefined} */
    const base = PALETTE_DEFAULTS[kind];
    if (!base) return;
    const parsed = silentParsePayload();
    if (!parsed) {
      showToast('Fix YAML before adding elements.', true);
      return;
    }
    const pt = canvasClientToTagPoint(sketchCanvas, e.clientX, e.clientY);
    if (!pt) return;
    const { tagW, tagH } = getTagPx();
    const item = /** @type {Record<string, unknown>} */ (
      JSON.parse(JSON.stringify(base))
    );
    const b = estimateItemBounds(item, hass, tagW, tagH);
    if (b) {
      const cx = (b.x + b.x2) / 2;
      const cy = (b.y + b.y2) / 2;
      translatePayloadItem(item, pt.tx - cx, pt.ty - cy);
    }
    parsed.push(item);
    selectedItemIdx = parsed.length - 1;
    applyEditedPayload(parsed);
    validatePayload();
  });

  shadow.querySelectorAll('input[name="od-pvm"]').forEach((el) => {
    el.addEventListener('change', () => {
      syncPreviewFrameClass();
      redrawSketch();
    });
  });

  taPayload.addEventListener('input', () => {
    if (!suppressHistoryCapture) pushUndoSnapshot(taPayload.value);
    updateUndoRedoUi();
    yamlEditShowSketch();
    lastValidPayload = null;
    lastParseError = null;
    validatePayload();
    rebuildExportSnippet();
    scheduleDebouncedHaPreview();
    queueMicrotask(() => ac.maybeOpen());
  });
  taPayload.addEventListener('keydown', (e) => {
    const ctrlOrMeta = e.ctrlKey || e.metaKey;
    if (ctrlOrMeta && !e.altKey) {
      const key = String(e.key || '').toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoPayloadEdit();
        return;
      }
      if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redoPayloadEdit();
        return;
      }
    }
    if (e.key === 'Escape') {
      clearSelection();
      scheduleRedrawSketch();
    }
  });

  $('#od-preview').addEventListener('click', () =>
    void interactiveDrawcustom(true).catch(() => {})
  );
  $('#od-send').addEventListener('click', () => {
    if (!window.confirm('Push this image to the tag (real update)?')) return;
    void interactiveDrawcustom(false).catch(() => {});
  });
  $('#od-copy').addEventListener('click', copyExport);
  $('#od-undo').addEventListener('click', undoPayloadEdit);
  $('#od-redo').addEventListener('click', redoPayloadEdit);
  $('#od-apply-preset').addEventListener('click', applySelectedPreset);

  previewImgEl.addEventListener('load', () => {
    applyCombinedPreviewLayout();
    updateMeta();
    const raw = previewImgEl.dataset.odRequestBump;
    if (raw !== undefined && raw !== '') {
      const n = parseInt(String(raw).trim(), 10);
      haBmpReflectsYamlBump = Number.isFinite(n) ? n : null;
    } else {
      haBmpReflectsYamlBump = null;
    }
    refreshHaStaleUi();
    if (
      pendingAutoHaBumpTarget !== null &&
      pendingAutoHaBumpTarget === yamlPreviewBump
    ) {
      if (getPreviewMode() === 'sketch') {
        const haInp = shadow.querySelector('input[name="od-pvm"][value="ha"]');
        if (haInp) /** @type {HTMLInputElement} */ (haInp).checked = true;
        syncPreviewFrameClass();
      }
      pendingAutoHaBumpTarget = null;
    }
    if (getPreviewMode() !== 'ha') {
      scheduleRedrawSketch();
    }
  });

  previewImgEl.addEventListener('error', () => {
    pendingAutoHaBumpTarget = null;
  });

  $('#od-device').addEventListener('change', () => {
    clearSelection();
    clearHaDryRunPreview();
    refreshDeviceUiMode();
    syncDimensionInputsFromSelectedDevice();
    haDryApplyTicket += 1;
    updateMeta();
    rebuildExportSnippet();
    scheduleRedrawSketch();
    scheduleDebouncedHaPreview();
  });

  ['#od-bg', '#od-rot', '#od-dither', '#od-ttl', '#od-refresh'].forEach((id) => {
    shadow.querySelector(id)?.addEventListener('change', () => {
      if (id === '#od-rot') clearSelection();
      rebuildExportSnippet();
      scheduleRedrawSketch();
      scheduleDebouncedHaPreview();
    });
  });

  /** HA dry-run is only debounced from editor/device/options; omit here or state spam resets the timer forever. */
  function onHass() {
    refreshDeviceSelect();
    refreshDeviceUiMode();
    syncDimensionInputsFromSelectedDevice();
    updateMeta();
    rebuildExportSnippet();
    redrawSketch();
  }

  [virtualWInput, virtualHInput].forEach((inp) => {
    inp.addEventListener('input', () => {
      if (!isVirtualDeviceSelected()) return;
      updateMeta();
      scheduleRedrawSketch();
      rebuildExportSnippet();
    });
  });

  const setHass = (h) => {
    hass = h;
    onHass();
  };

  setHass(hass);
  refreshPresetOptions();
  pushUndoSnapshot(taPayload.value);
  updateUndoRedoUi();
  validatePayload();

  const previewResizeRo = new ResizeObserver(() => {
    scheduleRedrawSketch();
  });
  previewResizeRo.observe(previewFrame);

  syncPreviewFrameClass();
  refreshPreviewPlaceholderVisibility();

  requestAnimationFrame(() => {
    redrawSketch();
    rebuildExportSnippet();
    scheduleDebouncedHaPreview();
  });

  return {
    setHass,
    destroy() {
      previewResizeRo.disconnect();
      if (sketchDebounceTimer) clearTimeout(sketchDebounceTimer);
      if (haPreviewDebounceTimer) clearTimeout(haPreviewDebounceTimer);
      shadow.replaceChildren();
    },
  };
}
