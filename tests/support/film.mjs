// film.mjs - THE FLIGHT'S CLOCK, for the checks that hold the landing page's film at a moment (?uni=seconds). The moments in those
// checks were chosen when the scenes had other lengths; a scene is lengthened when its captions need longer to be read, and a
// moment has to stay the same moment in the scene. at(seconds) takes a moment on the clock the checks were written against and
// gives it on the film's clock as it is now: the same scene, the same way through it.
import { SCENES, readTime } from '../../src/js/universe.js';

export const TOUR = SCENES.filter((s) => !s.only);
const WRITTEN = [9, 9.5, 9.5, 8.5, 7.5, 5.5]; // each scene's length when the checks' moments were chosen: 49.5 s in all
export const startOf = (i) => TOUR.slice(0, i).reduce((n, s) => n + s.d, 0);
export const LENGTH = startOf(TOUR.length);
export const at = (seconds) => {
  let from = 0;
  for (let i = 0; i < WRITTEN.length; i++) {
    if (seconds < from + WRITTEN[i] || i === WRITTEN.length - 1)
      return Math.round((startOf(i) + ((seconds - from) / WRITTEN[i]) * TOUR[i].d) * 100) / 100;
    from += WRITTEN[i];
  }
  return seconds;
};
// every caption of the flight: its scene, its words, when it comes and how long it stays. One that carries over the end of a scene
// into the start of the next is one caption.
export const CAPTIONS = (() => {
  const out = [];
  TOUR.forEach((s, i) =>
    s.beats.forEach(([frac, text], b) => {
      const end = b + 1 < s.beats.length ? s.beats[b + 1][0] : 1;
      const from = startOf(i) + frac * s.d;
      const shown = (end - frac) * s.d;
      const last = out[out.length - 1];
      if (last && last.text === text && b === 0) last.shown += shown;
      else out.push({ scene: s.name, text, from, shown, needs: readTime(text) });
    }),
  );
  return out;
})();
