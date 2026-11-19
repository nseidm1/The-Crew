// ports.mjs - A CHECK'S PORTS ARE ITS OWN. Each check that starts servers names its ports as it always did (5279, 47898 ...), and
// adds SHIFT to every one of them. Run alone, SHIFT is 0 and the ports are the ones written. Run by tests/run.mjs beside other
// checks, each is given a SHIFT of its own (FO_TEST_SHIFT), so that two checks that name the same port never meet on it.
// The runner's self-test is the one check that is never shifted: its many ports are written into what it expects, so the others
// are moved clear of it instead (tests/run.mjs).
export const SHIFT = Number(process.env.FO_TEST_SHIFT) || 0;
