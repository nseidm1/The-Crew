// host.js - WHAT THE TEAM NEEDS FROM THIS COMPUTER (Developer): whether it is speaking to someone new or to a developer; a folder to
// build in; the website it made, served here and watched; and a phone to put an app on. Each is a message with something to press.
import { isSimple } from '../mode.js';
import { SHOP, SHOP_BRIEF } from './manners.js';

// ---- WHO THE TEAM IS TALKING TO (Developer): someone new to building software, or someone who does it for a living. It is read
// from what they say: the words of the trade make them experienced, and that sticks; the words of someone starting out make
// them new, until they show otherwise. Each seat is told (devNote), so that one is given plain words and a button, and the other
// is not explained things they know. Nothing of it is shown.
export const SEASONED =
  /\b(repo(sitory)?|branch(es)?|commit|pull request|merge|rebase|refactor|endpoint|schema|migration|unit tests?|pipeline|docker|kubernetes|staging|production|deploy(ment)?|typescript|javascript|react|next\.?js|vue|django|rails|gradle|kotlin|swift|flutter|npm|yarn|pnpm|pip|stack ?trace|regex|sdk|cli|api|ci)\b|\.(js|ts|tsx|py|kt|swift|dart|go|rs|java|json|ya?ml)\b|\bsrc\/|localhost:\d+/i;

export const NEWCOMER =
  /\b(i want to (make|build|create)|i('d| would) like to (make|build|create)|can you (make|build|create) me|how do i (start|make|build|create)|i('ve| have) never|i('m| am) new|no idea (how|where)|from scratch|my first (app|website|site|program)|don'?t know (how|where) to start)\b/i;

// said of themself, which settles it either way
export const SAYS_SEASONED =
  /\b(i('m| am) an? (software |senior |staff |principal |lead |backend |back-end |frontend |front-end |full-?stack |mobile |ios |android |web |devops |data )*(engineer|developer|programmer|dev|sre)|i (code|program|write (code|software)|build software) (for a living|professionally|at work|for work)|i work as an? (software |web |mobile )?(engineer|developer|programmer)|as an? (engineer|developer|programmer),? i)\b/i;

export const SAYS_NEW =
  /\b(i('m| am) not (an? )?(technical|developer|programmer|coder|engineer|tech(y|ie)?( person)?)|i('m| am) (an? )?(beginner|newbie|amateur|hobbyist|non-?technical)|i (don'?t|do not|can'?t|cannot) (know how to )?(code|program)|i('m| am) (just )?(learning|starting|new) to (code|program)|i('ve| have) never (coded|programmed|written (any )?code)|(as|for) a hobby|not a (tech|computer) person)\b/i;

// the words of the trade in a message, each counted once
export const tradeIn = (text) => [
  ...new Set((String(text || '').match(new RegExp(SEASONED.source, 'gi')) || []).map((w) => w.toLowerCase())),
];

export function installHost(ctx) {
  const sizeUp = (text) => {
    const t = String(text || '');
    const was = (ctx.state.dev && ctx.state.dev.level) || '';
    const trade = tradeIn(t);
    const starting = NEWCOMER.test(t);
    const level = SAYS_NEW.test(t)
      ? 'new' // they said so themself: that outranks any word they used
      : SAYS_SEASONED.test(t) || trade.length >= 2 || (trade.length === 1 && !starting)
        ? 'seasoned'
        : was !== 'seasoned' && starting
          ? 'new' // one word of the trade inside "I want to make an app with an API" is someone starting out
          : was;
    if (level !== was)
      ctx.state.dev = {
        level,
        at: Date.now(),
        from: t.slice(0, 120),
        why:
          SAYS_NEW.test(t) || SAYS_SEASONED.test(t)
            ? 'they said so'
            : trade.length
              ? 'the words of the trade: ' + trade.slice(0, 4).join(', ')
              : 'the words of someone starting out',
      };
    return level;
  };

  const fresh = () => !(ctx.state.dev && ctx.state.dev.level === 'seasoned'); // spoken to as someone new, until they show otherwise

  const devNote = () =>
    isSimple() || !ctx.state.dev || !ctx.state.dev.level
      ? ''
      : (ctx.onClaude() ? SHOP : SHOP_BRIEF)[ctx.state.dev.level === 'new' ? 'new' : 'seasoned'] + '\n\n';

  // ---- WHAT THE TEAM NEEDS FROM THIS COMPUTER, ASKED FOR IN THE CHAT (Developer): a folder to work in, the website it made (served
  // here, with whether it still is), a phone to put an app on. Each is a message with something to press under it (m.setup), and
  // what is under it is kept true: a site that has stopped says so, a phone that is plugged in is seen (watchHost).
  const touch = (m, change) => {
    Object.assign(m.setup, change, { rev: (m.setup.rev || 0) + 1 });
    ctx.emit('chat');
  };

  const askFolder = (title) => {
    if (!ctx.state.dev || !ctx.state.dev.level)
      ctx.state.dev = {
        level: 'new',
        at: Date.now(),
        from: 'asked for something to be built, with nowhere to build it',
      };
    ctx.post(
      'overseer',
      (fresh()
        ? 'Before we build it, I need a folder on this computer to put it in. Press the button and choose one: an empty folder is fine, and you can make a new one in the window that opens. I will set it up, and then we carry on with "'
        : 'No workspace is connected. Choose a Git folder (a plain one is made a repository), or connect a repository on the Workspace page. Then I carry on with "') +
        String(title).slice(0, 90) +
        '".',
      { setup: { kind: 'folder', state: 'open', task: String(title).slice(0, 700), rev: 0 } },
    );
  };

  const phoneSays = (got) => {
    const list = (got && got.list) || [];
    const ready = list.find((p) => p.state === 'ready');
    const waiting = list.find((p) => p.state !== 'ready');
    if (!got || got.adb === false)
      return {
        state: 'no-tools',
        text: 'To put an app on an Android phone, this computer needs Android\'s own tools (the "platform tools"). They are not on it yet.',
        steps: [
          'Install Android Studio, or the Android platform tools on their own, from developer.android.com',
          'Then press Check again',
        ],
        serial: '',
        name: '',
        built: false,
      };
    if (ready)
      return {
        state: 'ready',
        text:
          ready.name +
          ' is connected and ready' +
          (got.built
            ? ': the app the team built can go on it.'
            : '. Once the team has built the app, it can go on it from here.'),
        steps: [],
        serial: ready.serial,
        name: ready.name,
        built: !!got.built,
      };
    if (waiting)
      return {
        state: 'waiting',
        text: waiting.name + ' is plugged in, but it has not accepted this computer yet.',
        steps: [waiting.says || 'Unlock the phone and tap Allow on "Allow USB debugging?"', 'Then press Check again'],
        serial: '',
        name: waiting.name,
        built: !!got.built,
      };
    return {
      state: 'none',
      text: fresh()
        ? 'No phone is connected. To put the app on your own Android phone, switch on its developer options once:'
        : 'No device is connected. Enable USB debugging and plug it in:',
      steps: [
        'On the phone, open Settings, then About phone, and tap "Build number" seven times',
        'Go back to Settings, open System, then Developer options, and switch on "USB debugging"',
        'Plug the phone into this computer with a USB cable, unlock it, and tap Allow',
        'Then press Check again',
      ],
      serial: '',
      name: '',
      built: !!got.built,
    };
  };

  let hostTimer = null;

  const hostCards = () =>
    ctx.state.chat
      .filter(
        (m) => m.setup && (m.setup.kind === 'site' || m.setup.kind === 'phone') && Date.now() - m.at < 3 * 3600000,
      )
      .slice(-4);

  const watchOnce = async () => {
    const cards = hostCards();
    if (!cards.length || !ctx.engine || !ctx.engine.host) return false;
    try {
      if (cards.some((m) => m.setup.kind === 'site')) {
        const { sites = [] } = await ctx.engine.host.sites();
        for (const m of cards.filter((x) => x.setup.kind === 'site')) {
          const now = sites.find((x) => x.id === m.setup.id);
          const siteState = now && now.online ? 'online' : 'stopped';
          const why = now && !now.online ? now.why || '' : now ? '' : m.setup.why || 'the team was stopped';
          if (siteState !== m.setup.state) touch(m, { state: siteState, why });
        }
      }
      const ph = cards.filter((m) => m.setup.kind === 'phone').pop();
      if (ph && !ph.setup.busy) {
        const v = phoneSays(await ctx.engine.host.devices());
        if (v.state !== ph.setup.state || v.built !== ph.setup.built || v.name !== ph.setup.name) touch(ph, v);
      }
    } catch {
      /* the runner is not answering: left as it was */
    }
    return true;
  };

  const watchHost = () => {
    if (hostTimer || !ctx.engine || !ctx.engine.host || typeof setInterval !== 'function' || !hostCards().length)
      return;
    hostTimer = setInterval(async () => {
      if (!(await watchOnce())) {
        clearInterval(hostTimer);
        hostTimer = null;
      }
    }, 5000);
    if (hostTimer.unref) hostTimer.unref();
  };

  // after a change has been made: if there is a page to open it is served and its address given; if it is an Android app, the phone
  async function afterBuild(title, built) {
    if (!built || !ctx.engine || !ctx.engine.host || isSimple()) return;
    try {
      const got = await ctx.engine.host.siteStart();
      if (got && got.ok && got.site) {
        const old = ctx.state.chat.find(
          (m) => m.setup && m.setup.kind === 'site' && m.setup.id === got.site.id && m.setup.state === 'online',
        );
        if (old) ctx.post('ask', 'The page at ' + got.site.url + ' shows the change now: reload it.');
        else
          ctx.post(
            'ask',
            (fresh()
              ? 'It is running on this computer now, so you can look at it: press Open. Only this computer can see it. '
              : 'Serving it on this machine. ') +
              'It stays up while the team is running; if it stops, this message says so.',
            {
              setup: {
                kind: 'site',
                state: 'online',
                id: got.site.id,
                url: got.site.url,
                name: got.site.name,
                why: '',
                rev: 0,
              },
            },
          );
      }
    } catch {
      /* no page to serve: nothing is said */
    }
    let ws = null;
    try {
      ws = await ctx.engine.work.state();
    } catch {
      ws = null;
    }
    if (
      /\b(android|apk|phone app|mobile app|play store)\b/i.test(String(title)) ||
      (ws && ws.skills && /kotlin|dart|android|flutter/i.test(JSON.stringify(ws.skills).slice(0, 4000)))
    ) {
      let got = null;
      try {
        got = await ctx.engine.host.devices();
      } catch {
        got = null;
      }
      const v = phoneSays(got);
      const old = [...ctx.state.chat]
        .reverse()
        .find((m) => m.setup && m.setup.kind === 'phone' && Date.now() - m.at < 10 * 60000);
      if (old) touch(old, v);
      else
        ctx.post('operations', fresh() ? 'About getting it onto a phone:' : 'Android device:', {
          setup: { kind: 'phone', rev: 0, note: '', ...v },
        });
    }
    watchHost();
  }

  Object.assign(ctx, { devNote, askFolder, afterBuild, watchHost, sizeUp, touch, phoneSays, watchOnce });
}
