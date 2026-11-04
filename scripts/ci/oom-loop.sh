#!/usr/bin/env bash
# Runs each OOM test 100 times, then counts the runs of each script, of 500,
# whose stderr holds a sampler error, first alone and then as 4 parallel
# loops beside 2 busy loops, with the 200 ms sample tick and with a 10 ms
# one. With "before", it first puts back the samplers that wrote to stderr.
set -uo pipefail

side=$1

if [ "$side" = before ]; then
  git show b0f498d^:packages/diet/diet.sh > packages/diet/diet.sh
  git show 3454f14:sync/pre-push/run-memory-capped.sh > sync/pre-push/run-memory-capped.sh
fi

loop_test() {
  local file=$1 name=$2 fails=0 run out
  for run in $(seq 100); do
    out=$(bun test "$file" -t "$name" 2>&1)
    if ! grep -q '^ 1 pass$' <<< "$out" || ! grep -q '^ 0 fail$' <<< "$out"; then
      fails=$((fails + 1))
      echo "::group::$side $file run $run failed"
      echo "$out"
      echo '::endgroup::'
    fi
  done
  echo "$side $file: $fails of 100 runs failed"
}

count_leaks() {
  local runs=$1 script=$2 leaks=0 err
  shift 2
  for _ in $(seq "$runs"); do
    err=$(bash "$script" "$@" bun -e 'Buffer.alloc(128 * 1024 * 1024, 1)' 2>&1 > /dev/null)
    if grep -q 'Cannot allocate memory' <<< "$err"; then
      leaks=$((leaks + 1))
      [ "$leaks" -gt 1 ] || printf '%s\n' "$err"
    fi
  done
  echo "$side $script: $leaks of $runs runs printed a sampler error"
}

count_leaks_under_load() {
  local hogs=() workers=() worker
  for _ in 1 2; do
    (while :; do :; done) &
    hogs+=("$!")
  done
  for worker in 1 2 3 4; do
    count_leaks 250 "$@" > "$RUNNER_TEMP/leaks-$worker" &
    workers+=("$!")
  done
  wait "${workers[@]}"
  kill "${hogs[@]}"
  echo "under load:"
  cat "$RUNNER_TEMP"/leaks-*
}

loop_test packages/diet/diet.test.ts 'it fails a command that allocates more than its budget'
loop_test sync/pre-push/run-memory-capped.test.ts 'it fails a run over its cap with sudo systemd-run'
count_leaks 500 packages/diet/diet.sh --budget 64M --
count_leaks 500 sync/pre-push/run-memory-capped.sh 64

sed 's/read -rt 0.2 -u/read -rt 0.01 -u/' packages/diet/diet.sh > packages/diet/diet-fast-tick.sh
sed 's/read -rt 0.2 -u/read -rt 0.01 -u/' sync/pre-push/run-memory-capped.sh > sync/pre-push/run-memory-capped-fast-tick.sh
for script in packages/diet/diet.sh packages/diet/diet-fast-tick.sh; do
  count_leaks_under_load "$script" --budget 64M --
done
for script in sync/pre-push/run-memory-capped.sh sync/pre-push/run-memory-capped-fast-tick.sh; do
  count_leaks_under_load "$script" 64
done
