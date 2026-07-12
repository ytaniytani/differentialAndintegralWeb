// P1 傾き=変化の速さ — ライトのフェードイン(微分の入口)
import { Graph } from '../core/graph.js';
import { slider, segmented, button, readout, panes, canvasIn, controlsRow, onResize, fitCanvas, hint } from '../core/controls.js';
import { makeLoop } from '../core/anim.js';
import { clamp } from '../core/pixels.js';

export function init(root) {
  const [pv, pg] = panes(root, ['プレビュー:部屋のライト', 'グラフ:時間と明るさ(矢印 = 今の傾き)']);
  const cPrev = canvasIn(pv, 230);
  const cG = canvasIn(pg, 230);
  hint(pg, 'グラフにマウスを乗せると座標が読めます');
  const ctl = controlsRow(root);

  const T = 5;
  let t = 0;
  let mode = 'linear';
  let a = 20;

  const curves = {
    linear: x => clamp(10 + a * x, 0, 100),
    slow:   x => 100 * (1 - Math.pow(1 - x / T, 2)),
    smooth: x => { const u = x / T; return 100 * u * u * (3 - 2 * u); },
    pulse:  x => 100 * Math.exp(-Math.pow(x - 2.5, 2) / 0.35),
  };
  const f = x => curves[mode](x);
  const slopeAt = x => {
    const h = 0.002;
    const x0 = Math.max(0, x - h), x1 = Math.min(T, x + h);
    return (f(x1) - f(x0)) / (x1 - x0);
  };

  const g = new Graph(cG, { x0: 0, x1: T, y0: 0, y1: 110, xLabel: '時間(秒)', yLabel: '明るさ' });
  g.tooltip((x, y) => `${x.toFixed(2)}秒 / 明るさ ${y.toFixed(0)}`);

  const loop = makeLoop(root, dt => {
    t = (t + dt) % T;
    timeS.value = +t.toFixed(2);
    render();
  });

  const playBtn = button(ctl, '▶ 再生', () => {
    if (loop.running) { loop.stop(); playBtn.textContent = '▶ 再生'; }
    else { loop.start(); playBtn.textContent = '⏸ 停止'; }
  }, 'primary');
  const timeS = slider(ctl, { label: '時間', min: 0, max: T, step: 0.01, value: 0, unit: '秒', oninput: v => { t = v; render(); } });
  const modeS = segmented(ctl, {
    label: 'フェードの形',
    options: [
      { key: 'linear', label: '一定の速さ(直線)' },
      { key: 'slow', label: 'だんだんゆっくり' },
      { key: 'smooth', label: 'ゆっくり始まり・終わり' },
      { key: 'pulse', label: '一瞬明るくして戻す' },
    ],
    value: 'linear',
    onchange: v => { mode = v; slopeS.el.style.display = v === 'linear' ? '' : 'none'; render(); },
  });
  const slopeS = slider(ctl, { label: '直線の傾き a', min: -50, max: 50, step: 1, value: 20, unit: '/秒', oninput: v => { a = v; render(); } });
  const ro = readout(ctl, '今の変化の速さ(=傾き)');
  button(ctl, 'リセット', () => {
    loop.stop(); playBtn.textContent = '▶ 再生';
    t = 0; a = 20; mode = 'linear';
    timeS.value = 0; slopeS.value = 20; modeS.value = 'linear';
    slopeS.el.style.display = '';
    render();
  }, 'ghost');

  function drawRoom(brightness) {
    const { g: c, w, h } = fitCanvas(cPrev);
    const b = clamp(brightness, 0, 1);
    // 壁と床
    c.fillStyle = `rgb(${10 + 34 * b}, ${11 + 36 * b}, ${16 + 42 * b})`;
    c.fillRect(0, 0, w, h);
    c.fillStyle = `rgb(${8 + 26 * b}, ${8 + 26 * b}, ${12 + 30 * b})`;
    c.fillRect(0, h * 0.72, w, h * 0.28);
    // コードと電球
    const lx = w / 2, ly = h * 0.24;
    c.strokeStyle = '#2a2f3a';
    c.lineWidth = 2;
    c.beginPath(); c.moveTo(lx, 0); c.lineTo(lx, ly - 12); c.stroke();
    // グロー
    const grad = c.createRadialGradient(lx, ly, 4, lx, ly, w * 0.42);
    grad.addColorStop(0, `rgba(255, 216, 150, ${0.95 * b})`);
    grad.addColorStop(0.25, `rgba(255, 195, 120, ${0.35 * b})`);
    grad.addColorStop(1, 'rgba(255, 190, 110, 0)');
    c.fillStyle = grad;
    c.fillRect(0, 0, w, h);
    // 電球本体
    c.fillStyle = b > 0.04 ? `rgb(255, ${205 + 40 * b}, ${140 + 80 * b})` : '#3a4152';
    c.beginPath(); c.arc(lx, ly, 11, 0, Math.PI * 2); c.fill();
    // 床の光だまり
    c.fillStyle = `rgba(255, 205, 140, ${0.22 * b})`;
    c.beginPath(); c.ellipse(lx, h * 0.84, w * 0.3 * (0.4 + 0.6 * b), h * 0.07, 0, 0, Math.PI * 2); c.fill();
    // 数値
    c.fillStyle = '#9aa3b5';
    c.font = '12px system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'top';
    c.fillText(`明るさ: ${(b * 100).toFixed(0)}`, 10, 8);
  }

  function render() {
    g.begin();
    g.curve(f, { color: '#3987e5' });
    const B = f(t), m = slopeAt(t);
    g.vline(t, { color: '#3a4152', dash: [3, 4] });
    g.tangentArrow(t, B, m, { len: 96, color: '#c98500' });
    g.dot(t, B, { color: '#c98500' });
    g.label(t, B, ` 傾き ${m >= 0 ? '+' : ''}${m.toFixed(1)}`, { color: '#c98500', dy: -10 });
    ro.set(
      `${m >= 0 ? '+' : ''}${m.toFixed(1)} /秒`,
      m > 0.5 ? '#199e70' : m < -0.5 ? '#e66767' : ''
    );
    drawRoom(B / 100);
  }

  onResize(() => { g.fit(); render(); });
  render();
}
