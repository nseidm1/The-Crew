// mode.js - SIMPLE OR DEVELOPER. One product, two ways to use it, chosen before anything else on Start and changeable at any time
// from the top of the app.
//   simple      for someone who wants to talk to it: ask, look things up, read a page or a picture, make pictures and video. One
//               choice to make on Start (private on this computer, or with Claude), and an app that is the conversation.
//   developer   everything: choose the model yourself, connect a repository and Jira, proofs, autonomy, what the team has learned.
// The mode is how the pages are SHOWN. It changes nothing about what the team can do or what is kept: switching never loses anything,
// and a page that is hidden in Simple is still there in Developer exactly as it was left.
// It is kept in this browser. The root element carries it (data-mode), so a page can show or hide a thing in its stylesheet, and
// "fo:mode" is sent when it changes, so a page can redraw in place: nothing is reloaded.
const KEY = 'familyoffice.mode';
export const MODES = ['simple', 'developer'];
// '' when the person has never chosen: Start then asks first. The app treats that as Developer, which is what it was before modes.
export const chosenMode = () => {
  try {
    const m = localStorage.getItem(KEY);
    return MODES.includes(m) ? m : '';
  } catch {
    return '';
  }
};
export const getMode = () => chosenMode() || 'developer';
export const isSimple = () => getMode() === 'simple';
export const applyMode = () => {
  document.documentElement.dataset.mode = getMode();
};
export function setMode(m) {
  if (!MODES.includes(m)) return;
  try {
    localStorage.setItem(KEY, m);
  } catch {
    /* a private window: it holds for this page only */
  }
  document.documentElement.dataset.mode = m;
  window.dispatchEvent(new CustomEvent('fo:mode', { detail: m }));
}
// what each of the Simple app's pages is, for the pages that list them
export const SIMPLE_VIEWS = ['chat', 'remote', 'plan'];
