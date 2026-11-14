// skills.mjs - WHAT THE TEAM KNOWS ABOUT THE LANGUAGE IT IS WORKING IN. A seat is given the part of this that is its own job, for the languages
// the workspace is actually written in, and nothing else: a local model holds 16,000 tokens, so a seat is not handed a textbook.
//
//   find   where things live and how to search for them        Overseer plans from it; whoever looks uses it
//   build  what a good change looks like in this language       Operations
//   prove  how a change is tested here                          Steward
//   show   what matters on a screen                             Ask (the seat that looks)
//   land   how a change is named and put into source control    Master
//
// Every line is a rule that a reviewer in that language would enforce, written to be acted on. Lines that only describe are left out.
// Adding a language: its marks in MARKS, its five parts here, and scenarios for it under training/scenarios/.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

export const SKILLS = {
  python: {
    name: 'Python',
    find: 'Search for "def name" or "NAME =" to find where a thing is defined, and for its name alone to find where it is used. "from pkg.mod import x" is the file pkg/mod.py. Tests are test_*.py, beside the code or under tests/.',
    build:
      'Keep a function\'s name, arguments and docstring unless the task changes them. Prefer the standard library to a new package. Money is whole cents, never a float. Use "is None" for None, and never a list or dict as a default argument. Handle the empty case and the missing key. Never catch an error just to hide it.',
    prove:
      'Use the runner the project uses (pytest or unittest). One behaviour to a test, named for what it proves. Expected values are worked out from the task, never copied from what the code returns. No network, no sleeping, no real clock: pass the time in.',
    show: 'Text a person reads is checked exactly, with its spacing and its two decimals.',
    land: 'A change that adds a package says so and names the version.',
  },
  javascript: {
    name: 'JavaScript',
    find: 'Search for "export function name", "const NAME" or the import path. "import { x } from \'./a/b.mjs\'" is the file a/b.mjs. The "scripts" in package.json say how tests run; tests are *.test.* or under test/.',
    build:
      'Keep the module style the project uses (import or require) and never mix them. const by default, === always. Every promise is awaited or returned; a caught error is handled or thrown again, never swallowed. Do not change what was passed in: copy it first. Use ?? for a missing value so that 0 and an empty string are kept.',
    prove:
      "Use the project's runner (node:test, Jest or Vitest). An async test awaits; a failure is checked with assert.rejects or expect(...).rejects. Arrays and objects are compared with deepEqual. No real timers, no network.",
    show: 'In a page, find the element by its role or its text, not by a class that may change.',
    land: 'A change to package.json comes with its lock file.',
  },
  typescript: {
    name: 'TypeScript',
    find: 'Search for "export function name", "export const NAME", "interface Name" or "type Name". tsconfig.json says where the source is; types often sit in *.d.ts or a types/ folder.',
    build:
      'No "any" and no "as" to silence the compiler: fix the type. Narrow unknown values before using them. Model a state as a union of shapes, not as optional fields. Every promise is awaited or returned. Keep exported types as they are unless the task changes them.',
    prove:
      "Use the project's runner (Vitest, Jest or node:test). The test file is TypeScript too and must type-check. deepEqual or toEqual for objects. No real timers, no network.",
    show: 'In a page, find the element by its role or its text.',
    land: 'A change to package.json comes with its lock file.',
  },
  kotlin: {
    name: 'Kotlin and Android (Jetpack Compose)',
    find: 'Code is under app/src/main/java or kotlin, by package. A screen is a @Composable function, an Activity or a Fragment. Words on the screen are in res/values/strings.xml: search there for the text a ticket quotes, then for R.string.<its name> to find the screen. Sizes are Dp values in the composable or in dimens.xml. What a screen shows comes from a ViewModel.',
    build:
      'val, not var. Null is handled with ?. and ?:, never with !!. State is a data class. A when over a sealed type covers every case. In Compose: a composable takes its state in and sends events out through a lambda (state is hoisted); remember or rememberSaveable for state that is its own; Modifier is a parameter and goes to the root; sizes in dp and text in sp; words come from stringResource, never a literal; nothing slow happens in composition, it belongs in a ViewModel that exposes a StateFlow read with collectAsStateWithLifecycle. Coroutines run in viewModelScope, never GlobalScope, and blocking work goes in withContext(Dispatchers.IO). A size that must follow the screen is said with modifiers: padding(horizontal = 16.dp) for a margin, widthIn(max = 400.dp) for a cap, fillMaxWidth() to take what is left; BoxWithConstraints gives maxWidth when a number is needed.',
    prove:
      'JUnit4. Logic is tested with plain JUnit; a screen with Robolectric and createComposeRule (onNodeWithText, onNodeWithTag, assertIsDisplayed, performClick), with no device. Coroutines are tested with runTest. The network is a fake the test supplies.',
    show: 'A touch target is at least 48 dp. Text scales with the system font size, so a row must grow rather than cut it off. Every icon button has a contentDescription. Check a small phone (360 dp wide) and a large font.',
    land: 'A new dependency goes in the version catalog (gradle/libs.versions.toml) when the project has one.',
  },
  swift: {
    name: 'Swift (SwiftUI)',
    find: 'In a package the code is under Sources/<Module>/ and the tests under Tests/. A screen is "struct Name: View". Words on the screen may be in Localizable.strings or a .xcstrings file: search for the text a ticket quotes, then for the view that shows it.',
    build:
      "let, not var. An optional is unwrapped with if let or guard let, never forced with !. Use a struct unless identity is needed, and an enum with associated values instead of flags. An error is thrown or handled, never dropped with try?. In SwiftUI a view is a function of its state: @State for its own, @Binding for a parent's, an @Observable model for shared; nothing slow in body, async work in .task. Use async and await, and @MainActor for what the screen shows. Money is Decimal or whole cents, never Double. A width that must follow the screen: .frame(maxWidth: 400) for a cap and .padding(.horizontal, 16) for a margin.",
    prove:
      'XCTest: one XCTestCase, each method named testWhatItProves, with @testable import of the module. XCTAssertEqual with exact values. An async test is "func testX() async throws". No network, no sleeping.',
    show: 'A touch target is at least 44 points. Text must grow with Dynamic Type, so nothing has a fixed height that cuts it off. Every control has an accessibility label. Check the smallest phone and the largest text size.',
    land: 'A new package is added in Package.swift with a version range, and Package.resolved is committed with it.',
  },
  dart: {
    name: 'Dart and Flutter',
    find: 'The code is under lib/, the tests under test/ with the same names, and pubspec.yaml lists the packages. A screen is a class that extends StatelessWidget or StatefulWidget. Search for the text a ticket quotes, then for the widget whose build method shows it.',
    build:
      'final by default, and const constructors and const widgets wherever they are possible. Null safety is sound: no ! unless the line above proves it. A widget is small and its build method is pure: nothing slow and nothing async in build. State lives in a State object, a ChangeNotifier or the state management the project already uses, never in a global. Controllers are disposed. Items in a list have keys. A size comes from the layout (LayoutBuilder, MediaQuery, Flexible), not from a fixed number. After an await, check mounted before using the context. A width that must follow the screen: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 400)) for a cap, Padding(padding: const EdgeInsets.symmetric(horizontal: 16)) for a margin, MediaQuery.sizeOf(context).width when a number is needed.',
    prove:
      'flutter_test: testWidgets with pumpWidget, then find.text or find.byKey and expect(finder, findsOneWidget). pump() after a tap, pumpAndSettle() after an animation. Logic is tested with plain test(). The network is a fake the test supplies.',
    show: 'A touch target is at least 48 logical pixels. Text scales with the system setting, so a row must wrap or grow. Check a narrow phone (360 wide) and a large text scale. Every icon button has a tooltip or a semantic label.',
    land: 'A new package goes in pubspec.yaml with a version range, and pubspec.lock is committed for an app.',
  },
};
// how a change is named and landed, whatever the language
const LAND =
  'A branch is named for its kind and its ticket: feature/KEY-what-it-does, bugfix/KEY-what-it-fixes. One change to a branch. A commit message says what changed and why, in the present tense, with the ticket key. Build output and secrets are never committed. Work on a shared branch (main, master, develop) goes through a branch of its own.';

// which languages a folder is written in, most used first: by the project files that name them, then by what the files are
const MARKS = [
  ['kotlin', /(^|\/)(build\.gradle(\.kts)?|settings\.gradle(\.kts)?|AndroidManifest\.xml)$|\.kt$/],
  ['swift', /(^|\/)Package\.swift$|\.swift$|\.xcodeproj\//],
  ['dart', /(^|\/)pubspec\.yaml$|\.dart$/],
  ['typescript', /(^|\/)tsconfig\.json$|\.tsx?$/],
  ['javascript', /(^|\/)package\.json$|\.(mjs|cjs|jsx?)$/],
  ['python', /(^|\/)(pyproject\.toml|setup\.py|requirements\.txt)$|\.py$/],
];
const SKIP = new Set([
  'node_modules',
  '.git',
  'build',
  'dist',
  '.dart_tool',
  '.gradle',
  'Pods',
  '.build',
  '.venv',
  'venv',
  '__pycache__',
  '.idea',
  'DerivedData',
]);
export async function langsOf(dir, most = 2) {
  const count = new Map();
  let seen = 0;
  const walk = async (d, rel, depth) => {
    if (depth > 6 || seen > 4000) return;
    let list = [];
    try {
      list = await readdir(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of list) {
      if (SKIP.has(e.name) || (e.name.startsWith('.') && e.name !== '.')) continue;
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) await walk(path.join(d, e.name), r, depth + 1);
      else {
        seen++;
        for (const [lang, re] of MARKS)
          if (re.test(r)) {
            count.set(lang, (count.get(lang) || 0) + 1);
            break;
          }
      }
    }
  };
  await walk(dir, '', 0);
  // a Python project that keeps a package.json for its tools is a Python project: a language with one file is not counted beside one with many
  const all = [...count.entries()].sort((a, b) => b[1] - a[1]);
  const top = all.length ? all[0][1] : 0;
  return all
    .filter(([, n]) => n >= Math.max(1, top / 8))
    .slice(0, most)
    .map(([lang]) => lang);
}
// the part of what is known that one job needs, for these languages, as lines for a prompt ('' when nothing is known)
export function skillFor(role, langs) {
  const parts = (langs || [])
    .filter((l) => SKILLS[l] && SKILLS[l][role])
    .map((l) => SKILLS[l].name + ': ' + SKILLS[l][role] + (role === 'land' ? '' : ''));
  if (role === 'land') parts.unshift(LAND);
  if (role === 'prove' && parts.length)
    return (
      'How a good tester works here (habits to keep while writing the tests, never things to write a test about):\n' +
      parts.map((p) => '- ' + p).join('\n')
    );
  return parts.length
    ? 'What a ' +
        ({
          find: 'careful reader',
          build: 'good engineer',
          prove: 'good tester',
          show: 'careful designer',
          land: 'good maintainer',
        }[role] || 'good engineer') +
        ' does here:\n' +
        parts.map((p) => '- ' + p).join('\n')
    : '';
}
// what each seat is given for a workspace: the seat's own part
export const SEAT_ROLE = { overseer: 'find', operations: 'build', steward: 'prove', ask: 'show', master: 'land' };
export const seatSkills = (langs) =>
  Object.fromEntries(Object.entries(SEAT_ROLE).map(([seat, role]) => [seat, skillFor(role, langs)]));
// a project's own instruction file wins over all of this: it is the customer's word on how their code is written
export async function ownRules(dir) {
  for (const f of ['AGENTS.md', 'CLAUDE.md', 'CONTRIBUTING.md']) {
    try {
      const t = await readFile(path.join(dir, f), 'utf8');
      if (t.trim()) return { file: f, text: t.slice(0, 4000) };
    } catch {
      /* not there */
    }
  }
  return null;
}
