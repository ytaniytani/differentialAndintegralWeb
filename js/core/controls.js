// UI部品: スライダー・ボタン群・トグル・数値表示・レイアウト

export function el(tag, cls, parent) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
}

// スライダー + 数値入力(双方向同期)
export function slider(parent, o) {
  const wrap = el('div', 'ctl', parent);
  const lab = el('span', 'ctl-label', wrap);
  lab.textContent = o.label;
  const range = el('input', '', wrap);
  range.type = 'range';
  range.min = o.min; range.max = o.max; range.step = o.step ?? 1; range.value = o.value;
  range.setAttribute('aria-label', o.label);
  const num = el('input', 'ctl-num', wrap);
  num.type = 'number';
  num.min = o.min; num.max = o.max; num.step = o.step ?? 1; num.value = o.value;
  num.setAttribute('aria-label', o.label + '(数値入力)');
  if (o.unit) el('span', 'ctl-unit', wrap).textContent = o.unit;
  const fire = v => { range.setAttribute('aria-valuetext', `${v}${o.unit || ''}`); o.oninput && o.oninput(+v); };
  range.addEventListener('input', () => { num.value = range.value; fire(range.value); });
  num.addEventListener('input', () => {
    if (num.value === '') return;
    range.value = num.value; fire(range.value);
  });
  return {
    el: wrap,
    get value() { return +range.value; },
    set value(v) { range.value = v; num.value = range.value; },
  };
}

// 排他ボタン群
export function segmented(parent, o) {
  const wrap = el('div', 'ctl', parent);
  if (o.label) el('span', 'ctl-label', wrap).textContent = o.label;
  const g = el('div', 'seg', wrap);
  let val = o.value;
  const btns = {};
  for (const opt of o.options) {
    const b = el('button', 'seg-btn', g);
    b.type = 'button';
    b.textContent = opt.label;
    btns[opt.key] = b;
    if (opt.key === val) b.classList.add('on');
    b.onclick = () => {
      if (val === opt.key) return;
      btns[val]?.classList.remove('on');
      val = opt.key;
      b.classList.add('on');
      o.onchange && o.onchange(val);
    };
  }
  return {
    el: wrap,
    get value() { return val; },
    set value(k) { btns[val]?.classList.remove('on'); val = k; btns[k]?.classList.add('on'); },
  };
}

export function toggle(parent, o) {
  const lab = el('label', 'ctl tgl', parent);
  const cb = el('input', '', lab);
  cb.type = 'checkbox';
  cb.checked = !!o.value;
  el('span', '', lab).textContent = o.label;
  cb.onchange = () => o.onchange && o.onchange(cb.checked);
  return {
    el: lab,
    get value() { return cb.checked; },
    set value(v) { cb.checked = v; },
  };
}

export function button(parent, label, onclick, cls = '') {
  const b = el('button', 'btn' + (cls ? ' ' + cls : ''), parent);
  b.type = 'button';
  b.textContent = label;
  b.onclick = onclick;
  return b;
}

export function readout(parent, label) {
  const w = el('div', 'readout', parent);
  el('span', 'ro-label', w).textContent = label;
  const v = el('span', 'ro-value', w);
  return {
    el: w,
    set(text, color) { v.textContent = text; v.style.color = color || ''; },
  };
}

// 左右(縦積み)ペインのレイアウト。caps[i] が null なら見出しなし。
// 'wide:' プレフィックスで全幅ペイン。
export function panes(root, caps) {
  const grid = el('div', 'panes', root);
  return caps.map(c => {
    let cls = 'pane', cap = c;
    if (c && c.startsWith('wide:')) { cls += ' wide'; cap = c.slice(5); }
    const p = el('div', cls, grid);
    if (cap) el('div', 'pane-cap', p).textContent = cap;
    return p;
  });
}

export function canvasIn(parent, h) {
  const c = el('canvas', 'demo-canvas', parent);
  if (h) c.style.height = h + 'px';
  return c;
}

export function controlsRow(root) {
  return el('div', 'controls', root);
}

export function hint(parent, text) {
  el('p', 'hint', parent).textContent = text;
}

// リサイズ(デバウンス)
const resizeFns = new Set();
let rT = 0;
window.addEventListener('resize', () => {
  clearTimeout(rT);
  rT = setTimeout(() => resizeFns.forEach(f => f()), 150);
});
export function onResize(f) { resizeFns.add(f); }

// ポインタ位置(CSSピクセル、canvas左上原点)
export function pointerPos(canvas, ev) {
  const r = canvas.getBoundingClientRect();
  return [ev.clientX - r.left, ev.clientY - r.top];
}

// キャンバスをCSSサイズ+devicePixelRatioに合わせ、CSSピクセル座標系のctxを返す
export function fitCanvas(canvas) {
  const r = canvas.getBoundingClientRect();
  const d = window.devicePixelRatio || 1;
  canvas.width = Math.max(2, Math.round(r.width * d));
  canvas.height = Math.max(2, Math.round(r.height * d));
  const g = canvas.getContext('2d');
  g.setTransform(d, 0, 0, d, 0, 0);
  return { g, w: r.width, h: r.height };
}
