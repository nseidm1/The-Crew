// trained.js - WHAT TRAINING HAS SHOWN OF EACH LOCAL MODEL. Written by training/publish.mjs from the trainers' own result files;
// not edited by hand. For each model: the day of its newest result, the machine, and for each kind of measurement how many it
// got right of how many (tickets also count a change passed as proven that was wrong). A model that is not here has not been
// trained, and the model page says so.
export const TRAINED = {
  'nemotron35-30b': {
    at: '2026-11-15',
    machine: 'Apple M2 Ultra, 64 GB',
    kinds: 6,
    answers: {
      good: 22,
      of: 24,
    },
    manners: {
      good: 75,
      of: 75,
    },
    voices: {
      good: 11,
      of: 13,
    },
    memory: {
      good: 30,
      of: 32,
    },
    requests: {
      good: 14,
      of: 17,
    },
    tickets: {
      good: 3,
      of: 17,
      falseGreen: 2,
    },
  },
  'llama-bonsai2-27b': {
    at: '2026-11-15',
    machine: 'Apple M2 Ultra, 64 GB',
    kinds: 5,
    answers: {
      good: 23,
      of: 24,
    },
    manners: {
      good: 75,
      of: 75,
    },
    voices: {
      good: 14,
      of: 14,
    },
    memory: {
      good: 30,
      of: 32,
    },
    tickets: {
      good: 7,
      of: 8,
      falseGreen: 0,
    },
  },
};
