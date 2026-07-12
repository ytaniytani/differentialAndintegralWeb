// 低解像度オフスクリーン + ImageData ベースのピクセル処理ヘルパー。
// 重い画素処理は小さな解像度で計算し、表示キャンバスへ拡大して描く。

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth3 = t => t * t * (3 - 2 * t);

export function lowres(canvas, w, h, { smooth = true } = {}) {
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const octx = off.getContext('2d');
  const img = octx.createImageData(w, h);
  return {
    w, h,
    data: img.data,
    set(x, y, r, g, b) {
      const i = (y * w + x) * 4;
      const d = img.data;
      d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = 255;
    },
    setGray(x, y, v) { this.set(x, y, v, v, v); },
    blit() {
      octx.putImageData(img, 0, 0);
      const r = canvas.getBoundingClientRect();
      const d = window.devicePixelRatio || 1;
      canvas.width = Math.max(2, Math.round(r.width * d));
      canvas.height = Math.max(2, Math.round(r.height * d));
      const g = canvas.getContext('2d');
      g.imageSmoothingEnabled = smooth;
      g.drawImage(off, 0, 0, canvas.width, canvas.height);
    },
    // 表示キャンバス上のポインタ位置 → 低解像度座標
    pos(ev) {
      const r = canvas.getBoundingClientRect();
      return [
        clamp((ev.clientX - r.left) / r.width * w, 0, w - 1),
        clamp((ev.clientY - r.top) / r.height * h, 0, h - 1),
      ];
    },
  };
}

// シード付きバリューノイズ + fbm(なめらかなむら)
export function makeNoise(seed = 1) {
  const hash = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const val = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const u = smooth3(x - xi), v = smooth3(y - yi);
    return lerp(
      lerp(hash(xi, yi), hash(xi + 1, yi), u),
      lerp(hash(xi, yi + 1), hash(xi + 1, yi + 1), u),
      v
    );
  };
  const fbm = (x, y, oct = 4) => {
    let a = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      a += amp * val(x * f, y * f);
      norm += amp;
      f *= 2; amp *= 0.5;
    }
    return a / norm;
  };
  return { val, fbm };
}
