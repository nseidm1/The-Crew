#!/usr/bin/env node
// fake-open.mjs - a TEST DOUBLE for the command that opens a page in the browser: it only writes down what it was asked to open.
import { appendFileSync } from 'node:fs';
if (process.env.FO_FAKE_OPEN_LOG) appendFileSync(process.env.FO_FAKE_OPEN_LOG, process.argv[2] + '\n');
