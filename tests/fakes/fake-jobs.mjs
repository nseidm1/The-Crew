// fake-jobs.mjs - what a competent agent would do for the agent check's OTHER jobs: the Simple set (answer, research, say so when the
// sources do not say, write a message, brief a picture or a video) and one job for each platform a developer codes against (Python,
// Android, Swift). Both test doubles (fake-pi.mjs, fake-claude.mjs) use it, so the two never drift apart. It is a TEST DOUBLE: it knows
// these jobs by their wording and has no judgement of its own.
//   solve(prompt)   does the work in the current folder and returns how many tools that took, or -1 when the prompt is none of these jobs
//   botch()         what getting one of these jobs wrong looks like: a file is written, under a name nobody asked for
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const put = (name, body) => {
  mkdirSync(path.dirname(path.resolve(name)), { recursive: true });
  writeFileSync(name, body);
};
const MEDIAN =
  'def median(xs):\n    s = sorted(xs)\n    n = len(s)\n    if n % 2:\n        return s[n // 2]\n    return (s[n // 2 - 1] + s[n // 2]) / 2\n';
// the first match wins. A step that only asks for notes comes first: the step after it names the job's own file as well.
const WAYS = [
  [
    /named notes\.txt/,
    () => {
      put(
        'notes.txt',
        'What this needs, in one sentence: read what is given, then write exactly the file that is asked for.\n',
      );
      return 2;
    },
  ],
  [
    /answer\.txt/,
    () => {
      put('answer.txt', 'A leap year has 366 days. The extra day is in February.\n');
      return 2;
    },
  ],
  [
    /findings\.txt/,
    () => {
      put('findings.txt', 'The Harbour Museum is open on Sundays from 10 am to 4 pm. That is from source-b.txt.\n');
      return 3;
    },
  ],
  [
    /price\.txt/,
    () => {
      put('price.txt', 'not stated\n');
      return 3;
    },
  ],
  [
    /reply\.txt/,
    () => {
      put(
        'reply.txt',
        'Hello, I am sorry, but I cannot make our meeting on Thursday at 3 pm. Could we move it to another time that suits you? Thank you.\n',
      );
      return 2;
    },
  ],
  [
    /picture\.txt/,
    () => {
      put('picture.txt', 'A red bicycle leaning against a blue door, in soft early morning light.\n');
      return 2;
    },
  ],
  [
    /video\.txt/,
    () => {
      put('video.txt', 'Waves rolling in on a sandy beach at sunset, foam sliding up the shore and back.\n');
      return 2;
    },
  ],
  [
    /stats\.py/,
    () => {
      put('stats.py', MEDIAN);
      return 3;
    },
  ],
  [
    /strings\.xml/,
    () => {
      put(
        'res/values/strings.xml',
        readFileSync('res/values/strings.xml', 'utf8').replace(
          '</resources>',
          '    <string name="pay_button">Pay now</string>\n</resources>',
        ),
      );
      put(
        'res/layout/checkout.xml',
        readFileSync('res/layout/checkout.xml', 'utf8').replace(
          'android:text="Pay now"',
          'android:text="@string/pay_button"',
        ),
      );
      return 4;
    },
  ],
  [
    /Greeting\.swift/,
    () => {
      put('Greeting.swift', 'func greeting(name: String) -> String {\n    return "Hello, \\(name)!"\n}\n');
      return 3;
    },
  ],
];
export const JOB_IDS = [
  'answer',
  'research',
  'not-there',
  'message',
  'picture-brief',
  'video-brief',
  'python-fix',
  'android-strings',
  'swift-fix',
];
export function solve(prompt) {
  const w = WAYS.find(([re]) => re.test(prompt));
  return w ? w[1]() : -1;
}
export function botch() {
  put('out.txt', 'I think that is right.\n');
  return 1;
}
