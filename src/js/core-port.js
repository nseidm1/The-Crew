// core-port.js - THE ONE DOOR between the pages and the team's core.
//
// No page builds a core for itself: each asks for one here. Today the port hands back the core that runs in the page
// (team-core.js). A core that ran somewhere else, behind a service, would be one adapter written behind this function, and no
// page would change.
//
// A core is an object with:
//   snapshot()                      the whole customer-visible state, synchronously (a plain object, safe to read)
//   on(fn) -> off()                 fn(type) after every change; pages re-render from snapshot()
//   adopt(session) / stop()         the session: Start hands over what the local runner set up (runner-client.js), stop ends it
//   request(text, opts)             the customer asks the team for something; the team plans, judges, builds, proves, lands
//   say(text)                       a chat message that is not a work request
//   answerProposal(id, yes)         the customer approves or declines something the team proposed
//   setAutonomy(level)              1 ask first, 2 land on green, 3 improve itself
//   linkWorkspace({ kind, name })   'github' or 'local'
//   setContribute(bool)             whether this team's lessons flow to the core
//   ask(question)                   Vision: what this team's soul holds on a question, ranked, with where each item came from
//   setPlan({ mode, period })
import { createTeamCore } from './team-core.js';

export const PORT_VERSION = '0.1';

export function connect(opts = {}) {
  return createTeamCore(opts);
}
