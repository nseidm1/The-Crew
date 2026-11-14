#!/usr/bin/env node
// fake-gh.mjs - a TEST DOUBLE for GitHub's own command. Used when FO_BIN_GH points at it, or as the "gh" inside a stand-in release
// build (there it has no .mjs ending, so it is written to run either way: no import statements).
//   auth token             prints a made-up token when it is signed in. It is signed in unless FO_FAKE_GH_AUTH names a file: then
//                          only when that file exists. FO_FAKE_GH_TOKEN: the token it prints.
//   auth login ... --web   prints a one-time code and GitHub's address the way gh does when it is not in a terminal, waits for
//                          the file FO_FAKE_GH_APPROVE to appear (the customer approving on GitHub), then is signed in
//   --version              a version line
const a = process.argv.slice(2);
const auth = process.env.FO_FAKE_GH_AUTH || '';
const approve = process.env.FO_FAKE_GH_APPROVE || '';
import('node:fs').then((fs) => {
  if (a[0] === '--version') {
    console.log('gh version 2.103.3 (stand-in)');
    process.exit(0);
  }
  if (a[0] === 'auth' && a[1] === 'token') {
    if (auth && !fs.existsSync(auth)) {
      console.error('no oauth token found for github.com');
      process.exit(1);
    }
    console.log(process.env.FO_FAKE_GH_TOKEN || 'gho_standin_token_0123456789abcdef');
    process.exit(0);
  }
  if (a[0] === 'auth' && a[1] === 'login' && a.includes('--web')) {
    console.error(
      '\n! First copy your one-time code: AB12-CD34\nOpen this URL to continue in your web browser: https://github.com/login/device',
    );
    const t0 = Date.now();
    const tick = setInterval(() => {
      if (approve && fs.existsSync(approve)) {
        clearInterval(tick);
        if (auth) fs.writeFileSync(auth, 'signed in');
        console.error('✓ Authentication complete.');
        process.exit(0);
      }
      if (Date.now() - t0 > 20000) {
        clearInterval(tick);
        console.error('error: the code ran out before it was approved');
        process.exit(1);
      }
    }, 100);
    return;
  }
  process.exit(1);
});
