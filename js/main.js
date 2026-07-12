// 各デモの初期化とページ全体の挙動
import { init as prep1 } from './demos/prep1_slope.js';
import { init as prep2 } from './demos/prep2_area.js';
import { init as demo1 } from './demos/demo1_tonecurve.js';
import { init as demo2 } from './demos/demo2_normal.js';
import { init as demo3 } from './demos/demo3_edge.js';
import { init as demo4 } from './demos/demo4_bloom.js';
import { init as demo5 } from './demos/demo5_softshadow.js';
import { init as demo6 } from './demos/demo6_fog.js';
import { init as demo7 } from './demos/demo7_temporal.js';
import { makeLoop } from './core/anim.js';
import { fitCanvas } from './core/controls.js';
import { makeNoise } from './core/pixels.js';

const demos = {
  'demo-p1': prep1,
  'demo-p2': prep2,
  'demo-1': demo1,
  'demo-2': demo2,
  'demo-3': demo3,
  'demo-4': demo4,
  'demo-5': demo5,
  'demo-6': demo6,
  'demo-7': demo7,
};

for (const [id, init] of Object.entries(demos)) {
  const rootEl = document.getElementById(id);
  if (!rootEl) continue;
  try {
    init(rootEl);
  } catch (err) {
    console.error(`demo "${id}" の初期化に失敗:`, err);
    rootEl.textContent = 'このデモの読み込みに失敗しました。ページを再読み込みしてください。';
  }
}

// ヘッダーの装飾アニメ(光が動き、地形の陰影が変わる)
(function hero() {
  const cv = document.getElementById('hero-canvas');
  if (!cv) return;
  const noise = makeNoise(11);
  let t = 0;
  const loop = makeLoop(cv, dt => {
    t += dt;
    const { g: c, w, h } = fitCanvas(cv);
    c.fillStyle = '#0d1017';
    c.fillRect(0, 0, w, h);
    const th = (Math.sin(t * 0.25) * 0.5 + 0.5) * Math.PI * 0.8 + Math.PI * 0.1;
    const Lx = Math.cos(th), Ly = Math.sin(th);
    const sunX = w * 0.5 + Math.cos(th) * w * 0.45;
    const sunY = h * 0.92 - Math.sin(th) * h * 0.75;
    const glow = c.createRadialGradient(sunX, sunY, 2, sunX, sunY, 60);
    glow.addColorStop(0, 'rgba(255,215,150,.8)');
    glow.addColorStop(1, 'rgba(255,215,150,0)');
    c.fillStyle = glow;
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#ffd9a0';
    c.beginPath(); c.arc(sunX, sunY, 6, 0, Math.PI * 2); c.fill();
    const baseY = h * 0.96, scale = h * 0.5;
    for (let sx = 0; sx < w; sx++) {
      const x = sx / w;
      const hh = noise.fbm(x * 4.5, 2.5, 4);
      const h2 = noise.fbm((x + 0.002) * 4.5, 2.5, 4);
      const slope = (h2 - hh) / 0.002;
      let nx = -slope, ny = 1;
      const m = Math.hypot(nx, ny); nx /= m; ny /= m;
      const b = Math.max(0, nx * Lx + ny * Ly);
      const v = 0.08 + 0.92 * b;
      c.fillStyle = `rgb(${Math.round(16 + 170 * v)}, ${Math.round(16 + 150 * v)}, ${Math.round(20 + 130 * v)})`;
      c.fillRect(sx, baseY - hh * scale, 1, hh * scale + h * 0.04);
    }
  });
  loop.start();
})();

// ナビの現在地ハイライト
(function nav() {
  const links = [...document.querySelectorAll('nav.toc a[href^="#"]')];
  const map = new Map(links.map(a => [a.getAttribute('href').slice(1), a]));
  const io = new IntersectionObserver(entries => {
    for (const e of entries) {
      const a = map.get(e.target.id);
      if (a && e.isIntersecting) {
        links.forEach(l => l.classList.remove('on'));
        a.classList.add('on');
      }
    }
  }, { rootMargin: '-30% 0px -60% 0px' });
  for (const id of map.keys()) {
    const s = document.getElementById(id);
    if (s) io.observe(s);
  }
})();
