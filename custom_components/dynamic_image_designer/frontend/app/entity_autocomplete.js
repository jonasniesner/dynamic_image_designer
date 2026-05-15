/**
 * Lightweight entity_id completion for a textarea (domain.entity style + states('...') context).
 */

/**
 * @returns {{ start: number; partial: string; quote: string | null } | null}
 */
export function getEntityTokenAtCursor(text, caret) {
  const before = text.slice(0, caret);
  const statesMatch = before.match(
    /\bstates\s*\(\s*(['"])([a-z][a-z0-9_]*(?:\.[a-z0-9_.]*)?)$/
  );
  if (statesMatch) {
    const partial = statesMatch[2];
    const quote = statesMatch[1];
    const idx = before.lastIndexOf(statesMatch[0]);
    const start = idx + statesMatch[0].length - partial.length;
    return { start, partial, quote };
  }
  let i = caret - 1;
  while (i >= 0 && /[a-z0-9_.]/i.test(text[i])) {
    i -= 1;
  }
  const start = i + 1;
  const partial = text.slice(start, caret);
  if (!partial || !/^[a-z][a-z0-9_]*(?:\.[a-z0-9_.]*)?$/i.test(partial)) {
    return null;
  }
  return /** @type {{ start: number; partial: string; quote: null }} */ ({
    start,
    partial,
    quote: null,
  });
}

/**
 * @returns {{ start:number; partial:string } | null}
 */
function getColorTokenAtCursor(text, caret) {
  const before = text.slice(0, caret);
  const lineStart = before.lastIndexOf('\n') + 1;
  const line = before.slice(lineStart);
  const m = line.match(
    /^\s*(?:color|fill|outline|background|legend_color|stroke_fill)\s*:\s*['"]?([a-z0-9_#-]*)$/i
  );
  if (!m) return null;
  const partial = m[1] || '';
  const start = lineStart + line.length - partial.length;
  return { start, partial };
}

/**
 * Pixel position of caret at `idx` relative to textarea's client box (below top border).
 * Mirrors laid out off-screen using current computed styles (works with Shadow DOM).
 * @param {HTMLTextAreaElement} ta
 * @param {number} idx
 * @returns {{ top: number; left: number; lineHeight: number }}
 */
function textareaCaretOffsets(ta, idx) {
  const win = ta.ownerDocument.defaultView;
  if (!win) return { top: 0, left: 0, lineHeight: 18 };

  const doc = ta.ownerDocument;
  const cs = win.getComputedStyle(ta);

  /** @type {HTMLElement} */
  const div = doc.createElement('div');
  const props = /** @type {const} */ ([
    ['box-sizing', cs.boxSizing],
    ['width', `${ta.clientWidth}px`],
    ['white-space', 'pre-wrap'],
    ['word-wrap', 'break-word'],
    ['overflow-wrap', 'break-word'],
    ['direction', cs.direction],
    ['text-align', cs.textAlign],
    ['text-transform', cs.textTransform],
    ['text-indent', cs.textIndent],
    ['padding-top', cs.paddingTop],
    ['padding-right', cs.paddingRight],
    ['padding-bottom', cs.paddingBottom],
    ['padding-left', cs.paddingLeft],
    ['border-top-width', cs.borderTopWidth],
    ['border-right-width', cs.borderRightWidth],
    ['border-bottom-width', cs.borderBottomWidth],
    ['border-left-width', cs.borderLeftWidth],
    ['font-family', cs.fontFamily],
    ['font-weight', cs.fontWeight],
    ['font-style', cs.fontStyle],
    ['letter-spacing', cs.letterSpacing],
    ['tab-size', cs.tabSize],
    ['word-spacing', cs.wordSpacing],
    ['line-height', cs.lineHeight],
    ['font-size', cs.fontSize],
    ['overflow', 'hidden'],
    ['visibility', 'hidden'],
    ['position', 'absolute'],
    ['top', '-5000px'],
    ['left', '0'],
  ]);
  for (let i = 0; i < props.length; i += 1) {
    const [k, v] = props[i];
    div.style.setProperty(k, String(v));
  }

  div.textContent = ta.value.slice(0, idx);
  const span = doc.createElement('span');
  span.textContent = ta.value.slice(idx) || '\u200b';
  div.appendChild(span);

  doc.body.appendChild(div);
  const top = span.offsetTop;
  const left = span.offsetLeft;
  const lhRaw = cs.lineHeight;
  const lhPx =
    lhRaw.endsWith('px') ? parseFloat(lhRaw) : parseFloat(cs.fontSize) * 1.45;
  const lineHeight = Number.isFinite(lhPx) && lhPx > 0 ? lhPx : 18;
  doc.body.removeChild(div);

  return { top, left, lineHeight };
}

/**
 * @param {any} hass
 * @param {string} partial
 * @param {number} limit
 */
export function filterEntityIds(hass, partial, limit = 40) {
  const keys = hass?.states ? Object.keys(hass.states) : [];
  const pl = partial.toLowerCase();
  const scored = keys
    .filter((k) => k.toLowerCase().startsWith(pl) || k.toLowerCase().includes(pl))
    .sort((a, b) => {
      const al = a.toLowerCase().startsWith(pl);
      const bl = b.toLowerCase().startsWith(pl);
      if (al !== bl) return al ? -1 : 1;
      return a.localeCompare(b);
    });
  return scored.slice(0, limit);
}

/**
 * @param {string[]} colors
 * @param {string} partial
 */
function filterColors(colors, partial) {
  const pl = String(partial || '').toLowerCase();
  return colors
    .filter((c) => c.toLowerCase().startsWith(pl) || c.toLowerCase().includes(pl))
    .slice(0, 20);
}

/**
 * @param {HTMLTextAreaElement} ta
 * @param {number} start
 * @param {number} end
 * @param {string} insert
 */
export function replaceRange(ta, start, end, insert) {
  const v = ta.value;
  ta.value = v.slice(0, start) + insert + v.slice(end);
  const np = start + insert.length;
  ta.selectionStart = ta.selectionEnd = np;
  ta.focus();
  ta.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * @param {HTMLElement} wrap
 * @param {HTMLTextAreaElement} ta
 * @param {() => any} getHass
 */
export function setupEntityAutocomplete(wrap, ta, getHass, opts = {}) {
  const list = document.createElement('ul');
  list.className = 'od-autocomplete';
  list.hidden = true;
  list.setAttribute('role', 'listbox');
  wrap.appendChild(list);

  let active = -1;
  let token = /** @type {ReturnType<typeof getEntityTokenAtCursor> & { end?: number }} */ (null);
  let suggestions = /** @type {string[]} */ ([]);

  function hide() {
    list.hidden = true;
    list.replaceChildren();
    active = -1;
    token = null;
    suggestions = [];
  }

  function positionList() {
    const anchor = token
      ? Math.min(token.start, ta.value.length)
      : ta.selectionStart;

    let cTop = 0;
    let cLeft = 0;
    let lineHeight = 18;
    try {
      ({ top: cTop, left: cLeft, lineHeight } = textareaCaretOffsets(
        ta,
        anchor
      ));
    } catch {
      hide();
      return;
    }

    let x =
      ta.offsetLeft + ta.clientLeft + cLeft - ta.scrollLeft;
    const lineTop = ta.offsetTop + ta.clientTop + cTop - ta.scrollTop;
    let y = lineTop + lineHeight;

    const pad = 4;
    const maxWAvail = wrap.clientWidth - pad * 2;
    const preferredW = Math.min(460, Math.max(200, ta.clientWidth));
    let listW = Math.min(preferredW, Math.max(160, wrap.clientWidth - x - pad));
    listW = Math.max(140, Math.min(listW, maxWAvail));

    if (x + listW + pad > wrap.clientWidth) {
      x = Math.max(pad, wrap.clientWidth - listW - pad);
    }
    x = Math.max(pad, x);

    const estH = Math.min(
      Math.max(list.scrollHeight || 0, suggestions.length * 34 + 20),
      280
    );
    if (y + estH + pad > wrap.clientHeight) {
      const aboveY = lineTop - estH - 6;
      if (aboveY >= pad) y = aboveY;
    }

    list.style.left = `${x}px`;
    list.style.top = `${Math.max(pad, y)}px`;
    list.style.width = `${listW}px`;
  }

  function renderList(items) {
    list.replaceChildren();
    items.forEach((id, idx) => {
      const li = document.createElement('li');
      li.textContent = id;
      li.dataset.idx = String(idx);
      li.setAttribute('role', 'option');
      if (idx === active) li.classList.add('active');
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        pick(idx);
      });
      list.appendChild(li);
    });
    list.hidden = items.length === 0;
    positionList();
    requestAnimationFrame(() => {
      if (!list.hidden && suggestions.length > 0) positionList();
    });
  }

  function pick(idx) {
    if (!token || idx < 0 || idx >= suggestions.length) return;
    const choice = suggestions[idx];
    const end = ta.selectionStart;
    replaceRange(ta, token.start, end, choice);
    hide();
  }

  function refresh() {
    const hass = getHass();
    const caret = ta.selectionStart;
    const colorToken = getColorTokenAtCursor(ta.value, caret);
    if (colorToken) {
      token = /** @type {{ start:number; partial:string; quote:null }} */ ({
        start: colorToken.start,
        partial: colorToken.partial,
        quote: null,
      });
      const colors =
        typeof opts.getColorSuggestions === 'function'
          ? opts.getColorSuggestions()
          : ['white', 'black'];
      suggestions = filterColors(colors, colorToken.partial);
      if (suggestions.length === 0) {
        hide();
        return;
      }
      active = 0;
      renderList(suggestions);
      return;
    }
    const t = getEntityTokenAtCursor(ta.value, caret);
    if (!t || t.partial.length < 1) {
      hide();
      return;
    }
    token = /** @type {typeof t & { end?: number }} */ (t);
    suggestions = filterEntityIds(hass, t.partial);
    if (suggestions.length === 0) {
      hide();
      return;
    }
    active = 0;
    renderList(suggestions);
  }

  ta.addEventListener('blur', () => {
    setTimeout(hide, 150);
  });
  ta.addEventListener('scroll', () => {
    if (!list.hidden) positionList();
  });

  ta.addEventListener('keydown', (e) => {
    if (list.hidden) {
      if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
        e.preventDefault();
        refresh();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      hide();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(active + 1, suggestions.length - 1);
      renderList(suggestions);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(active - 1, 0);
      renderList(suggestions);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      pick(active);
    }
  });

  ta.addEventListener('input', () => {
    if (!list.hidden) refresh();
  });

  return {
    refresh,
    hide,
    maybeOpen() {
      refresh();
    },
  };
}
