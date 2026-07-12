// 軽量グラフ描画エンジン(Canvas 2D)
// データ座標 <-> ピクセル座標の変換、軸・グリッド・曲線・短冊・接線矢印・ツールチップ

function niceStep(raw) {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / p;
  return (r < 1.5 ? 1 : r < 3.5 ? 2 : r < 7.5 ? 5 : 10) * p;
}
const fmtN = v => {
  const a = Math.abs(v);
  if (a >= 100 || Number.isInteger(v)) return String(Math.round(v));
  return a >= 1 ? v.toFixed(1) : v.toFixed(2).replace(/0$/, '');
};

export class Graph {
  constructor(canvas, o = {}) {
    this.c = canvas;
    this.o = Object.assign(
      { x0: 0, x1: 1, y0: 0, y1: 1, padL: 46, padR: 12, padT: 12, padB: 26, xLabel: '', yLabel: '' },
      o
    );
    this.fit();
  }

  fit() {
    const r = this.c.getBoundingClientRect();
    const d = window.devicePixelRatio || 1;
    this.w = r.width;
    this.h = r.height;
    this.c.width = Math.max(2, Math.round(r.width * d));
    this.c.height = Math.max(2, Math.round(r.height * d));
    this.ctx = this.c.getContext('2d');
    this.ctx.setTransform(d, 0, 0, d, 0, 0);
  }

  X(x) { const o = this.o; return o.padL + (x - o.x0) / (o.x1 - o.x0) * (this.w - o.padL - o.padR); }
  Y(y) { const o = this.o; return this.h - o.padB - (y - o.y0) / (o.y1 - o.y0) * (this.h - o.padT - o.padB); }
  invX(px) { const o = this.o; return o.x0 + (px - o.padL) / (this.w - o.padL - o.padR) * (o.x1 - o.x0); }
  invY(py) { const o = this.o; return o.y0 + (this.h - o.padB - py) / (this.h - o.padT - o.padB) * (o.y1 - o.y0); }

  // 背景・グリッド・軸ラベルを描いてから返す
  begin() {
    const g = this.ctx, o = this.o;
    g.clearRect(0, 0, this.w, this.h);
    g.fillStyle = '#12151c';
    g.fillRect(0, 0, this.w, this.h);
    g.font = '11px system-ui, sans-serif';
    g.lineWidth = 1;
    const sx = niceStep((o.x1 - o.x0) / 5);
    const sy = niceStep((o.y1 - o.y0) / 4);
    g.strokeStyle = '#20242e';
    g.fillStyle = '#6b7385';
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (let x = Math.ceil(o.x0 / sx - 1e-9) * sx; x <= o.x1 + 1e-9; x += sx) {
      const p = this.X(x);
      g.beginPath(); g.moveTo(p, this.Y(o.y0)); g.lineTo(p, this.Y(o.y1)); g.stroke();
      g.fillText(fmtN(x), p, this.h - o.padB + 5);
    }
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (let y = Math.ceil(o.y0 / sy - 1e-9) * sy; y <= o.y1 + 1e-9; y += sy) {
      const p = this.Y(y);
      g.beginPath(); g.moveTo(this.X(o.x0), p); g.lineTo(this.X(o.x1), p); g.stroke();
      g.fillText(fmtN(y), o.padL - 6, p);
    }
    // 軸線(0が範囲内なら0、なければ端)
    g.strokeStyle = '#3a4152';
    const ax = (o.y0 <= 0 && o.y1 >= 0) ? this.Y(0) : this.Y(o.y0);
    g.beginPath(); g.moveTo(this.X(o.x0), ax); g.lineTo(this.X(o.x1), ax); g.stroke();
    g.beginPath(); g.moveTo(this.X(o.x0), this.Y(o.y0)); g.lineTo(this.X(o.x0), this.Y(o.y1)); g.stroke();
    // 軸ラベル
    g.fillStyle = '#9aa3b5';
    if (o.xLabel) { g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(o.xLabel, this.w - o.padR, this.h - 2); }
    if (o.yLabel) { g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(o.yLabel, 4, 2); }
    return g;
  }

  clip(fn) {
    const g = this.ctx, o = this.o;
    g.save();
    g.beginPath();
    g.rect(o.padL, o.padT, this.w - o.padL - o.padR, this.h - o.padT - o.padB);
    g.clip();
    fn();
    g.restore();
  }

  curve(f, s = {}) {
    const g = this.ctx;
    const x0 = s.x0 ?? this.o.x0, x1 = s.x1 ?? this.o.x1, n = s.samples || 240;
    this.clip(() => {
      g.strokeStyle = s.color || '#3987e5';
      g.lineWidth = s.width || 2;
      g.setLineDash(s.dash || []);
      g.beginPath();
      for (let i = 0; i <= n; i++) {
        const x = x0 + (x1 - x0) * i / n;
        const px = this.X(x), py = this.Y(f(x));
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      }
      g.stroke();
      g.setLineDash([]);
    });
  }

  polyline(pts, s = {}) {
    const g = this.ctx;
    this.clip(() => {
      g.strokeStyle = s.color || '#3987e5';
      g.lineWidth = s.width || 2;
      g.setLineDash(s.dash || []);
      g.beginPath();
      pts.forEach(([x, y], i) => {
        const px = this.X(x), py = this.Y(y);
        i ? g.lineTo(px, py) : g.moveTo(px, py);
      });
      g.stroke();
      g.setLineDash([]);
    });
  }

  // 短冊(リーマン和)。rects: [{x, w, y}] 底辺は base(既定0)
  rects(list, s = {}) {
    const g = this.ctx;
    const base = s.base ?? 0;
    this.clip(() => {
      g.fillStyle = s.fill || 'rgba(57,135,229,.25)';
      g.strokeStyle = s.stroke || 'rgba(57,135,229,.7)';
      g.lineWidth = 1;
      for (const r of list) {
        const px = this.X(r.x), pw = this.X(r.x + r.w) - px;
        const py = this.Y(r.y), pb = this.Y(base);
        g.fillRect(px, Math.min(py, pb), Math.max(1, pw - (s.gap ?? 1)), Math.abs(pb - py));
        if (pw > 3) g.strokeRect(px, Math.min(py, pb), pw - (s.gap ?? 1), Math.abs(pb - py));
      }
    });
  }

  fillUnder(f, x0, x1, s = {}) {
    const g = this.ctx;
    const n = s.samples || 200, base = s.base ?? 0;
    this.clip(() => {
      g.fillStyle = s.fill || 'rgba(57,135,229,.2)';
      g.beginPath();
      g.moveTo(this.X(x0), this.Y(base));
      for (let i = 0; i <= n; i++) {
        const x = x0 + (x1 - x0) * i / n;
        g.lineTo(this.X(x), this.Y(f(x)));
      }
      g.lineTo(this.X(x1), this.Y(base));
      g.closePath();
      g.fill();
    });
  }

  vline(x, s = {}) {
    const g = this.ctx;
    g.strokeStyle = s.color || '#6b7385';
    g.lineWidth = s.width || 1;
    g.setLineDash(s.dash || []);
    g.beginPath(); g.moveTo(this.X(x), this.Y(this.o.y0)); g.lineTo(this.X(x), this.Y(this.o.y1)); g.stroke();
    g.setLineDash([]);
  }

  hline(y, s = {}) {
    const g = this.ctx;
    g.strokeStyle = s.color || '#6b7385';
    g.lineWidth = s.width || 1;
    g.setLineDash(s.dash || []);
    g.beginPath(); g.moveTo(this.X(this.o.x0), this.Y(y)); g.lineTo(this.X(this.o.x1), this.Y(y)); g.stroke();
    g.setLineDash([]);
  }

  dot(x, y, s = {}) {
    const g = this.ctx;
    g.fillStyle = s.color || '#c98500';
    g.beginPath();
    g.arc(this.X(x), this.Y(y), s.r || 5, 0, Math.PI * 2);
    g.fill();
    if (s.ring !== false) { g.strokeStyle = '#12151c'; g.lineWidth = 2; g.stroke(); }
  }

  label(x, y, text, s = {}) {
    const g = this.ctx;
    g.fillStyle = s.color || '#9aa3b5';
    g.font = (s.size || 11) + 'px system-ui, sans-serif';
    g.textAlign = s.align || 'left';
    g.textBaseline = s.baseline || 'bottom';
    g.fillText(text, this.X(x) + (s.dx || 0), this.Y(y) + (s.dy || 0));
  }

  // (x,y) を通る傾き slope の接線を、矢印付きでピクセル長 len で描く
  tangentArrow(x, y, slope, s = {}) {
    const g = this.ctx;
    const len = s.len || 90;
    const sx = (this.w - this.o.padL - this.o.padR) / (this.o.x1 - this.o.x0);
    const sy = (this.h - this.o.padT - this.o.padB) / (this.o.y1 - this.o.y0);
    const dxp = sx, dyp = -slope * sy;           // 画面上の方向ベクトル
    const m = Math.hypot(dxp, dyp) || 1;
    const ux = dxp / m, uy = dyp / m;
    const cx = this.X(x), cy = this.Y(y);
    const x1 = cx - ux * len / 2, y1 = cy - uy * len / 2;
    const x2 = cx + ux * len / 2, y2 = cy + uy * len / 2;
    g.strokeStyle = s.color || '#c98500';
    g.lineWidth = s.width || 2.5;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    // 矢印
    const a = Math.atan2(y2 - y1, x2 - x1);
    g.fillStyle = s.color || '#c98500';
    g.beginPath();
    g.moveTo(x2, y2);
    g.lineTo(x2 - 9 * Math.cos(a - 0.45), y2 - 9 * Math.sin(a - 0.45));
    g.lineTo(x2 - 9 * Math.cos(a + 0.45), y2 - 9 * Math.sin(a + 0.45));
    g.closePath();
    g.fill();
  }

  // ホバーで座標値を出すDOMツールチップ
  tooltip(fmt) {
    const parent = this.c.parentElement;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    const tip = document.createElement('div');
    tip.className = 'graph-tip';
    parent.appendChild(tip);
    this.c.addEventListener('mousemove', ev => {
      const r = this.c.getBoundingClientRect();
      const mx = ev.clientX - r.left, my = ev.clientY - r.top;
      const x = this.invX(mx), y = this.invY(my);
      if (x < this.o.x0 || x > this.o.x1 || y < this.o.y0 || y > this.o.y1) { tip.style.display = 'none'; return; }
      tip.textContent = fmt(x, y);
      tip.style.display = 'block';
      const pr = parent.getBoundingClientRect();
      tip.style.left = Math.min(pr.width - 130, r.left - pr.left + mx + 12) + 'px';
      tip.style.top = (r.top - pr.top + my - 28) + 'px';
    });
    this.c.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  }
}
