// §5 ランダムに試して足す=ソフトシャドウ — エリアライトとモンテカルロ
import { Graph } from '../core/graph.js';
import { slider, toggle, panes, canvasIn, controlsRow, onResize, fitCanvas, pointerPos, hint, readout, button } from '../core/controls.js';
import { makeLoop } from '../core/anim.js';
import { clamp } from '../core/pixels.js';

export function init(root) {
  const [pm, ps] = panes(root, [
    'シーン(遮蔽物はドラッグ / 地面をクリックすると右で調査)',
    '調査点の詳細:光源へ届いたサンプル',
  ]);
  const cMain = canvasIn(pm, 250);
  const cGraph = canvasIn(pm, 110);
  hint(pm, '下: 地面に沿った明るさ。ふわっとした縁(半影)= 値がなだらかに変わる区間');
  const cSub = canvasIn(ps, 250);
  const roFrac = readout(ps, '届いた割合');
  const ctl = controlsRow(root);

  // ワールド座標: x 0..10, y 0..6(上が+)
  const LY = 5.4;
  let halfW = 1.2;        // ライトの半幅
  let samples = 24;
  let animate = false;
  const occ = { x: 5, y: 3, w: 2.4, h: 0.5 };
  let probeX = 6.4;
  let seed = 1;

  const COLS = 240;
  const bright = new Float32Array(COLS);

  // 乱数(シード固定可)
  function rng(s) {
    let a = s >>> 0 || 1;
    return () => {
      a = (a * 1664525 + 1013904223) >>> 0;
      return a / 4294967296;
    };
  }

  // 線分 P→S が遮蔽矩形と交わるか(スラブ法)
  function blocked(px, py, sx, sy) {
    const x0 = occ.x - occ.w / 2, x1 = occ.x + occ.w / 2;
    const y0 = occ.y - occ.h / 2, y1 = occ.y + occ.h / 2;
    const dx = sx - px, dy = sy - py;
    let tmin = 0, tmax = 1;
    if (Math.abs(dx) < 1e-9) {
      if (px < x0 || px > x1) return false;
    } else {
      let t1 = (x0 - px) / dx, t2 = (x1 - px) / dx;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    }
    if (Math.abs(dy) < 1e-9) {
      if (py < y0 || py > y1) return false;
    } else {
      let t1 = (y0 - py) / dy, t2 = (y1 - py) / dy;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    }
    return tmin <= tmax;
  }

  function lightSamples(rand) {
    const pts = [];
    for (let k = 0; k < samples; k++) {
      const u = animate ? rand() : (k + 0.5) / samples;
      pts.push(5 + (u * 2 - 1) * halfW);
    }
    return pts;
  }

  function computeGround() {
    const rand = rng(seed);
    const pts = lightSamples(rand);
    for (let c = 0; c < COLS; c++) {
      const px = c / (COLS - 1) * 10;
      let hit = 0;
      for (const sx of pts) if (!blocked(px, 0.02, sx, LY)) hit++;
      bright[c] = hit / pts.length;
    }
    return pts;
  }

  const gB = new Graph(cGraph, { x0: 0, x1: 10, y0: 0, y1: 1.05, xLabel: '地面の位置', yLabel: '明るさ', padB: 20 });
  gB.tooltip((x) => `位置 ${x.toFixed(1)} / 明るさ ${(bright[Math.round(clamp(x / 10, 0, 1) * (COLS - 1))] * 100).toFixed(0)}%`);

  // 座標変換(メインビュー)
  let MW = 0, MH = 0;
  const mx = x => x / 10 * MW;
  const my = y => MH - (y / 6) * MH;

  function drawScene(pts) {
    const { g: c, w, h } = fitCanvas(cMain);
    MW = w; MH = h;
    // 背景
    const bg = c.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#10141d');
    bg.addColorStop(1, '#171b25');
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    // ライト
    const lx0 = mx(5 - halfW), lx1 = mx(5 + halfW), ly = my(LY);
    const glow = c.createRadialGradient(mx(5), ly, 2, mx(5), ly, 70);
    glow.addColorStop(0, 'rgba(255,220,160,.5)');
    glow.addColorStop(1, 'rgba(255,220,160,0)');
    c.fillStyle = glow;
    c.fillRect(mx(5) - 75, ly - 75, 150, 150);
    c.fillStyle = '#ffd9a0';
    if (halfW < 0.08) {
      c.beginPath(); c.arc(mx(5), ly, 5, 0, Math.PI * 2); c.fill();
    } else {
      c.fillRect(lx0, ly - 4, lx1 - lx0, 8);
    }
    // 遮蔽物
    c.fillStyle = '#3a4152';
    c.strokeStyle = '#525b70';
    c.lineWidth = 1.5;
    const ox = mx(occ.x - occ.w / 2), oy = my(occ.y + occ.h / 2);
    const ow = mx(occ.w) - mx(0), oh = my(0) - my(occ.h);
    c.fillRect(ox, oy, ow, oh);
    c.strokeRect(ox, oy, ow, oh);
    // 地面(列ごとの明るさ)
    const gy = my(0.15);
    for (let sx = 0; sx < w; sx++) {
      const b = bright[Math.round(sx / (w - 1) * (COLS - 1))];
      const v = 0.08 + 0.92 * b;
      c.fillStyle = `rgb(${Math.round(30 + 190 * v)}, ${Math.round(28 + 165 * v)}, ${Math.round(26 + 130 * v)})`;
      c.fillRect(sx, gy, 1, h - gy);
    }
    // 調査点マーカー
    c.fillStyle = '#c98500';
    c.beginPath();
    c.moveTo(mx(probeX), gy - 2);
    c.lineTo(mx(probeX) - 6, gy - 12);
    c.lineTo(mx(probeX) + 6, gy - 12);
    c.closePath();
    c.fill();
  }

  function drawSub(pts) {
    const { g: c, w, h } = fitCanvas(cSub);
    const sx_ = x => x / 10 * w;
    const sy_ = y => h - (y / 6) * h;
    c.fillStyle = '#12151c';
    c.fillRect(0, 0, w, h);
    // ライトと遮蔽物(簡略)
    c.fillStyle = '#ffd9a0';
    c.fillRect(sx_(5 - Math.max(0.06, halfW)), sy_(LY) - 3, Math.max(3, sx_(halfW * 2) - sx_(0)), 6);
    c.fillStyle = '#3a4152';
    c.fillRect(sx_(occ.x - occ.w / 2), sy_(occ.y + occ.h / 2), sx_(occ.w) - sx_(0), sy_(0) - sy_(occ.h));
    // サンプル光線
    let hit = 0;
    const maxDraw = 64;
    const step = Math.max(1, Math.floor(pts.length / maxDraw));
    c.lineWidth = 1;
    for (let k = 0; k < pts.length; k++) {
      const ok = !blocked(probeX, 0.02, pts[k], LY);
      if (ok) hit++;
      if (k % step) continue;
      c.strokeStyle = ok ? 'rgba(25,158,112,.55)' : 'rgba(230,103,103,.5)';
      c.beginPath();
      c.moveTo(sx_(probeX), sy_(0.05));
      c.lineTo(sx_(pts[k]), sy_(LY));
      c.stroke();
    }
    // 調査点
    c.fillStyle = '#c98500';
    c.beginPath(); c.arc(sx_(probeX), sy_(0.05), 5, 0, Math.PI * 2); c.fill();
    // 凡例
    c.font = '11px system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillStyle = '#199e70'; c.fillText('― 届いた', 10, 8);
    c.fillStyle = '#e66767'; c.fillText('― 遮られた', 76, 8);
    const frac = hit / pts.length;
    roFrac.set(`${hit} / ${pts.length} 本 = 明るさ ${(frac * 100).toFixed(0)}%`, '#c98500');
  }

  function render() {
    const pts = computeGround();
    drawScene(pts);
    gB.begin();
    gB.polyline(Array.from({ length: COLS }, (_, c) => [c / (COLS - 1) * 10, bright[c]]), { color: '#3987e5' });
    gB.vline(probeX, { color: '#c98500', dash: [3, 3] });
    drawSub(pts);
  }

  const loop = makeLoop(root, () => { seed = (seed * 16807) % 2147483647 || 1; render(); });

  slider(ctl, { label: 'ライトの大きさ', min: 0, max: 2.5, step: 0.05, value: halfW, oninput: v => { halfW = v; render(); } });
  slider(ctl, { label: 'サンプル数', min: 1, max: 256, step: 1, value: samples, unit: '本', oninput: v => { samples = v; render(); } });
  toggle(ctl, {
    label: '毎フレーム乱数を変える(レンダラーのちらつき)',
    value: false,
    onchange: v => { animate = v; v ? loop.start() : loop.stop(); render(); },
  });
  button(ctl, 'リセット', () => {
    halfW = 1.2; samples = 24; occ.x = 5; occ.y = 3; probeX = 6.4;
    ctl.querySelectorAll('input[type=range]').forEach((r, i) => {
      const vals = [1.2, 24];
      if (i < vals.length) { r.value = vals[i]; r.nextElementSibling && (r.nextElementSibling.value = vals[i]); }
    });
    render();
  }, 'ghost');

  // ドラッグ / クリック
  let dragOcc = false;
  cMain.addEventListener('pointerdown', ev => {
    const [pxp, pyp] = pointerPos(cMain, ev);
    const wx = pxp / MW * 10, wy = (1 - pyp / MH) * 6;
    if (Math.abs(wx - occ.x) < occ.w / 2 + 0.3 && Math.abs(wy - occ.y) < occ.h / 2 + 0.3) {
      dragOcc = true;
      cMain.setPointerCapture(ev.pointerId);
    } else {
      probeX = clamp(wx, 0.1, 9.9);
      render();
    }
  });
  cMain.addEventListener('pointermove', ev => {
    if (!dragOcc) return;
    const [pxp, pyp] = pointerPos(cMain, ev);
    occ.x = clamp(pxp / MW * 10, 0.5, 9.5);
    occ.y = clamp((1 - pyp / MH) * 6, 0.8, 4.8);
    render();
  });
  cMain.addEventListener('pointerup', () => { dragOcc = false; });

  onResize(() => { gB.fit(); render(); });
  render();
}
