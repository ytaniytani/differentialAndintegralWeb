// requestAnimationFrame ループ管理。
// 画面外のセクションは IntersectionObserver で自動停止し、戻ると再開する。

export function makeLoop(watchEl, fn) {
  let running = false;
  let visible = true;
  let raf = 0;
  let last = 0;

  const io = new IntersectionObserver(entries => {
    for (const e of entries) visible = e.isIntersecting;
    sync();
  }, { rootMargin: '80px' });
  io.observe(watchEl);

  function frame(t) {
    raf = 0;
    if (!(running && visible)) return;
    const dt = Math.min(0.05, (t - last) / 1000) || 0.016;
    last = t;
    fn(dt);
    raf = requestAnimationFrame(frame);
  }

  function sync() {
    if (running && visible && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(frame);
    } else if (!(running && visible) && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  return {
    start() { running = true; sync(); },
    stop() { running = false; sync(); },
    get running() { return running; },
  };
}
