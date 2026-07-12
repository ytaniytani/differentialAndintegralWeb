// §3 隣との差=エッジ — アウトライン抽出(画像の微分)
import { slider, segmented, panes, canvasIn, controlsRow, onResize, hint } from '../core/controls.js';
import { lowres, clamp } from '../core/pixels.js';

export function init(root) {
  const [pl, pr] = panes(root, [
    '元のバッファ(図形はドラッグで動かせる)',
    '隣との差 → アウトライン',
  ]);
  const cSrc = canvasIn(pl, 240);
  hint(pl, '深度バッファ = カメラからの距離を濃淡にした画像(手前ほど暗い)');
  const cOut = canvasIn(pr, 240);
  const ctl = controlsRow(root);

  const W = 320, H = 180;
  const vSrc = lowres(cSrc, W, H, { smooth: false });
  const vOut = lowres(cOut, W, H, { smooth: false });

  let threshold = 0.06;
  let thickness = 1;
  let dir = 'both';
  let source = 'depth';
  let viewMode = 'composite';

  const shapes = [
    { type: 'circle', x: 90, y: 74, r: 38, depth: 0.30, gray: 0.72 },
    { type: 'rect', x: 185, y: 92, w: 74, h: 56, depth: 0.50, gray: 0.55 },
    { type: 'tri', x: 262, y: 118, r: 44, depth: 0.68, gray: 0.42 },
  ];

  const depth = new Float32Array(W * H);
  const lum = new Float32Array(W * H);
  const beautyRGB = new Uint8ClampedArray(W * H * 3);

  function rasterScene() {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        depth[i] = 0.86 + 0.10 * (y / H);          // 背景(遠い)
        const t = y / H;
        lum[i] = 0.10 + 0.06 * t;
        beautyRGB[i * 3] = 24 + 20 * t;
        beautyRGB[i * 3 + 1] = 28 + 22 * t;
        beautyRGB[i * 3 + 2] = 40 + 26 * t;
      }
    }
    // 奥から順に描く
    const sorted = shapes.slice().sort((a, b) => b.depth - a.depth);
    for (const s of sorted) {
      const gray = s.gray;
      const paint = (x, y, shade) => {
        if (x < 0 || x >= W || y < 0 || y >= H) return;
        const i = y * W + x;
        depth[i] = s.depth;
        const v = clamp(gray * shade, 0, 1);
        lum[i] = v;
        beautyRGB[i * 3] = v * 235;
        beautyRGB[i * 3 + 1] = v * 225;
        beautyRGB[i * 3 + 2] = v * 210;
      };
      if (s.type === 'circle') {
        for (let y = -s.r; y <= s.r; y++) for (let x = -s.r; x <= s.r; x++) {
          if (x * x + y * y <= s.r * s.r) {
            const shade = 0.75 + 0.4 * (-y / s.r) * 0.6; // 上が明るい
            paint(Math.round(s.x + x), Math.round(s.y + y), shade);
          }
        }
      } else if (s.type === 'rect') {
        for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
          const shade = 0.8 + 0.35 * (1 - y / s.h) * 0.6;
          paint(Math.round(s.x - s.w / 2 + x), Math.round(s.y - s.h / 2 + y), shade);
        }
      } else {
        for (let y = 0; y <= s.r; y++) {
          const half = (y / s.r) * s.r * 0.75;
          for (let x = -half; x <= half; x++) {
            const shade = 0.8 + 0.3 * (1 - y / s.r) * 0.6;
            paint(Math.round(s.x + x), Math.round(s.y - s.r / 2 + y), shade);
          }
        }
      }
    }
  }

  const mag = new Float32Array(W * H);
  const edge = new Uint8Array(W * H);
  const tmp = new Uint8Array(W * H);

  function process() {
    const src = source === 'depth' ? depth : lum;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const gx = x > 0 && x < W - 1 ? (src[i + 1] - src[i - 1]) * 0.5 : 0;
        const gy = y > 0 && y < H - 1 ? (src[i + W] - src[i - W]) * 0.5 : 0;
        mag[i] = dir === 'h' ? Math.abs(gx) : dir === 'v' ? Math.abs(gy) : Math.hypot(gx, gy);
      }
    }
    for (let i = 0; i < W * H; i++) edge[i] = mag[i] > threshold ? 1 : 0;
    // 太らせる(単純な膨張)
    for (let pass = 1; pass < thickness; pass++) {
      tmp.set(edge);
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          const i = y * W + x;
          if (tmp[i] || tmp[i - 1] || tmp[i + 1] || tmp[i - W] || tmp[i + W]) edge[i] = 1;
        }
      }
    }
  }

  function render() {
    rasterScene();
    process();
    // 左: ソース表示
    for (let i = 0; i < W * H; i++) {
      const j = i * 4;
      if (source === 'depth') {
        const v = Math.round(depth[i] * 255);
        vSrc.data[j] = v; vSrc.data[j + 1] = v; vSrc.data[j + 2] = v;
      } else {
        vSrc.data[j] = beautyRGB[i * 3]; vSrc.data[j + 1] = beautyRGB[i * 3 + 1]; vSrc.data[j + 2] = beautyRGB[i * 3 + 2];
      }
      vSrc.data[j + 3] = 255;
    }
    vSrc.blit();
    // 右: 出力
    for (let i = 0; i < W * H; i++) {
      const j = i * 4;
      if (viewMode === 'mag') {
        const v = Math.round(clamp(mag[i] * 8, 0, 1) * 255);
        vOut.data[j] = v; vOut.data[j + 1] = v; vOut.data[j + 2] = v;
      } else if (edge[i]) {
        vOut.data[j] = 8; vOut.data[j + 1] = 10; vOut.data[j + 2] = 14;
      } else {
        vOut.data[j] = beautyRGB[i * 3]; vOut.data[j + 1] = beautyRGB[i * 3 + 1]; vOut.data[j + 2] = beautyRGB[i * 3 + 2];
      }
      vOut.data[j + 3] = 255;
    }
    vOut.blit();
  }

  segmented(ctl, {
    label: '右の表示',
    options: [{ key: 'mag', label: '差の大きさをそのまま' }, { key: 'composite', label: '線にして合成' }],
    value: 'composite',
    onchange: v => { viewMode = v; render(); },
  });
  slider(ctl, { label: 'しきい値', min: 0.005, max: 0.3, step: 0.005, value: threshold, oninput: v => { threshold = v; render(); } });
  slider(ctl, { label: '線の太さ', min: 1, max: 5, step: 1, value: 1, unit: 'px', oninput: v => { thickness = v; render(); } });
  segmented(ctl, {
    label: '差をとる方向',
    options: [{ key: 'h', label: '横のみ' }, { key: 'v', label: '縦のみ' }, { key: 'both', label: '両方' }],
    value: 'both',
    onchange: v => { dir = v; render(); },
  });
  segmented(ctl, {
    label: 'ソース',
    options: [{ key: 'depth', label: '深度' }, { key: 'lum', label: '明るさ' }],
    value: 'depth',
    onchange: v => { source = v; render(); },
  });

  // 図形ドラッグ
  let dragShape = null;
  cSrc.addEventListener('pointerdown', ev => {
    const [mx, my] = vSrc.pos(ev);
    for (let k = shapes.length - 1; k >= 0; k--) {
      const s = shapes[k];
      const within =
        s.type === 'circle' ? Math.hypot(mx - s.x, my - s.y) <= s.r :
        s.type === 'rect' ? Math.abs(mx - s.x) <= s.w / 2 && Math.abs(my - s.y) <= s.h / 2 :
        Math.hypot(mx - s.x, my - s.y) <= s.r;
      if (within) { dragShape = s; cSrc.setPointerCapture(ev.pointerId); break; }
    }
  });
  cSrc.addEventListener('pointermove', ev => {
    if (!dragShape) return;
    const [mx, my] = vSrc.pos(ev);
    dragShape.x = mx; dragShape.y = my;
    render();
  });
  cSrc.addEventListener('pointerup', () => { dragShape = null; });

  onResize(render);
  render();
}
