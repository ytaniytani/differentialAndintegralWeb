// §6 レイに沿って足す=ボリュームフォグ — レイマーチング
import { Graph } from '../core/graph.js';
import { slider, panes, canvasIn, controlsRow, onResize, hint, readout } from '../core/controls.js';
import { lowres, makeNoise, clamp } from '../core/pixels.js';

export function init(root) {
  const [pm, pr] = panes(root, [
    'フォグの中の光(光源はドラッグ / クリックした場所のレイを右で解剖)',
    '1本のレイの解剖図',
  ]);
  const cMain = canvasIn(pm, 270);
  hint(pm, '柱のすき間から光の筋(ゴッドレイ)が伸びる');
  const cDen = canvasIn(pr, 130);
  const cTr = canvasIn(pr, 130);
  const roT = readout(pr, '最後に残った光');
  const ctl = controlsRow(root);

  // ワールド: x 0..16, y 0..9(上が+)
  const W = 192, H = 108;
  const view = lowres(cMain, W, H, { smooth: true });
  const noise = makeNoise(3);

  let density = 1.0;
  let steps = 24;
  let uneven = 0.5;
  const light = { x: 3.5, y: 7.2, power: 3.2 };
  let probe = { x: 8.8, y: 7.5 };   // 解剖するピクセル(ワールド座標)。初期値は柱に遮られない位置

  const pillars = [
    { x0: 6.8, x1: 7.4, y0: 0, y1: 5.8 },
    { x0: 9.6, x1: 10.1, y0: 3.2, y1: 9 },
    { x0: 12.6, x1: 13.1, y0: 0, y1: 4.6 },
  ];
  const inPillar = (x, y) => pillars.some(p => x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1);

  // 濃度場(むら)を事前計算
  const DG = 4; // 解像度スケール
  const denGrid = new Float32Array((W / 2) * (H / 2));
  function rebuildDensity() {
    for (let y = 0; y < H / 2; y++) {
      for (let x = 0; x < W / 2; x++) {
        const wx = x / (W / 2) * 16, wy = y / (H / 2) * 9;
        const n = noise.fbm(wx * 0.45, wy * 0.45, 4);           // 0..1
        denGrid[y * (W / 2) + x] = (1 - uneven) + uneven * n * 2;
      }
    }
  }
  function sigma(wx, wy) {
    const gx = clamp(wx / 16 * (W / 2 - 1), 0, W / 2 - 1.001);
    const gy = clamp((1 - wy / 9) * (H / 2 - 1), 0, H / 2 - 1.001);
    const x0 = gx | 0, y0 = gy | 0;
    const fx = gx - x0, fy = gy - y0;
    const g = denGrid, sw = W / 2;
    const v = g[y0 * sw + x0] * (1 - fx) * (1 - fy) + g[y0 * sw + x0 + 1] * fx * (1 - fy)
            + g[(y0 + 1) * sw + x0] * (1 - fx) * fy + g[(y0 + 1) * sw + x0 + 1] * fx * fy;
    return v * density * 0.32;
  }

  // レイ1本のマーチング。詳細を返す(解剖図用)
  function march(px, py, detail = false) {
    const dx = px - light.x, dy = py - light.y;
    const dist = Math.hypot(dx, dy);
    const N = steps;
    const ds = dist / N;
    let T = 1;
    const sig = [], trans = [];
    for (let i = 0; i < N; i++) {
      const t = (i + 0.5) / N;
      const qx = light.x + dx * t, qy = light.y + dy * t;
      if (inPillar(qx, qy)) { T = 0; if (detail) { sig.push(99); trans.push(0); } else break; continue; }
      const s = sigma(qx, qy);
      T *= Math.max(0, 1 - s * ds);
      if (detail) { sig.push(s); trans.push(T); }
    }
    return { T, dist, sig, trans, ds };
  }

  function render() {
    for (let gy = 0; gy < H; gy++) {
      for (let gx = 0; gx < W; gx++) {
        const wx = (gx + 0.5) / W * 16;
        const wy = (1 - (gy + 0.5) / H) * 9;
        let r, g, b;
        if (inPillar(wx, wy)) {
          r = 12; g = 13; b = 17;
        } else {
          const m = march(wx, wy);
          const arriving = m.T * light.power / (1 + 0.18 * m.dist * m.dist);
          // 届いた光が霧に散乱して見える(+わずかな環境光)。白飛びはトーンマップで抑える
          const sc = sigma(wx, wy);
          let v = arriving * (0.25 + sc * 1.5) + 0.012;
          v = clamp(v / (1 + v) * 1.5, 0, 1);
          r = Math.round(255 * v * 1.0 + 8);
          g = Math.round(255 * v * 0.86 + 9);
          b = Math.round(255 * v * 0.64 + 14);
        }
        view.set(gx, gy, Math.min(255, r), Math.min(255, g), Math.min(255, b));
      }
    }
    view.blit();
    // 光源マーカーと調査レイはCSSキャンバス上に上描き
    overlay();
    anatomy();
  }

  function overlay() {
    const c = cMain.getContext('2d');
    const r = cMain.getBoundingClientRect();
    const d = window.devicePixelRatio || 1;
    c.setTransform(d, 0, 0, d, 0, 0);
    const sx = x => x / 16 * r.width;
    const sy = y => (1 - y / 9) * r.height;
    // 調査レイ
    c.strokeStyle = 'rgba(201,133,0,.8)';
    c.lineWidth = 1.5;
    c.setLineDash([5, 4]);
    c.beginPath(); c.moveTo(sx(light.x), sy(light.y)); c.lineTo(sx(probe.x), sy(probe.y)); c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#c98500';
    c.beginPath(); c.arc(sx(probe.x), sy(probe.y), 5, 0, Math.PI * 2); c.fill();
    // 光源
    c.fillStyle = '#fff1cf';
    c.beginPath(); c.arc(sx(light.x), sy(light.y), 7, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#c98500';
    c.lineWidth = 2;
    c.beginPath(); c.arc(sx(light.x), sy(light.y), 11, 0, Math.PI * 2); c.stroke();
  }

  const gD = new Graph(cDen, { x0: 0, x1: 1, y0: 0, y1: 1.1, xLabel: 'レイ上の位置', yLabel: '霧の濃さ(短冊=1歩)', padB: 22 });
  const gT = new Graph(cTr, { x0: 0, x1: 1, y0: 0, y1: 1.05, xLabel: 'レイ上の位置', yLabel: '残っている光', padB: 22 });

  function anatomy() {
    const m = march(probe.x, probe.y, true);
    const N = m.sig.length;
    // 濃度(短冊)
    gD.begin();
    gD.rects(m.sig.map((s, i) => ({ x: i / N, w: 1 / N, y: Math.min(1.05, s === 99 ? 1.05 : s * 2.2) })),
      { fill: 'rgba(57,135,229,.35)', stroke: 'rgba(57,135,229,.8)', gap: N > 48 ? 0 : 1 });
    // 透過率
    gT.begin();
    gT.polyline([[0, 1], ...m.trans.map((t, i) => [(i + 1) / N, t])], { color: '#c98500', width: 2 });
    gT.label(0.02, 1, '出発時 100%', { color: '#9aa3b5', dy: -2 });
    roT.set(`${(m.T * 100).toFixed(1)}%`, m.T > 0.5 ? '#199e70' : '#e66767');
  }

  rebuildDensity();

  slider(ctl, { label: 'フォグ濃度', min: 0, max: 3, step: 0.05, value: density, oninput: v => { density = v; render(); } });
  slider(ctl, { label: 'ステップ数(刻みの細かさ)', min: 4, max: 128, step: 1, value: steps, oninput: v => { steps = v; render(); } });
  slider(ctl, { label: '濃度のむら', min: 0, max: 1, step: 0.05, value: uneven, oninput: v => { uneven = v; rebuildDensity(); render(); } });

  // 光源ドラッグ / ピクセル選択
  let dragLight = false;
  cMain.addEventListener('pointerdown', ev => {
    const r = cMain.getBoundingClientRect();
    const wx = (ev.clientX - r.left) / r.width * 16;
    const wy = (1 - (ev.clientY - r.top) / r.height) * 9;
    if (Math.hypot(wx - light.x, wy - light.y) < 1.0) {
      dragLight = true;
      cMain.setPointerCapture(ev.pointerId);
    } else if (!inPillar(wx, wy)) {
      probe = { x: clamp(wx, 0.2, 15.8), y: clamp(wy, 0.2, 8.8) };
      render();
    }
  });
  cMain.addEventListener('pointermove', ev => {
    if (!dragLight) return;
    const r = cMain.getBoundingClientRect();
    light.x = clamp((ev.clientX - r.left) / r.width * 16, 0.5, 15.5);
    light.y = clamp((1 - (ev.clientY - r.top) / r.height) * 9, 0.5, 8.5);
    render();
  });
  cMain.addEventListener('pointerup', () => { dragLight = false; });

  onResize(() => { gD.fit(); gT.fit(); render(); });
  render();
}
