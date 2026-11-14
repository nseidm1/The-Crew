// glide.js - a chat log that FOLLOWS its newest line without jumping. When something is added, the view eases down to it over a few
// frames instead of snapping, so the lines above move as one smooth motion. It stops following the moment the reader scrolls up to
// read, and starts again when they return to the bottom. With reduced motion it places the view directly.
export function follow(log, { near = 90, ease = 0.16 } = {}) {
  let following = true;
  let raf = 0;
  let held = false;
  let beat = false;
  let dog = 0;
  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gap = () => log.scrollHeight - log.clientHeight - log.scrollTop;
  const read = () => {
    if (!raf && !held) following = gap() < near;
  };
  const step = () => {
    const d = gap();
    beat = true;
    if (!following || held || d < 1) {
      if (following && !held && d > 0) log.scrollTop = log.scrollHeight;
      raf = 0;
      return;
    }
    log.scrollTop += Math.max(1, d * ease);
    raf = requestAnimationFrame(step);
  };
  // the reader's own scrolling decides whether it still follows
  const mine = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    setTimeout(() => {
      following = gap() < near;
    }, 0);
  };
  log.addEventListener('wheel', mine, { passive: true });
  log.addEventListener('touchmove', mine, { passive: true });
  log.addEventListener('keydown', mine);
  log.addEventListener('pointerdown', () => {
    held = true;
    cancelAnimationFrame(raf);
    raf = 0;
  });
  addEventListener('pointerup', () => {
    if (held) {
      held = false;
      following = gap() < near;
    }
  });
  log.addEventListener('scroll', read, { passive: true });
  return {
    // something was added: ease down to it, if the reader is at the bottom (or always, when they just sent something)
    go(force) {
      if (force) following = true;
      if (!following || held) return;
      if (still) {
        log.scrollTop = log.scrollHeight;
        return;
      }
      if (raf) return;
      beat = false;
      raf = requestAnimationFrame(step);
      // a page that is not being drawn (a covered window, a background tab) gets no frames: place the view directly instead of waiting
      clearTimeout(dog);
      dog = setTimeout(() => {
        if (raf && !beat) {
          cancelAnimationFrame(raf);
          raf = 0;
          log.scrollTop = log.scrollHeight;
        }
      }, 180);
    },
    // place it at the bottom at once (a view that has just opened)
    pin() {
      following = true;
      cancelAnimationFrame(raf);
      raf = 0;
      log.scrollTop = log.scrollHeight;
    },
  };
}
