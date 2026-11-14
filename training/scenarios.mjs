// scenarios.mjs - WHAT THE TEAM IS TRAINED AND MEASURED ON, in Developer mode. Each scenario is a small repository, a ticket written the way a
// real one is, and an ORACLE: a check the team never sees, written from the ticket alone. The team's own proof says "proven"; the oracle says
// whether that was true. The two can disagree, and the disagreements are the point: a proof that is green over wrong code is the failure a
// customer cannot see.
//
//   lang     python | javascript | typescript | swift | kotlin | dart   which file under scenarios/ it lives in (harder.mjs holds some of each)
//   kind     fix      something is wrong                         the team changes code and proves it
//            enhance  something new is wanted, the old kept      the same
//            improve  the same result, done better               the same, and the oracle measures the "better" (time, usually)
//            find     a question about the code, no change       the team looks and answers; the oracle is what the answer must name
//   files    the repository as the customer has it (the oracle must FAIL on it)
//   ticket   what the ticket says, in the board's own words and marks
//   oracle   { type, text }: the hidden check, run against the team's change with the team's own proof left out
//              unittest  Python's own, with the copy on its path        node  Node's own test runner; "@repo/" is the copy
//              swift     an XCTest file put into the package's tests    gradle  a JUnit file put into the module's tests
//              flutter   a flutter_test file put under test/
//            a type whose tool is not on this machine is SKIPPED and said so: it is never counted as passed or failed
//   fix      a reference change the oracle must PASS on, so a scenario that cannot be passed is caught before a model is blamed for it
//   find     (kind find) { names: [what the answer must name, exactly], value: [any one of these must be in it] }
//
// Adding one: give it all the parts, then run   node training/train.mjs --check   which refuses a scenario whose oracle is not red on
// files and green on fix.
import { PYTHON } from './scenarios/python.mjs';
import { JAVASCRIPT } from './scenarios/javascript.mjs';
import { SWIFT } from './scenarios/swift.mjs';
import { DART } from './scenarios/dart.mjs';
import { KOTLIN } from './scenarios/kotlin.mjs';
import { TYPESCRIPT } from './scenarios/typescript.mjs';
import { HARDER } from './scenarios/harder.mjs';

export const SCENARIOS = [...PYTHON, ...JAVASCRIPT, ...TYPESCRIPT, ...KOTLIN, ...SWIFT, ...DART, ...HARDER];

// the request as the chat sends it when a ticket is discussed: what the customer typed, then the ticket behind it
export const taskOf = (s) =>
  (s.kind === 'find' ? s.title + ' ' : 'Address ' + s.key + ': ' + s.title + ' ') +
  'It is about the ticket ' +
  s.key +
  ': ' +
  s.title +
  '. What the ticket says' +
  (s.kind === 'find' ? ': ' : ' it must do: ') +
  s.ticket;
