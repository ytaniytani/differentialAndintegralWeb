// §1 トーンカーブの傾き=コントラスト — カラーグレーディング
import { Graph } from '../core/graph.js';
import { slider, segmented, toggle, panes, canvasIn, controlsRow, onResize, el, hint } from '../core/controls.js';
import { lowres, clamp, smooth3 } from '../core/pixels.js';

export function init(root) {
  const [pv, pg] = panes(root, ['プレビュー(下段の帯 = 暗→明のグラデーション)', 'トーンカーブと、その傾き']);
  const cPrev = canvasIn(pv, 210);
  const cHist = canvasIn(pv, 70);
  hint(pv, '下の棒グラフ = 画像の明るさの分布(ヒストグラム)');
  const cCurve = canvasIn(pg, 150);
  const cDeriv = canvasIn(pg, 130);
  hint(pg, '下段: 各点での傾き。1より上 = コントラスト増、1より下 = 眠くなる、0 = 階調が死ぬ');
  const ctl = controlsRow(root);

  const P = { s: 0, c: 0, lift: 0 };

  const curveFn = x => {
    const gamma = Math.pow(2, -P.c);
    let y = Math.pow(clamp(x, 0, 1), gamma);
    y = y + (smooth3(y) - y) * P.s;
    y = P.lift + (1 - P.lift) * y;
    return clamp(y, 0, 1);
  };

  // LUT と傾き
  const LUT = new Float32Array(257);
  const DER = new Float32Array(257);
  function rebuildLUT() {
    for (let i = 0; i <= 256; i++) LUT[i] = curveFn(i / 256);
    for (let i = 0; i <= 256; i++) {
      const i0 = Math.max(0, i - 1), i1 = Math.min(256, i + 1);
      DER[i] = (LUT[i1] - LUT[i0]) / ((i1 - i0) / 256);
    }
  }

  // テスト画像(グレースケール 0..1)を一度だけ生成
  const W = 320, H = 180;
  const view = lowres(cPrev, W, H, { smooth: true });
  const base = new Float32Array(W * H);
  (function buildImage() {
    const skyH = H * 0.52, rampY = H * 0.82;
    // 山の稜線
    const ridge1 = x => H * 0.40 + 26 * Math.sin(x * 0.021 + 1) + 12 * Math.sin(x * 0.052);
    const ridge2 = x => H * 0.58 + 18 * Math.sin(x * 0.013 + 4) + 8 * Math.sin(x * 0.035 + 2);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let v;
        if (y >= rampY) {
          v = x / (W - 1);                       // グラデーション帯
        } else if (y > ridge2(x)) {
          v = 0.30 + 0.10 * (y / H);             // 手前の山
        } else if (y > ridge1(x)) {
          v = 0.45 + 0.08 * (y / H);             // 奥の山
        } else {
          v = 0.88 - 0.45 * (y / skyH);          // 空
          const dx = x - W * 0.72, dy = y - H * 0.20;
          if (dx * dx + dy * dy < 130) v = 1.0;  // 太陽
        }
        base[y * W + x] = clamp(v, 0, 1);
      }
    }
  })();

  const gC = new Graph(cCurve, { x0: 0, x1: 1, y0: 0, y1: 1, xLabel: '元の明るさ', yLabel: '出力', padB: 22 });
  const gD = new Graph(cDeriv, { x0: 0, x1: 1, y0: 0, y1: 3.2, xLabel: '元の明るさ', yLabel: '傾き', padB: 22 });
  gC.tooltip((x, y) => `入力 ${x.toFixed(2)} → 出力 ${curveFn(x).toFixed(2)}`);
  gD.tooltip(x => `入力 ${x.toFixed(2)} の傾き ${DER[Math.round(clamp(x, 0, 1) * 256)].toFixed(2)}`);

  let showDeriv = true;

  const sS = slider(ctl, { label: 'S字の強さ', min: 0, max: 1, step: 0.01, value: 0, oninput: v => { P.s = v; presetSeg.value = 'custom'; render(); } });
  const cS = slider(ctl, { label: '明るさの中心', min: -1, max: 1, step: 0.01, value: 0, oninput: v => { P.c = v; presetSeg.value = 'custom'; render(); } });
  const lS = slider(ctl, { label: 'リフト(黒浮き)', min: 0, max: 0.3, step: 0.01, value: 0, oninput: v => { P.lift = v; presetSeg.value = 'custom'; render(); } });
  const presets = {
    none: { s: 0, c: 0, lift: 0 },
    scurve: { s: 0.85, c: 0, lift: 0 },
    film: { s: 0.6, c: 0.15, lift: 0.06 },
    blown: { s: 1, c: 0.7, lift: 0 },
  };
  const presetSeg = segmented(ctl, {
    label: 'プリセット',
    options: [
      { key: 'none', label: '変化なし' },
      { key: 'scurve', label: 'S字' },
      { key: 'film', label: 'フィルム風' },
      { key: 'blown', label: '白飛び気味' },
      { key: 'custom', label: '(手動)' },
    ],
    value: 'none',
    onchange: k => {
      if (!presets[k]) return;
      Object.assign(P, presets[k]);
      sS.value = P.s; cS.value = P.c; lS.value = P.lift;
      render();
    },
  });
  toggle(ctl, { label: '傾きグラフを見る', value: true, onchange: v => { showDeriv = v; cDeriv.style.display = v ? '' : 'none'; render(); } });

  const hist = new Float32Array(48);

  function render() {
    rebuildLUT();
    // 画像へLUT適用 + ヒストグラム
    hist.fill(0);
    for (let i = 0; i < W * H; i++) {
      const out = LUT[Math.round(base[i] * 256)];
      const v = Math.round(out * 255);
      const j = i * 4;
      view.data[j] = v; view.data[j + 1] = v; view.data[j + 2] = v; view.data[j + 3] = 255;
      hist[Math.min(47, Math.floor(out * 48))]++;
    }
    view.blit();
    drawHist();
    // カーブ
    gC.begin();
    gC.curve(x => x, { color: '#3a4152', dash: [4, 4], width: 1.5 }); // 基準(変化なし)
    gC.curve(x => LUT[Math.round(x * 256)], { color: '#3987e5' });
    // 傾き
    if (showDeriv) {
      gD.begin();
      // 傾き>1 の帯を強調
      gD.clip(() => {
        const ctx = gD.ctx;
        ctx.fillStyle = 'rgba(25,158,112,.12)';
        let start = -1;
        for (let i = 0; i <= 256; i++) {
          const over = DER[i] > 1;
          if (over && start < 0) start = i;
          if ((!over || i === 256) && start >= 0) {
            ctx.fillRect(gD.X(start / 256), gD.Y(gD.o.y1), gD.X(i / 256) - gD.X(start / 256), gD.Y(gD.o.y0) - gD.Y(gD.o.y1));
            start = -1;
          }
        }
      });
      gD.hline(1, { color: '#9aa3b5', dash: [4, 4] });
      gD.label(0.02, 1, '傾き1(変化なしの基準)', { color: '#9aa3b5', dy: -3 });
      gD.curve(x => clamp(DER[Math.round(clamp(x, 0, 1) * 256)], 0, 3.2), { color: '#c98500' });
    }
  }

  function drawHist() {
    const r = cHist.getBoundingClientRect();
    const d = window.devicePixelRatio || 1;
    cHist.width = r.width * d; cHist.height = r.height * d;
    const c = cHist.getContext('2d');
    c.setTransform(d, 0, 0, d, 0, 0);
    c.fillStyle = '#12151c';
    c.fillRect(0, 0, r.width, r.height);
    const max = Math.max(...hist) || 1;
    const bw = r.width / 48;
    c.fillStyle = '#3987e5';
    for (let i = 0; i < 48; i++) {
      const h = (hist[i] / max) * (r.height - 6);
      c.fillRect(i * bw + 1, r.height - h, bw - 2, h);
    }
  }

  onResize(() => { gC.fit(); gD.fit(); render(); });
  render();
}
