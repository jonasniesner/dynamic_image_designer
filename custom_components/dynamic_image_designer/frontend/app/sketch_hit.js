import { resolveTemplates } from './preview_sketch.js';

const HANDLE_RADIUS = 5.5;
const HANDLE_SIZE = HANDLE_RADIUS * 2;
const MIN_SIZE = 4;
const MIN_RADIUS = 2;

/** @param {number} n */
function roundPx(n) {
  return Math.round(n);
}

/** @param {unknown} v */
function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** @param {number} v */
function clampMin(v, min) {
  return Number.isFinite(v) ? Math.max(min, v) : min;
}

/** @param {{ x:number,y:number,x2:number,y2:number }} b */
function bCenter(b) {
  return { x: (b.x + b.x2) / 2, y: (b.y + b.y2) / 2 };
}

/**
 * @typedef {{
 *  id: string;
 *  kind: 'bbox' | 'endpoint' | 'vertex' | 'radius' | 'center' | 'meta';
 *  x: number;
 *  y: number;
 *  cursor?: string;
 *  axis?: 'x'|'y'|'xy';
 *  vertexIndex?: number;
 * }} ResizeHandle
 */

/**
 * Rough axis-aligned bounds in tag space (logical w × h pixels).
 * @returns {{ x: number; y: number; x2: number; y2: number } | null}
 */
export function estimateItemBounds(item, hass, tagW, tagH) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
  const o = /** @type {Record<string, unknown>} */ (item);
  const type = String(o.type || '').toLowerCase();
  const fn = (v, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };
  const pad = 6;

  switch (type) {
    case 'text': {
      const x = fn(o.x);
      const y = fn(o.y);
      const size = Math.max(8, fn(o.size, 20));
      const val = resolveTemplates(hass, /** @type {string} */ (o.value ?? ''));
      const lines = val.split(/\r?\n/);
      const maxLen = Math.max(...lines.map((s) => s.length), 1);
      const tw = Math.min(tagW - x, maxLen * size * 0.62 + pad);
      const th = Math.min(tagH - y, lines.length * size * 1.2 + pad);
      return { x: x - 2, y: y - 2, x2: x + tw, y2: y + th };
    }
    case 'line': {
      const xs = fn(o.x_start);
      const ys = fn(o.y_start);
      const xe = fn(o.x_end);
      const ye = fn(o.y_end);
      const lw = Math.max(fn(o.width, 2), 4);
      const mix = Math.min(xs, xe) - lw;
      const miy = Math.min(ys, ye) - lw;
      const mx = Math.max(xs, xe) + lw;
      const my = Math.max(ys, ye) + lw;
      return { x: mix, y: miy, x2: mx, y2: my };
    }
    case 'rectangle': {
      if (o.x_start != null && o.x_end != null && o.y_start != null && o.y_end != null) {
        const x1 = fn(o.x_start);
        const y1 = fn(o.y_start);
        const x2 = fn(o.x_end);
        const y2 = fn(o.y_end);
        return {
          x: Math.min(x1, x2),
          y: Math.min(y1, y2),
          x2: Math.max(x1, x2),
          y2: Math.max(y1, y2),
        };
      }
      return {
        x: fn(o.x),
        y: fn(o.y),
        x2: fn(o.x) + fn(o.width, 10),
        y2: fn(o.y) + fn(o.height, 10),
      };
    }
    case 'rectangle_pattern': {
      const x0 = fn(o.x_start);
      const y0 = fn(o.y_start);
      const xrep = Math.max(1, Math.floor(Number(o.x_repeat) || 1));
      const yrep = Math.max(1, Math.floor(Number(o.y_repeat) || 1));
      const xs = fn(o.x_size, 8);
      const ys = fn(o.y_size, 8);
      const xo = fn(o.x_offset, 0);
      const yo = fn(o.y_offset, 0);
      const bx = x0 + xrep * xs + Math.max(0, xrep - 1) * xo;
      const by = y0 + yrep * ys + Math.max(0, yrep - 1) * yo;
      return { x: x0 - 2, y: y0 - 2, x2: bx + 2, y2: by + 2 };
    }
    case 'polygon': {
      const pts = /** @type {unknown[]} */ (o.points);
      if (!Array.isArray(pts) || pts.length === 0) return null;
      let mix = Infinity;
      let miy = Infinity;
      let mx = -Infinity;
      let my = -Infinity;
      for (const pt of pts) {
        const p = /** @type {number[]} */ (pt);
        const px = Number(p?.[0]);
        const py = Number(p?.[1]);
        if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
        mix = Math.min(mix, px);
        miy = Math.min(miy, py);
        mx = Math.max(mx, px);
        my = Math.max(my, py);
      }
      if (!Number.isFinite(mix)) return null;
      return { x: mix, y: miy, x2: mx, y2: my };
    }
    case 'circle': {
      const cx = fn(o.x);
      const cy = fn(o.y);
      const r = fn(o.radius, 20);
      return {
        x: cx - r - 2,
        y: cy - r - 2,
        x2: cx + r + 2,
        y2: cy + r + 2,
      };
    }
    case 'ellipse': {
      const x1 = fn(o.x_start);
      const y1 = fn(o.y_start);
      const x2 = fn(o.x_end);
      const y2 = fn(o.y_end);
      return {
        x: Math.min(x1, x2) - 2,
        y: Math.min(y1, y2) - 2,
        x2: Math.max(x1, x2) + 2,
        y2: Math.max(y1, y2) + 2,
      };
    }
    case 'arc': {
      const cx = fn(o.cx, fn(o.x));
      const cy = fn(o.cy, fn(o.y));
      const r = fn(o.radius, 30);
      return {
        x: cx - r - 2,
        y: cy - r - 2,
        x2: cx + r + 2,
        y2: cy + r + 2,
      };
    }
    case 'progress_bar':
    case 'plot': {
      const xs = fn(o.x_start);
      const ys = fn(o.y_start);
      const xe = fn(o.x_end);
      const ye = fn(o.y_end);
      return {
        x: Math.min(xs, xe),
        y: Math.min(ys, ye),
        x2: Math.max(xs, xe),
        y2: Math.max(ys, ye),
      };
    }
    case 'icon': {
      const x = fn(o.x);
      const y = fn(o.y);
      const sz = fn(o.size, 24);
      const box = sz * 1.1;
      return {
        x: x - 2,
        y: y - 2,
        x2: x + box + 2,
        y2: y + box + 2,
      };
    }
    case 'qrcode':
    case 'qr_code': {
      const x = fn(o.x);
      const y = fn(o.y);
      const bs = Math.max(24, fn(o.boxsize, 2) * 24);
      return { x, y, x2: x + bs, y2: y + bs };
    }
    case 'multiline': {
      const x = fn(o.x);
      const y = fn(o.y);
      const lines = String(o.value ?? '').split(String(o.delimiter || '|'));
      const oy = Math.max(10, fn(o.offset_y, 20));
      return {
        x: x - 2,
        y: y - 2,
        x2: x + Math.min(tagW - x, 160),
        y2: y + lines.length * oy + 4,
      };
    }
    case 'dlimg': {
      const x = fn(o.x);
      const y = fn(o.y);
      return {
        x,
        y,
        x2: x + fn(o.xsize, 48),
        y2: y + fn(o.ysize, 48),
      };
    }
    case 'diagram': {
      const x = fn(o.x);
      const h = fn(o.height, 80);
      const w = fn(o.width, 200);
      return { x, y: 0, x2: x + w, y2: h };
    }
    case 'icon_sequence': {
      const x = fn(o.x);
      const y = fn(o.y);
      const sz = fn(o.size, 20);
      const sp = fn(o.spacing, sz / 4);
      const icons = /** @type {unknown[]} */ (Array.isArray(o.icons) ? o.icons : []);
      const n = Math.max(1, icons.length);
      const dir = String(o.direction || 'right');
      if (dir === 'down' || dir === 'up') {
        return { x: x - 2, y: y - 2, x2: x + sz + 6, y2: y + n * (sz + sp) + 4 };
      }
      return { x: x - 2, y: y - 2, x2: x + n * (sz + sp) + 4, y2: y + sz + 6 };
    }
    case 'debug_grid':
      return { x: 0, y: 0, x2: tagW, y2: tagH };
    default:
      return {
        x: fn(o.x, fn(o.x_start)) - pad,
        y: fn(o.y, fn(o.y_start)) - pad,
        x2: fn(o.x, fn(o.x_start)) + pad * 10,
        y2: fn(o.y, fn(o.y_start)) + pad * 4,
      };
  }
}

/**
 * Hit test payload item indices from top-most draw order backward.
 */
export function hitTestPayload(pxTag, pyTag, payload, hass, tagW, tagH) {
  for (let i = payload.length - 1; i >= 0; i -= 1) {
    const item = payload[i];
    const b = estimateItemBounds(item, hass, tagW, tagH);
    if (!b) continue;
    if (
      pxTag >= b.x &&
      pyTag >= b.y &&
      pxTag <= b.x2 &&
      pyTag <= b.y2
    ) {
      return i;
    }
  }
  return -1;
}

/**
 * @param {HTMLCanvasElement} canvas
 * @param {number} clientX
 * @param {number} clientY
 */
export function canvasClientToTagPoint(canvas, clientX, clientY) {
  const inv = /** @type {DOMMatrix | undefined} */ (
    canvas.__odPxToTag
  );
  if (!inv) return null;
  const rect = canvas.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  const mx =
    ((clientX - rect.left) / rect.width) * canvas.width;
  const my =
    ((clientY - rect.top) / rect.height) * canvas.height;
  const p = inv.transformPoint(new DOMPoint(mx, my));
  return { tx: p.x, ty: p.y };
}

/**
 * @param {Record<string, unknown>} o
 * @returns {{ x:number,y:number,x2:number,y2:number } | null}
 */
function rectEdgesFromItem(o) {
  if (
    o.x_start != null &&
    o.x_end != null &&
    o.y_start != null &&
    o.y_end != null
  ) {
    return {
      x: num(o.x_start),
      y: num(o.y_start),
      x2: num(o.x_end),
      y2: num(o.y_end),
    };
  }
  if (o.x != null || o.y != null || o.width != null || o.height != null) {
    const x = num(o.x);
    const y = num(o.y);
    return {
      x,
      y,
      x2: x + num(o.width || 48),
      y2: y + num(o.height || 28),
    };
  }
  return null;
}

/**
 * @param {{ x:number,y:number,x2:number,y2:number }} b
 * @returns {ResizeHandle[]}
 */
function bboxHandles(b) {
  const c = bCenter(b);
  return [
    { id: 'nw', kind: 'bbox', x: b.x, y: b.y, cursor: 'nwse-resize', axis: 'xy' },
    { id: 'n', kind: 'bbox', x: c.x, y: b.y, cursor: 'ns-resize', axis: 'y' },
    { id: 'ne', kind: 'bbox', x: b.x2, y: b.y, cursor: 'nesw-resize', axis: 'xy' },
    { id: 'e', kind: 'bbox', x: b.x2, y: c.y, cursor: 'ew-resize', axis: 'x' },
    { id: 'se', kind: 'bbox', x: b.x2, y: b.y2, cursor: 'nwse-resize', axis: 'xy' },
    { id: 's', kind: 'bbox', x: c.x, y: b.y2, cursor: 'ns-resize', axis: 'y' },
    { id: 'sw', kind: 'bbox', x: b.x, y: b.y2, cursor: 'nesw-resize', axis: 'xy' },
    { id: 'w', kind: 'bbox', x: b.x, y: c.y, cursor: 'ew-resize', axis: 'x' },
  ];
}

/**
 * @returns {ResizeHandle[]}
 */
export function getResizeHandles(item, hass, tagW, tagH) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
  const o = /** @type {Record<string, unknown>} */ (item);
  const type = String(o.type || '').toLowerCase();
  const b = estimateItemBounds(item, hass, tagW, tagH);
  if (!b) return [];

  if (type === 'line' || type === 'plot' || type === 'progress_bar') {
    const xs = num(o.x_start);
    const ys = num(o.y_start);
    const xe = num(o.x_end);
    const ye = num(o.y_end);
    const c = { x: (xs + xe) / 2, y: (ys + ye) / 2 };
    return [
      { id: 'p0', kind: 'endpoint', x: xs, y: ys, cursor: 'move' },
      { id: 'p1', kind: 'endpoint', x: xe, y: ye, cursor: 'move' },
      { id: 'body', kind: 'meta', x: c.x, y: c.y, cursor: 'grab' },
    ];
  }
  if (type === 'polygon') {
    const pts = /** @type {unknown[]} */ (o.points);
    if (!Array.isArray(pts)) return bboxHandles(b);
    /** @type {ResizeHandle[]} */
    const hs = [];
    for (let i = 0; i < pts.length; i += 1) {
      const p = /** @type {number[]} */ (pts[i]);
      const x = num(p?.[0]);
      const y = num(p?.[1]);
      hs.push({
        id: `v${i}`,
        kind: 'vertex',
        x,
        y,
        cursor: 'move',
        vertexIndex: i,
      });
    }
    return hs;
  }
  if (type === 'circle' || type === 'arc') {
    const cx = type === 'arc' ? num(o.cx ?? o.x) : num(o.x);
    const cy = type === 'arc' ? num(o.cy ?? o.y) : num(o.y);
    const r = clampMin(num(o.radius || 20), MIN_RADIUS);
    return [
      { id: 'center', kind: 'center', x: cx, y: cy, cursor: 'move' },
      { id: 'radius', kind: 'radius', x: cx + r, y: cy, cursor: 'ew-resize' },
    ];
  }
  if (type === 'debug_grid') {
    const c = bCenter(b);
    return [{ id: 'meta', kind: 'meta', x: c.x, y: c.y, cursor: 'default' }];
  }
  return bboxHandles(b);
}

/**
 * @param {number} pxTag
 * @param {number} pyTag
 * @param {ResizeHandle[]} handles
 * @returns {ResizeHandle | null}
 */
export function hitTestHandle(pxTag, pyTag, handles) {
  for (let i = handles.length - 1; i >= 0; i -= 1) {
    const h = handles[i];
    const dx = pxTag - h.x;
    const dy = pyTag - h.y;
    if (dx * dx + dy * dy <= HANDLE_RADIUS * HANDLE_RADIUS * 1.8) return h;
  }
  return null;
}

/**
 * @param {Record<string, unknown>} o
 * @param {{x:number,y:number,x2:number,y2:number}} base
 * @param {string} id
 * @param {number} dx
 * @param {number} dy
 */
function applyBboxResize(o, base, id, dx, dy) {
  let x1 = base.x;
  let y1 = base.y;
  let x2 = base.x2;
  let y2 = base.y2;
  if (id.includes('w')) x1 += dx;
  if (id.includes('e')) x2 += dx;
  if (id.includes('n')) y1 += dy;
  if (id.includes('s')) y2 += dy;
  if (id === 'n' || id === 's') {
    x1 = base.x;
    x2 = base.x2;
  }
  if (id === 'e' || id === 'w') {
    y1 = base.y;
    y2 = base.y2;
  }
  if (Math.abs(x2 - x1) < MIN_SIZE) {
    if (id.includes('w')) x1 = x2 - MIN_SIZE;
    else x2 = x1 + MIN_SIZE;
  }
  if (Math.abs(y2 - y1) < MIN_SIZE) {
    if (id.includes('n')) y1 = y2 - MIN_SIZE;
    else y2 = y1 + MIN_SIZE;
  }

  const type = String(o.type || '').toLowerCase();
  if (
    type === 'rectangle' &&
    o.x_start != null &&
    o.x_end != null &&
    o.y_start != null &&
    o.y_end != null
  ) {
    o.x_start = roundPx(x1);
    o.y_start = roundPx(y1);
    o.x_end = roundPx(x2);
    o.y_end = roundPx(y2);
    return;
  }
  if (type === 'ellipse' || type === 'plot' || type === 'progress_bar') {
    o.x_start = roundPx(x1);
    o.y_start = roundPx(y1);
    o.x_end = roundPx(x2);
    o.y_end = roundPx(y2);
    return;
  }
  if (type === 'dlimg') {
    o.x = roundPx(Math.min(x1, x2));
    o.y = roundPx(Math.min(y1, y2));
    o.xsize = roundPx(clampMin(Math.abs(x2 - x1), MIN_SIZE));
    o.ysize = roundPx(clampMin(Math.abs(y2 - y1), MIN_SIZE));
    return;
  }
  if (type === 'qrcode' || type === 'qr_code') {
    const side = clampMin(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)), 8);
    o.x = roundPx(Math.min(x1, x2));
    o.y = roundPx(Math.min(y1, y2));
    if (o.box_size != null) o.box_size = roundPx(side);
    else o.boxsize = roundPx(Math.max(1, side / 24));
    return;
  }
  if (type === 'rectangle_pattern') {
    const w = clampMin(Math.abs(x2 - x1), MIN_SIZE);
    const h = clampMin(Math.abs(y2 - y1), MIN_SIZE);
    o.x_start = roundPx(Math.min(x1, x2));
    o.y_start = roundPx(Math.min(y1, y2));
    o.x_size = roundPx(w / Math.max(1, Math.floor(num(o.x_repeat) || 1)));
    o.y_size = roundPx(h / Math.max(1, Math.floor(num(o.y_repeat) || 1)));
    return;
  }
  if (type === 'icon' || type === 'icon_sequence') {
    const size = clampMin(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)), 8);
    o.x = roundPx(Math.min(x1, x2));
    o.y = roundPx(Math.min(y1, y2));
    o.size = roundPx(size);
    if (type === 'icon_sequence') {
      const icons = /** @type {unknown[]} */ (Array.isArray(o.icons) ? o.icons : []);
      const n = Math.max(1, icons.length);
      const dir = String(o.direction || 'right');
      if (dir === 'down' || dir === 'up') {
        o.spacing = roundPx(clampMin((Math.abs(y2 - y1) - n * size) / Math.max(1, n - 1), 0));
      } else {
        o.spacing = roundPx(clampMin((Math.abs(x2 - x1) - n * size) / Math.max(1, n - 1), 0));
      }
    }
    return;
  }
  if (type === 'text' || type === 'multiline') {
    const nextSize = clampMin(Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1)) * 0.18, 8);
    o.size = roundPx(nextSize);
    if (type === 'multiline' && o.offset_y != null) {
      o.offset_y = roundPx(clampMin(num(o.offset_y) + dy, 8));
    }
    return;
  }
  if (type === 'diagram') {
    o.x = roundPx(Math.min(x1, x2));
    o.width = roundPx(clampMin(Math.abs(x2 - x1), MIN_SIZE));
    o.height = roundPx(clampMin(Math.abs(y2 - y1), MIN_SIZE));
    return;
  }
  if (o.x != null || o.y != null || o.width != null || o.height != null) {
    o.x = roundPx(Math.min(x1, x2));
    o.y = roundPx(Math.min(y1, y2));
    o.width = roundPx(clampMin(Math.abs(x2 - x1), MIN_SIZE));
    o.height = roundPx(clampMin(Math.abs(y2 - y1), MIN_SIZE));
  } else {
    o.x_start = roundPx(x1);
    o.y_start = roundPx(y1);
    o.x_end = roundPx(x2);
    o.y_end = roundPx(y2);
  }
}

/**
 * Resize item by handle in tag space (mutates item object).
 * @param {unknown} item
 * @param {ResizeHandle} handle
 * @param {number} dx
 * @param {number} dy
 * @param {{ hass:any; tagW:number; tagH:number }} opts
 */
export function resizePayloadItem(item, handle, dx, dy, opts) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return;
  const o = /** @type {Record<string, unknown>} */ (item);
  const type = String(o.type || '').toLowerCase();
  if (handle.kind === 'meta') return;
  if (type === 'debug_grid') return;

  if (type === 'line' || type === 'plot' || type === 'progress_bar') {
    if (handle.id === 'p0') {
      o.x_start = roundPx(num(o.x_start) + dx);
      o.y_start = roundPx(num(o.y_start) + dy);
    } else if (handle.id === 'p1') {
      o.x_end = roundPx(num(o.x_end) + dx);
      o.y_end = roundPx(num(o.y_end) + dy);
    }
    return;
  }
  if (type === 'polygon' && handle.kind === 'vertex') {
    const pts = /** @type {unknown[]} */ (o.points);
    if (!Array.isArray(pts)) return;
    const i = handle.vertexIndex ?? -1;
    if (i < 0 || i >= pts.length) return;
    const row = /** @type {number[]} */ (Array.isArray(pts[i]) ? [...pts[i]] : [0, 0]);
    row[0] = roundPx(num(row[0]) + dx);
    row[1] = roundPx(num(row[1]) + dy);
    pts[i] = row;
    o.points = pts;
    return;
  }
  if (type === 'circle' || type === 'arc') {
    if (handle.kind === 'center') {
      if (type === 'arc') {
        if (o.cx != null || o.x == null) o.cx = roundPx(num(o.cx ?? o.x) + dx);
        else o.x = roundPx(num(o.x) + dx);
        if (o.cy != null || o.y == null) o.cy = roundPx(num(o.cy ?? o.y) + dy);
        else o.y = roundPx(num(o.y) + dy);
      } else {
        o.x = roundPx(num(o.x) + dx);
        o.y = roundPx(num(o.y) + dy);
      }
      return;
    }
    if (handle.kind === 'radius') {
      const cx = type === 'arc' ? num(o.cx ?? o.x) : num(o.x);
      const cy = type === 'arc' ? num(o.cy ?? o.y) : num(o.y);
      const baseRadius = clampMin(num(o.radius || 20), MIN_RADIUS);
      const nx = cx + baseRadius + dx;
      const ny = cy + dy;
      o.radius = roundPx(clampMin(Math.hypot(nx - cx, ny - cy), MIN_RADIUS));
      return;
    }
  }

  const base = estimateItemBounds(item, opts.hass, opts.tagW, opts.tagH);
  if (!base) return;
  applyBboxResize(o, base, handle.id, dx, dy);
}

/**
 * @returns {{ r:number, d:number }}
 */
export function getHandleVisualSpec() {
  return { r: HANDLE_RADIUS, d: HANDLE_SIZE };
}

/**
 * Translate item geometry by dx, dy in tag space (mutates item object).
 */
export function translatePayloadItem(item, dx, dy) {
  const o = /** @type {Record<string, unknown>} */ (item);
  const type = String(o.type || '').toLowerCase();
  /** @param {string} k */
  const shift = (k) => {
    const v = o[k];
    if (v === undefined || v === null) return;
    const n = Number(v);
    if (!Number.isFinite(n)) return;
    const yKey =
      k === 'y' || k === 'cy' || k === 'y_start' || k === 'y_end';
    o[k] = roundPx(n + (yKey ? dy : dx));
  };
  switch (type) {
    case 'text':
    case 'multiline':
    case 'qr_code':
    case 'qrcode':
    case 'dlimg':
      shift('x');
      shift('y');
      return;
    case 'arc':
      shift('x');
      shift('y');
      shift('cx');
      shift('cy');
      return;
    case 'rectangle':
      shift('x_start');
      shift('x_end');
      shift('y_start');
      shift('y_end');
      shift('x');
      shift('y');
      return;
    case 'rectangle_pattern':
      shift('x_start');
      shift('y_start');
      return;
    case 'circle':
      shift('x');
      shift('y');
      return;
    case 'ellipse':
      shift('x_start');
      shift('x_end');
      shift('y_start');
      shift('y_end');
      return;
    case 'icon':
    case 'icon_sequence':
      shift('x');
      shift('y');
      return;
    case 'diagram':
      shift('x');
      return;
    case 'line':
    case 'plot':
    case 'progress_bar':
      shift('x_start');
      shift('y_start');
      shift('x_end');
      shift('y_end');
      return;
    case 'polygon': {
      const pts = /** @type {unknown[]} */ (o.points);
      if (!Array.isArray(pts)) return;
      o.points = pts.map((row) => {
        const xy = /** @type {number[]} */ (Array.isArray(row) ? [...row] : []);
        xy[0] = roundPx(Number(xy[0]) + dx);
        xy[1] = roundPx(Number(xy[1]) + dy);
        return xy;
      });
      return;
    }
    default:
      shift('x');
      shift('y');
      shift('x_start');
      shift('y_start');
  }
}
