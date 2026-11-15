#!/bin/bash
# local-session.sh - ONE TRAINING SESSION ACROSS THE LOCAL MODELS. The same measurements, one model after another, one trainer at a
# time (two at once would share the machine and spoil each other's speeds), each with its own log. A trainer that stops does not
# stop the session: its exit is written down and the next one runs.
#   bash training/local-session.sh                         the models named below
#   bash training/local-session.sh llama-bonsai2-9b        only these
#   TICKETS=all bash training/local-session.sh ...         every ticket, not the sample (hours for each model)
# Before it: node training/fetch-models.mjs   (the Bonsai 2 files, fetched once into .work/models)
# The models: Nemotron is the large one TensorFold runs here; what holds on it is taken to hold on the Qwen of its size, which is
# an assumption and not a measurement. Bonsai 2 is measured in all four sizes, largest first.
# Where it is run from: this repository's own folder. Node 22 and the Playwright the checks use must be on hand (FO_PLAYWRIGHT).
cd "$(dirname "$0")/.." || exit 1
MODELS=("$@")
[ ${#MODELS[@]} -gt 0 ] || MODELS=(nemotron35-30b llama-bonsai2-27b llama-bonsai2-9b llama-bonsai2-4b llama-bonsai2-2b)
# the tickets: a sample that needs only Node and Python on the machine, one of each kind of work; TICKETS=all runs every one
SAMPLE=pay-button,slug,py-ship-check,py-where-levy,js-basket,js-search,js-where-shipping,ts-coupon
OUT=.work/train/local; mkdir -p "$OUT"
NODE=${NODE:-node}
for M in "${MODELS[@]}"; do
  D="$OUT/$M"; mkdir -p "$D"; : > "$D/status.txt"
  S=(--setup "{\"model\":\"$M\"}")
  run() { # run <name> <script> [args...]
    local name=$1; shift
    local t0; t0=$(date +%s)
    echo "$(date +%H:%M:%S) START $name" >> "$D/status.txt"
    "$NODE" "$@" > "$D/$name.out" 2>&1
    echo "$(date +%H:%M:%S) END   $name exit $? $(( ($(date +%s) - t0) / 60 )) min" >> "$D/status.txt"
  }
  run 01-substance-simple training/substance.mjs --mode simple "${S[@]}"
  run 02-substance-dev    training/substance.mjs --mode developer "${S[@]}"
  run 03-manners-simple   training/manners.mjs --mode simple "${S[@]}"
  run 04-manners-dev      training/manners.mjs --mode developer "${S[@]}"
  run 05-voices           training/voices.mjs "${S[@]}"
  run 06-soul             training/soul.mjs "${S[@]}"
  run 07-knows            training/knows.mjs "${S[@]}"
  run 08-attached         training/attached.mjs "${S[@]}"
  if [ "${TICKETS:-sample}" = all ]; then run 09-train training/train.mjs --rounds 1 "${S[@]}"
  else run 09-train training/train.mjs --rounds 1 --only "$SAMPLE" "${S[@]}"; fi
  echo "$(date +%H:%M:%S) DONE" >> "$D/status.txt"
done
"$NODE" training/ratchet.mjs > "$OUT/ratchet.out" 2>&1
# what was measured goes where the app shows it (src/js/trained.js): the next bundle carries it
"$NODE" training/publish.mjs > "$OUT/publish.out" 2>&1
