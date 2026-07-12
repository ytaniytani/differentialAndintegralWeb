// §7 自動露出とフレーム蓄積 — 時間方向の微積分(挑戦編)
import { Graph } from '../core/graph.js';
import { slider, segmented, toggle, panes, canvasIn, controlsRow, onResize, fitCanvas, hint, readout, button, el } from '../core/controls.js';
import { makeLoop } from '../core/anim.js';
import { lowres, clamp } from '../core/pixels.js';

export function init(root) {
  // タブ
  const tabs = el('div', 'tabs', root);
  const tabA = el('button', 'tab-btn on', tabs); tabA.type = 'button'; tabA.textContent = 'A. 自動露出(目の順応)';
  const tabB = el('button', 'tab-btn', tabs); tabB.type = 'button'; tabB.textContent = 'B. フレーム蓄積(ノイズを時間で消す)';
  const paneA = el('div', '', root);
  const paneB = el('div', '', root);
  paneB.style.display = 'none';
  tabA.onclick = () => { tabA.classList.add('on'); tabB.classList.remove('on'); paneA.style.display = ''; paneB.style.display = 'none'; };
  tabB.onclick = () => { tabB.classList.add('on'); tabA.classList.remove('on'); paneB.style.display = ''; paneA.style.display = 'none'; };

  /* ---------- タブA: 自動露出 ---------- */
  {
    const [pv, pg] = panes(paneA, ['プレビュー(露出が追いつくまでの見え方)', '露出の動き(時間グラフ)']);
    const cPrev = canvasIn(pv, 220);
    const cG = canvasIn(pg, 220);
    hint(pg, '青 = Δtを掛けた正しい実装 / 紫 = Δtを掛け忘れた実装(fpsを変えると差が出る)');
    const ctl = controlsRow(paneA);

    let outdoor = false;
    let speed = 3;
    let fps = 60;
    const sceneLum = () => (outdoor ? 1.6 : 0.15);
    const targetE = () => 0.45 / sceneLum();

    let simT = 0, acc = 0;
    let E1 = targetE(), E2 = targetE();   // 1: Δtあり, 2: Δtなし
    const hist = [];                       // {t, tgt, e1, e2}
    const SPAN = 8;

    const g = new Graph(cG, { x0: 0, x1: SPAN, y0: 0, y1: 3.4, xLabel: '時間(秒)', yLabel: '露出(ゲイン)' });

    const roE = readout(ctl, '露出(Δtあり)');
    const roE2 = readout(ctl, '露出(Δtなし)');

    function step() {
      const dtf = 1 / fps;
      E1 += (targetE() - E1) * Math.min(1, speed * dtf);   // 正しい: 差 × 速度 × Δt
      E2 += (targetE() - E2) * 0.08;                        // 掛け忘れ: 毎フレーム固定8%
      simT += dtf;
      hist.push({ t: simT, tgt: targetE(), e1: E1, e2: E2 });
      while (hist.length && hist[0].t < simT - SPAN) hist.shift();
    }

    function drawPreview() {
      const { g: c, w, h } = fitCanvas(cPrev);
      const seen = v => { const t = Math.max(0, v); return Math.round(255 * Math.pow(t / (1 + t), 1 / 2.2)); };
      const lum = sceneLum() * E1;
      if (outdoor) {
        const sky = c.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, `rgb(${seen(lum * 0.9)}, ${seen(lum * 1.05)}, ${seen(lum * 1.5)})`);
        sky.addColorStop(1, `rgb(${seen(lum * 1.3)}, ${seen(lum * 1.25)}, ${seen(lum * 1.1)})`);
        c.fillStyle = sky;
        c.fillRect(0, 0, w, h);
        c.fillStyle = `rgb(${seen(lum * 2.4)}, ${seen(lum * 2.2)}, ${seen(lum * 1.7)})`;
        c.beginPath(); c.arc(w * 0.72, h * 0.24, 20, 0, Math.PI * 2); c.fill();
        c.fillStyle = `rgb(${seen(lum * 0.5)}, ${seen(lum * 0.55)}, ${seen(lum * 0.4)})`;
        c.fillRect(0, h * 0.7, w, h * 0.3);
      } else {
        c.fillStyle = `rgb(${seen(lum * 0.8)}, ${seen(lum * 0.75)}, ${seen(lum * 0.7)})`;
        c.fillRect(0, 0, w, h);
        // 窓(外はとても明るい)
        c.fillStyle = `rgb(${seen(1.6 * E1 * 1.4)}, ${seen(1.6 * E1 * 1.35)}, ${seen(1.6 * E1 * 1.2)})`;
        c.fillRect(w * 0.6, h * 0.15, w * 0.26, h * 0.4);
        c.strokeStyle = '#12151c';
        c.lineWidth = 3;
        c.strokeRect(w * 0.6, h * 0.15, w * 0.26, h * 0.4);
        c.beginPath(); c.moveTo(w * 0.73, h * 0.15); c.lineTo(w * 0.73, h * 0.55); c.stroke();
        // 床
        c.fillStyle = `rgb(${seen(lum * 0.55)}, ${seen(lum * 0.5)}, ${seen(lum * 0.45)})`;
        c.fillRect(0, h * 0.75, w, h * 0.25);
      }
      c.fillStyle = 'rgba(10,12,16,.65)';
      c.fillRect(8, 8, 150, 24);
      c.fillStyle = '#d5dae3';
      c.font = '12px system-ui, sans-serif';
      c.textAlign = 'left'; c.textBaseline = 'middle';
      c.fillText(outdoor ? '屋外(まぶしい→順応)' : '室内(暗い→順応)', 14, 20);
    }

    function drawGraph() {
      const t0 = Math.max(0, simT - SPAN);
      g.o.x0 = t0; g.o.x1 = t0 + SPAN;
      g.begin();
      if (hist.length > 1) {
        g.polyline(hist.map(p => [p.t, p.tgt]), { color: '#9aa3b5', width: 1.5, dash: [4, 4] });
        g.polyline(hist.map(p => [p.t, p.e2]), { color: '#9085e9', width: 2 });
        g.polyline(hist.map(p => [p.t, p.e1]), { color: '#3987e5', width: 2.5 });
        const last = hist[hist.length - 1];
        g.label(last.t, last.tgt, '目標', { color: '#9aa3b5', align: 'right', dy: -4 });
      }
      roE.set(E1.toFixed(2), '#3987e5');
      roE2.set(E2.toFixed(2), '#9085e9');
    }

    const loop = makeLoop(paneA, dt => {
      acc += dt;
      const ft = 1 / fps;
      let n = 0;
      while (acc >= ft && n < 300) { step(); acc -= ft; n++; }
      drawPreview();
      drawGraph();
    });

    button(ctl, '屋外へ出る / 室内へ戻る', () => { outdoor = !outdoor; }, 'primary');
    slider(ctl, { label: '順応の速さ', min: 0.5, max: 8, step: 0.1, value: speed, unit: '/秒', oninput: v => { speed = v; } });
    segmented(ctl, {
      label: 'フレームレート',
      options: [{ key: 30, label: '30fps' }, { key: 60, label: '60fps' }, { key: 144, label: '144fps' }],
      value: 60,
      onchange: v => { fps = +v; },
    });
    button(ctl, 'グラフをリセット', () => { hist.length = 0; simT = 0; E1 = E2 = targetE(); }, 'ghost');

    loop.start();
    onResize(() => { g.fit(); });
  }

  /* ---------- タブB: フレーム蓄積 ---------- */
  {
    const [pn, pa] = panes(paneB, [
      '毎フレームの生画像(1サンプル/ピクセル = ノイズだらけ)',
      '蓄積した画像(過去フレームと混ぜ続ける)',
    ]);
    const cNoisy = canvasIn(pn, 220);
    const cAcc = canvasIn(pa, 220);
    hint(pa, '「動かす」をONにするとゴースト(残像)= 時間積分の副作用が見える');
    const ctl = controlsRow(paneB);

    const W = 160, H = 90;
    const vN = lowres(cNoisy, W, H, { smooth: false });
    const vA = lowres(cAcc, W, H, { smooth: true });
    const accBuf = new Float32Array(W * H);

    let alpha = 0.06;
    let moving = false;
    let time = 0;

    // ライト(線分)・遮蔽物のあるミニシーン。各ピクセル=空間中の点の「光の見え具合」を1サンプルで推定
    const LY = 8, LX = 8, LHW = 2.2;
    function occRect(t) {
      const cx = 8 + (moving ? 2.2 * Math.sin(t * 1.1) : 0);
      return { x0: cx - 1.3, x1: cx + 1.3, y0: 4.2, y1: 5.0 };
    }
    function blocked(px, py, sx, sy, o) {
      const dx = sx - px, dy = sy - py;
      let tmin = 0, tmax = 1;
      if (Math.abs(dx) < 1e-9) { if (px < o.x0 || px > o.x1) return false; }
      else {
        let t1 = (o.x0 - px) / dx, t2 = (o.x1 - px) / dx;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      }
      if (Math.abs(dy) < 1e-9) { if (py < o.y0 || py > o.y1) return false; }
      else {
        let t1 = (o.y0 - py) / dy, t2 = (o.y1 - py) / dy;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      }
      return tmin <= tmax;
    }

    const roN = readout(ctl, '平均しているフレーム数の目安');

    const loop = makeLoop(paneB, dt => {
      time += dt;
      const o = occRect(time);
      for (let gy = 0; gy < H; gy++) {
        for (let gx = 0; gx < W; gx++) {
          const wx = (gx + 0.5) / W * 16;
          const wy = (1 - (gy + 0.5) / H) * 9;
          let v;
          const inOcc = wx >= o.x0 && wx <= o.x1 && wy >= o.y0 && wy <= o.y1;
          if (inOcc) v = 0.02;
          else {
            const sx = LX + (Math.random() * 2 - 1) * LHW;   // 1サンプル
            const vis = blocked(wx, wy, sx, LY, o) ? 0 : 1;
            const d2 = (wx - LX) ** 2 + (wy - LY) ** 2;
            v = vis * 2.2 / (1 + 0.10 * d2) * 0.5 + 0.015;
          }
          const i = gy * W + gx;
          accBuf[i] += (v - accBuf[i]) * alpha;   // 蓄積 = 時間方向の混ぜ合わせ
          const nv = Math.round(clamp(v, 0, 1) * 255);
          const av = Math.round(clamp(accBuf[i], 0, 1) * 255);
          vN.set(gx, gy, nv, Math.round(nv * 0.9), Math.round(nv * 0.72));
          vA.set(gx, gy, av, Math.round(av * 0.9), Math.round(av * 0.72));
        }
      }
      vN.blit();
      vA.blit();
    });

    slider(ctl, {
      label: '新しいフレームを混ぜる割合', min: 0.02, max: 1, step: 0.01, value: alpha,
      oninput: v => { alpha = v; roN.set(`約 ${Math.round(1 / alpha)} フレーム`); },
    });
    toggle(ctl, { label: 'シーンを動かす(ゴーストを見る)', value: false, onchange: v => { moving = v; } });
    button(ctl, '蓄積をリセット', () => accBuf.fill(0), 'ghost');
    roN.set(`約 ${Math.round(1 / alpha)} フレーム`);

    loop.start();
  }
}
