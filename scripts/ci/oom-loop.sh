#!/usr/bin/env bash
# Runs each OOM test 100 times alone, then 200 times as 4 parallel loops of 50
# beside 2 busy loops, first with the 200 ms sample tick and then with a 10 ms
# one. With "before", it first puts back the samplers that wrote to stderr.
set -uo pipefail

side=$1
diet_test=(packages/diet/diet.test.ts 'it fails a command that allocates more than its budget')
capped_test=(sync/pre-push/run-memory-capped.test.ts 'it fails a run over its cap with sudo systemd-run')

if [ "$side" = before ]; then
  git show b0f498d^:packages/diet/diet.sh > packages/diet/diet.sh
  git show 3454f14:sync/pre-push/run-memory-capped.sh > sync/pre-push/run-memory-capped.sh
fi

loop_test() {
  local runs=$1 file=$2 name=$3 fails=0 out
  for _ in $(seq "$runs"); do
    out=$(bun test "$file" -t "$name" 2>&1)
    if ! grep -q '^ 1 pass$' <<< "$out" || ! grep -q '^ 0 fail$' <<< "$out"; then
      fails=$((fails + 1))
      [ "$fails" -gt 1 ] || grep -A8 'toStrictEqual(expected)' <<< "$out"
    fi
  done
  echo "$side $file: $fails of $runs runs failed"
}

loop_test_under_load() {
  local hogs=() workers=() worker
  for _ in 1 2; do
    (while :; do :; done) &
    hogs+=("$!")
  done
  for worker in 1 2 3 4; do
    loop_test 50 "$@" > "$RUNNER_TEMP/fails-$worker" &
    workers+=("$!")
  done
  wait "${workers[@]}"
  kill "${hogs[@]}"
  echo "under load, $tick tick:"
  cat "$RUNNER_TEMP"/fails-*
}

tick='200 ms'
loop_test 100 "${diet_test[@]}"
loop_test 100 "${capped_test[@]}"
loop_test_under_load "${diet_test[@]}"
loop_test_under_load "${capped_test[@]}"

tick='10 ms'
sed -i 's/read -rt 0.2 -u/read -rt 0.01 -u/' packages/diet/diet.sh sync/pre-push/run-memory-capped.sh
loop_test_under_load "${diet_test[@]}"
loop_test_under_load "${capped_test[@]}"
