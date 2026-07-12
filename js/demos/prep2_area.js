// P2 面積=積み重ねの合計 — カメラの露出(積分の入口)
import { Graph } from '../core/graph.js';
import { slider, segmented, readout, panes, canvasIn, controlsRow, onResize, fitCanvas, hint, button } from '../core/controls.js';
import { clamp } from '../core/pixels.js';

export function init(root) {
  const [pg, pv] = panes(root, [
    'グラフ:シーンの明るさ × シャッター時間(青い短冊 = 取り込んだ光)',
    'プレビュー:撮れた写真',
  ]);
  const cG = canvasIn(pg, 250);
  hint(pg, '短冊の面積の合計が「取り込んだ光の量」');
  const cPrev = canvasIn(pv, 250);
  const ctl = controlsRow(root);

  let T = 1.5;   // シャッター時間
  let N = 8;     // 短冊の本数
  let mode = 'const';

  const curves = {
    const:  () => 60,
    neon:   t => clamp(55 + 30 * Math.sin(5 * t) + 18 * Math.sin(11.3 * t + 1), 4, 105),
    clouds: t => clamp(52 + 32 * Math.sin(1.15 * t + 0.8) + 10 * Math.sin(0.5 * t + 2), 4, 105),
  };
  const B = t => curves[mode](t);

  const g = new Graph(cG, { x0: 0, x1: 4.2, y0: 0, y1: 115, xLabel: '時間(秒)', yLabel: '明るさ' });
  g.tooltip((x, y) => `${x.toFixed(2)}秒 / 明るさ ${y.toFixed(0)}`);

  slider(ctl, { label: 'シャッター時間', min: 0.1, max: 4, step: 0.05, value: T, unit: '秒', oninput: v => { T = v; render(); } });
  segmented(ctl, {
    label: 'シーンの明るさ',
    options: [
      { key: 'const', label: '一定' },
      { key: 'neon', label: 'ちらつくネオン' },
      { key: 'clouds', label: '雲が流れる空' },
    ],
    value: 'const',
    onchange: v => { mode = v; render(); },
  });
  slider(ctl, { label: '短冊の本数', min: 1, max: 200, step: 1, value: N, unit: '本', oninput: v => { N = v; render(); } });
  const roSum = readout(ctl, '短冊の合計(取り込んだ光)');
  const roTrue = readout(ctl, '本当の値');
  const roErr = readout(ctl, 'ずれ');
  button(ctl, 'リセット', () => location_reset(), 'ghost');

  function location_reset() {
    T = 1.5; N = 8; mode = 'const';
    // スライダーの見た目も戻す
    ctl.querySelectorAll('input[type=range]').forEach((r, i) => {
      const vals = [1.5, 8];
      if (i < vals.length) { r.value = vals[i]; r.nextElementSibling && (r.nextElementSibling.value = vals[i]); }
    });
    ctl.querySelectorAll('.seg-btn').forEach((b, i) => b.classList.toggle('on', i === 0));
    render();
  }

  const integrate = (t0, t1, n = 2000) => {
    let s = 0;
    const w = (t1 - t0) / n;
    for (let i = 0; i < n; i++) s += B(t0 + (i + 0.5) * w) * w;
    return s;
  };

  function drawPhoto(total) {
    const { g: c, w, h } = fitCanvas(cPrev);
    // 露出係数: 適正 ≒ 140
    const e = total / 140;
    // ソフトな飽和(白飛びは徐々に)
    const tone = v => Math.round(255 * (1 - Math.exp(-v * e * 1.8)));
    const col = (r, gr, b) => `rgb(${tone(r)}, ${tone(gr)}, ${tone(b)})`;
    // 空
    const sky = c.createLinearGradient(0, 0, 0, h * 0.72);
    sky.addColorStop(0, col(0.30, 0.48, 0.85));
    sky.addColorStop(1, col(0.65, 0.62, 0.60));
    c.fillStyle = sky;
    c.fillRect(0, 0, w, h);
    // 太陽
    c.fillStyle = col(1.15, 1.05, 0.8);
    c.beginPath(); c.arc(w * 0.74, h * 0.22, 20, 0, Math.PI * 2); c.fill();
    // 山(奥・手前)
    c.fillStyle = col(0.22, 0.26, 0.33);
    c.beginPath();
    c.moveTo(0, h * 0.72);
    c.lineTo(w * 0.22, h * 0.38); c.lineTo(w * 0.45, h * 0.66);
    c.lineTo(w * 0.62, h * 0.44); c.lineTo(w * 0.85, h * 0.72);
    c.closePath(); c.fill();
    c.fillStyle = col(0.14, 0.17, 0.22);
    c.beginPath();
    c.moveTo(0, h);
    c.lineTo(0, h * 0.62); c.lineTo(w * 0.3, h * 0.8); c.lineTo(w * 0.7, h * 0.6);
    c.lineTo(w, h * 0.8); c.lineTo(w, h);
    c.closePath(); c.fill();
    // 露出の目安表示
    c.fillStyle = 'rgba(10,12,16,.65)';
    c.fillRect(8, 8, 190, 24);
    c.fillStyle = '#d5dae3';
    c.font = '12px system-ui, sans-serif';
    c.textAlign = 'left'; c.textBaseline = 'middle';
    const judge = e < 0.55 ? '暗い(露出不足)' : e > 1.7 ? '明るすぎ(白飛び)' : 'ちょうどいい';
    c.fillText(`光の量 ${total.toFixed(0)} → ${judge}`, 14, 20);
  }

  function render() {
    g.begin();
    // 短冊
    const w = T / N;
    let sum = 0;
    const rects = [];
    for (let i = 0; i < N; i++) {
      const x = i * w;
      const y = B(x);
      sum += y * w;
      rects.push({ x, w, y });
    }
    g.rects(rects, { fill: 'rgba(57,135,229,.28)', stroke: 'rgba(57,135,229,.75)', gap: N > 60 ? 0 : 1 });
    g.curve(B, { color: '#c98500' });
    g.vline(T, { color: '#9aa3b5', dash: [4, 4] });
    g.label(T, 108, ' シャッター閉じる', { color: '#9aa3b5' });
    const truth = integrate(0, T);
    const err = truth > 0 ? Math.abs(sum - truth) / truth * 100 : 0;
    roSum.set(sum.toFixed(1), '#3987e5');
    roTrue.set(truth.toFixed(1));
    roErr.set(err < 0.05 ? 'ほぼ0%' : err.toFixed(1) + '%', err > 5 ? '#e66767' : '#199e70');
    drawPhoto(truth); // 写真は実際に入った光(真値)で
  }

  onResize(() => { g.fit(); render(); });
  render();
}
