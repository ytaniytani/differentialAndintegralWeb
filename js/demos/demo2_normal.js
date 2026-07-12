// §2 ハイトの傾き=法線 — ノーマルマップとシェーディング
import { Graph } from '../core/graph.js';
import { slider, toggle, panes, canvasIn, controlsRow, onResize, fitCanvas, pointerPos, hint, button } from '../core/controls.js';
import { makeNoise, clamp } from '../core/pixels.js';

export function init(root) {
  const [p1, p2, p3] = panes(root, [
    '① ハイトマップ(点をドラッグして地形を編集)',
    '② 各点の傾き(①の微分)',
    'wide:③ シェーディング結果(傾きから法線を立てて光を計算)',
  ]);
  const cH = canvasIn(p1, 190);
  hint(p1, '点をドラッグすると ①→②→③ が連動して変わる');
  const cS = canvasIn(p2, 190);
  const cR = canvasIn(p3, 240);
  const ctl = controlsRow(root);

  const noise = makeNoise(7);
  const defaultYs = [0.35, 0.55, 0.40, 0.68, 0.45, 0.62, 0.50];
  let ys = defaultYs.slice();
  const NPTS = ys.length;
  const px = i => i / (NPTS - 1);

  let lightDeg = 60;
  let strength = 1;
  let detailFreq = 8;
  let showNormals = true;

  // Catmull-Rom スプライン(端は複製)
  function spline(x) {
    const seg = clamp(Math.floor(x * (NPTS - 1)), 0, NPTS - 2);
    const t = x * (NPTS - 1) - seg;
    const p0 = ys[Math.max(0, seg - 1)], p1v = ys[seg], p2v = ys[seg + 1], p3v = ys[Math.min(NPTS - 1, seg + 2)];
    return 0.5 * ((2 * p1v) + (-p0 + p2v) * t + (2 * p0 - 5 * p1v + 4 * p2v - p3v) * t * t + (-p0 + 3 * p1v - 3 * p2v + p3v) * t * t * t);
  }
  const height = x => clamp(spline(x) + 0.05 * (noise.fbm(x * detailFreq, 3.7) - 0.5) * 2, 0.02, 0.98);

  const NS = 480; // サンプル列数
  const hArr = new Float32Array(NS + 1);
  const sArr = new Float32Array(NS + 1);
  function resample() {
    for (let i = 0; i <= NS; i++) hArr[i] = height(i / NS);
    for (let i = 0; i <= NS; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(NS, i + 1);
      sArr[i] = (hArr[i1] - hArr[i0]) / ((i1 - i0) / NS) * strength; // 傾き×強度
    }
  }

  const gH = new Graph(cH, { x0: 0, x1: 1, y0: 0, y1: 1, xLabel: '位置', yLabel: '高さ', padB: 22 });
  const gS = new Graph(cS, { x0: 0, x1: 1, y0: -6, y1: 6, xLabel: '位置', yLabel: '傾き', padB: 22 });
  gS.tooltip(x => `位置 ${x.toFixed(2)} の傾き ${sArr[Math.round(clamp(x, 0, 1) * NS)].toFixed(2)}`);

  slider(ctl, { label: '光の角度', min: 0, max: 180, step: 1, value: lightDeg, unit: '°', oninput: v => { lightDeg = v; render(false); } });
  slider(ctl, { label: '凹凸の強さ(Strength)', min: 0, max: 3, step: 0.05, value: strength, oninput: v => { strength = v; render(); } });
  slider(ctl, { label: '凹凸の細かさ', min: 2, max: 40, step: 1, value: detailFreq, oninput: v => { detailFreq = v; render(); } });
  toggle(ctl, { label: '法線(面の向き)を表示', value: true, onchange: v => { showNormals = v; render(false); } });
  button(ctl, 'リセット', () => { ys = defaultYs.slice(); render(); }, 'ghost');

  // ドラッグ編集
  let dragIdx = -1;
  cH.addEventListener('pointerdown', ev => {
    const [mx, my] = pointerPos(cH, ev);
    let best = -1, bd = 18;
    for (let i = 0; i < NPTS; i++) {
      const d = Math.hypot(gH.X(px(i)) - mx, gH.Y(ys[i]) - my);
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) { dragIdx = best; cH.setPointerCapture(ev.pointerId); }
  });
  cH.addEventListener('pointermove', ev => {
    if (dragIdx < 0) return;
    const [, my] = pointerPos(cH, ev);
    ys[dragIdx] = clamp(gH.invY(my), 0.05, 0.95);
    render();
  });
  cH.addEventListener('pointerup', () => { dragIdx = -1; });

  function drawTerrain() {
    const { g: c, w, h } = fitCanvas(cR);
    // 空
    const sky = c.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#0d1320');
    sky.addColorStop(1, '#131722');
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    // 太陽(光の角度に連動して弧上を移動)
    const th = lightDeg * Math.PI / 180;
    const sunX = w * 0.5 + Math.cos(th) * w * 0.44;
    const sunY = h * 0.66 - Math.sin(th) * h * 0.52;
    const glow = c.createRadialGradient(sunX, sunY, 2, sunX, sunY, 46);
    glow.addColorStop(0, 'rgba(255, 214, 150, .9)');
    glow.addColorStop(1, 'rgba(255, 214, 150, 0)');
    c.fillStyle = glow;
    c.fillRect(sunX - 50, sunY - 50, 100, 100);
    c.fillStyle = '#ffd9a0';
    c.beginPath(); c.arc(sunX, sunY, 9, 0, Math.PI * 2); c.fill();
    // 地形(列ごとにランバート)
    const Lx = Math.cos(th), Ly = Math.sin(th);
    const baseY = h * 0.92, scale = h * 0.55;
    // 傾き sArr は「高さ0〜1 × 幅0〜1」の世界での微分。法線 = 傾きに直角な向き (-slope, 1)
    for (let sx = 0; sx < w; sx++) {
      const i = Math.round(sx / (w - 1) * NS);
      const yTop = baseY - hArr[i] * scale;
      let nx = -sArr[i], ny = 1;
      const m = Math.hypot(nx, ny); nx /= m; ny /= m;
      const b = Math.max(0, nx * Lx + ny * Ly);
      const shade = 0.06 + 0.94 * b;
      c.fillStyle = `rgb(${Math.round(20 + 195 * shade)}, ${Math.round(20 + 175 * shade)}, ${Math.round(24 + 150 * shade)})`;
      c.fillRect(sx, yTop, 1, baseY - yTop + h * 0.08);
    }
    // 法線の矢印
    if (showNormals) {
      c.strokeStyle = '#199e70';
      c.fillStyle = '#199e70';
      c.lineWidth = 1.5;
      const step = Math.max(26, Math.floor(w / 26));
      for (let sx = step / 2; sx < w; sx += step) {
        const i = Math.round(sx / (w - 1) * NS);
        const yTop = baseY - hArr[i] * scale;
        let nx = -sArr[i], ny = 1;
        const m = Math.hypot(nx, ny); nx /= m; ny /= m;
        const ex = sx + nx * 18, eyy = yTop - ny * 18;
        c.beginPath(); c.moveTo(sx, yTop); c.lineTo(ex, eyy); c.stroke();
        c.beginPath(); c.arc(ex, eyy, 2, 0, Math.PI * 2); c.fill();
      }
    }
  }

  function render(needResample = true) {
    if (needResample) resample();
    // ① 高さ
    gH.begin();
    gH.curve(x => hArr[Math.round(clamp(x, 0, 1) * NS)], { color: '#3987e5' });
    for (let i = 0; i < NPTS; i++) gH.dot(px(i), ys[i], { color: '#c98500', r: 6 });
    // ② 傾き
    gS.begin();
    gS.hline(0, { color: '#3a4152' });
    gS.curve(x => clamp(sArr[Math.round(clamp(x, 0, 1) * NS)], -6, 6), { color: '#c98500' });
    // ③ シェーディング
    drawTerrain();
  }

  onResize(() => { gH.fit(); gS.fit(); render(false); });
  render();
}
