// §4 重み付きで足す=ブラーとブルーム — ガウシアンブラー(畳み込み)
import { Graph } from '../core/graph.js';
import { slider, panes, canvasIn, controlsRow, onResize, hint, readout, button } from '../core/controls.js';
import { lowres, clamp } from '../core/pixels.js';

export function init(root) {
  const [pk, pv] = panes(root, [
    'wide:重みのグラフ(曲線 = 理想の重み、棒 = 実際のタップ)',
    'wide:プレビュー(クリックで光源を追加、ドラッグで移動)',
  ]);
  const cKer = canvasIn(pk, 170);
  const roSum = readout(pk, '重みの合計');
  const cPrev = canvasIn(pv, 280);
  hint(pv, '明るい部分を抜き出し → ぼかし → 重ねる、がブルームの全工程');
  const ctl = controlsRow(root);

  const W = 320, H = 180;
  const view = lowres(cPrev, W, H, { smooth: true });

  let radius = 18;
  let taps = 9;
  let threshold = 0.55;
  let intensity = 1.2;

  let lights = [];
  const defaultLights = () => ([
    { x: 78, y: 66, int: 5.0, col: [1, 0.82, 0.55] },
    { x: 190, y: 100, int: 3.6, col: [0.55, 0.8, 1] },
    { x: 262, y: 58, int: 4.2, col: [1, 0.6, 0.75] },
  ]);
  lights = defaultLights();

  // HDRバッファ
  const hdr = new Float32Array(W * H * 3);
  const bright = new Float32Array(W * H * 3);
  const blurA = new Float32Array(W * H * 3);
  const blurB = new Float32Array(W * H * 3);

  function buildScene() {
    // 暗い夜景ベース+ビルのシルエット
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 3;
        const t = y / H;
        hdr[i] = 0.012 + 0.02 * t;
        hdr[i + 1] = 0.016 + 0.024 * t;
        hdr[i + 2] = 0.03 + 0.038 * t;
      }
    }
    // ビル(暗い矩形)
    const bs = [[10, 90, 42], [66, 120, 34], [130, 80, 50], [205, 112, 40], [258, 95, 48]];
    for (const [bx, by, bw] of bs) {
      for (let y = H - 1; y >= by; y--) {
        for (let x = bx; x < Math.min(W, bx + bw); x++) {
          const i = (y * W + x) * 3;
          hdr[i] = 0.008; hdr[i + 1] = 0.01; hdr[i + 2] = 0.014;
        }
      }
    }
    // 光源(小さな輝点。広がりはブラーが作る)
    for (const L of lights) {
      const r = 4;
      for (let dy = -r * 3; dy <= r * 3; dy++) {
        for (let dx = -r * 3; dx <= r * 3; dx++) {
          const x = Math.round(L.x + dx), y = Math.round(L.y + dy);
          if (x < 0 || x >= W || y < 0 || y >= H) continue;
          const fall = Math.exp(-(dx * dx + dy * dy) / (2 * r * r));
          const i = (y * W + x) * 3;
          hdr[i] += L.int * L.col[0] * fall;
          hdr[i + 1] += L.int * L.col[1] * fall;
          hdr[i + 2] += L.int * L.col[2] * fall;
        }
      }
    }
  }

  // タップのオフセットと重み(±radius を taps 本でカバー)
  function kernel() {
    const off = [], wgt = [];
    const sigma = Math.max(0.6, radius / 2.2);
    for (let k = 0; k < taps; k++) {
      const o = taps === 1 ? 0 : -radius + (2 * radius) * k / (taps - 1);
      off.push(o);
      wgt.push(Math.exp(-o * o / (2 * sigma * sigma)));
    }
    const s = wgt.reduce((a, b) => a + b, 0);
    return { off, wgt: wgt.map(v => v / s), sigma };
  }

  function blurPass(src, dst, ker, horizontal) {
    const { off, wgt } = ker;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let r = 0, g = 0, b = 0;
        for (let k = 0; k < off.length; k++) {
          const sx = horizontal ? clamp(Math.round(x + off[k]), 0, W - 1) : x;
          const sy = horizontal ? y : clamp(Math.round(y + off[k]), 0, H - 1);
          const i = (sy * W + sx) * 3;
          r += src[i] * wgt[k]; g += src[i + 1] * wgt[k]; b += src[i + 2] * wgt[k];
        }
        const j = (y * W + x) * 3;
        dst[j] = r; dst[j + 1] = g; dst[j + 2] = b;
      }
    }
  }

  const gK = new Graph(cKer, { x0: -52, x1: 52, y0: 0, y1: 1.15, xLabel: '中心からの距離(px)', yLabel: '重み', padB: 22 });

  function render() {
    buildScene();
    const ker = kernel();
    // 明部抽出
    for (let i = 0; i < W * H; i++) {
      const j = i * 3;
      const lu = 0.2126 * hdr[j] + 0.7152 * hdr[j + 1] + 0.0722 * hdr[j + 2];
      const f = lu > threshold ? (lu - threshold) / lu : 0;
      bright[j] = hdr[j] * f; bright[j + 1] = hdr[j + 1] * f; bright[j + 2] = hdr[j + 2] * f;
    }
    blurPass(bright, blurA, ker, true);
    blurPass(blurA, blurB, ker, false);
    // 合成 + トーンマップ
    for (let i = 0; i < W * H; i++) {
      const j = i * 3, k = i * 4;
      for (let ch = 0; ch < 3; ch++) {
        const v = hdr[j + ch] + blurB[j + ch] * intensity;
        const tone = v / (1 + v);
        view.data[k + ch] = Math.round(255 * Math.pow(tone, 1 / 2.2));
      }
      view.data[k + 3] = 255;
    }
    view.blit();
    // 重みグラフ(高さは相対値: 中心 = 1)
    gK.begin();
    gK.curve(x => Math.exp(-x * x / (2 * ker.sigma * ker.sigma)), { color: '#3a4152', width: 1.5, dash: [4, 3] });
    const maxW = Math.max(...ker.wgt);
    gK.rects(ker.off.map((o, k) => ({ x: o - 1.2, w: 2.4, y: ker.wgt[k] / maxW })), { fill: 'rgba(57,135,229,.5)', stroke: 'rgba(57,135,229,.9)', gap: 0 });
    roSum.set('100%(合計1に正規化 = 明るさが保存される)', '#199e70');
  }

  slider(ctl, { label: 'ぼかし半径', min: 1, max: 50, step: 1, value: radius, unit: 'px', oninput: v => { radius = v; render(); } });
  slider(ctl, { label: 'タップ数(短冊の本数)', min: 3, max: 64, step: 1, value: taps, oninput: v => { taps = v; render(); } });
  slider(ctl, { label: 'ブルームしきい値', min: 0, max: 1.5, step: 0.05, value: threshold, oninput: v => { threshold = v; render(); } });
  slider(ctl, { label: 'ブルーム強度', min: 0, max: 3, step: 0.05, value: intensity, oninput: v => { intensity = v; render(); } });
  button(ctl, '光源をリセット', () => { lights = defaultLights(); render(); }, 'ghost');

  // 光源の追加・移動
  let dragLight = null;
  cPrev.addEventListener('pointerdown', ev => {
    const [mx, my] = view.pos(ev);
    for (const L of lights) {
      if (Math.hypot(mx - L.x, my - L.y) < 14) { dragLight = L; cPrev.setPointerCapture(ev.pointerId); return; }
    }
    if (lights.length < 8) {
      const hues = [[1, 0.82, 0.55], [0.55, 0.8, 1], [1, 0.6, 0.75], [0.7, 1, 0.7]];
      const L = { x: mx, y: my, int: 4, col: hues[lights.length % hues.length] };
      lights.push(L);
      dragLight = L;
      cPrev.setPointerCapture(ev.pointerId);
      render();
    }
  });
  cPrev.addEventListener('pointermove', ev => {
    if (!dragLight) return;
    const [mx, my] = view.pos(ev);
    dragLight.x = mx; dragLight.y = my;
    render();
  });
  cPrev.addEventListener('pointerup', () => { dragLight = null; });

  onResize(() => { gK.fit(); render(); });
  render();
}
