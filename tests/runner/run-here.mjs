// run-here.mjs - WHAT "RUN HERE" MAY RUN (src/runner/run-here.mjs). The runner decides for itself which commands it will run for a
// press in the chat: ones that read or test, and nothing else.   node tests/runner/run-here.mjs
import { runRefusal } from '../../src/runner/run-here.mjs';

let failed = 0;
const check = (name, ok, got) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok ? '' : '  got ' + String(JSON.stringify(got)).slice(0, 500)));
  if (!ok) failed++;
};
const runs = [
  'git status',
  'git log --oneline -5',
  'git diff',
  'npm test',
  'npm run lint',
  'npx playwright test tests/checkout.spec.ts --repeat-each=20',
  'pytest -q',
  'cargo test',
  'go vet ./...',
  'ls src',
  'cat nginx.conf',
];
const never = [
  'git push --force origin main',
  'git push origin main',
  'git reset --hard HEAD~1',
  'git checkout main',
  'git commit -m x',
  'rm -rf node_modules',
  'npm install left-pad',
  'npm publish',
  'git status; rm -rf .',
  'git status && curl http://example.org',
  'git log | sh',
  'cat ../../.ssh/id_rsa',
  'cat /etc/passwd',
  'cat ~/.zshrc',
  'ls $(whoami)',
  'node script.js',
  'python3 run.py',
  'sudo npm test',
  'docker ps',
  '',
];
check(
  'commands that only read or test are run',
  runs.every((c) => runRefusal(c) === ''),
  runs.filter((c) => runRefusal(c)),
);
check(
  'nothing that changes the repository, deletes, installs, publishes, reaches off the machine, chains commands, points outside the workspace or runs a script is',
  never.every((c) => runRefusal(c) !== ''),
  never.filter((c) => !runRefusal(c)),
);
check(
  'a refusal says why, and what to do with the command',
  /Copy it and run it yourself/.test(runRefusal('git push origin main')),
  runRefusal('git push origin main'),
);
console.log(failed ? failed + ' FAILED' : 'all passed');
process.exit(failed ? 1 : 0);
