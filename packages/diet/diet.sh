#!/usr/bin/env bash
set -euo pipefail

modes=(systemd-sudo systemd-user cgroupfs)

usage() {
  echo 'usage: diet [--budget <size>] -- <command> [args...]' >&2
  echo '       diet --modes' >&2
  exit 2
}

has_systemd() {
  [ -d /run/systemd/system ] && command -v systemd-run > /dev/null
}

probe_mode() {
  case "$1" in
    systemd-sudo) has_systemd && sudo -n true 2> /dev/null ;;
    systemd-user)
      has_systemd || return 1
      local group
      group=$(systemctl --user show --property=ControlGroup --value 2> /dev/null) || return 1
      # A user manager without the memory controller delegated to it runs a
      # scope that ignores MemoryMax.
      [ -n "$group" ] && grep -qw memory "/sys/fs/cgroup$group/cgroup.controllers" 2> /dev/null
      ;;
    cgroupfs) find_cgroupfs_parent > /dev/null ;;
    *) return 1 ;;
  esac
}

# cgroup v2 lets a cgroup other than the root hold processes or enable a
# controller for its children, never both, so the capped cgroup is a sibling
# of this process's own one.
find_cgroupfs_parent() {
  [ -f /sys/fs/cgroup/cgroup.controllers ] || return 1
  local own parent
  own=$(sed -n 's/^0:://p' /proc/self/cgroup)
  parent=$(dirname "$own")
  parent="/sys/fs/cgroup${parent%/}"
  [ -w "$parent" ] && [ -w "$parent/cgroup.procs" ] || return 1
  grep -qw memory "$parent/cgroup.subtree_control" || return 1
  echo "$parent"
}

parse_size() {
  [[ "$1" =~ ^([1-9][0-9]{0,17})([KMG]?)$ ]] || return 1
  local count=${BASH_REMATCH[1]} power=0
  case "${BASH_REMATCH[2]}" in
    K) power=10 ;;
    M) power=20 ;;
    G) power=30 ;;
  esac
  # bash arithmetic wraps at 2^63, and a wrapped budget can come out as 0.
  [ "$count" -le $((9223372036854775807 >> power)) ] || return 1
  echo "$((count << power))"
}

read_default_budget() {
  local budget path cap
  budget=$(($(sed -n 's/^MemTotal: *\([0-9]*\) kB$/\1/p' /proc/meminfo) * 1024))
  path=$(sed -n 's/^0:://p' /proc/self/cgroup)
  while [ -n "$path" ]; do
    # The root cgroup has no memory.max, and a cgroup with no cap holds max.
    if [ -f "/sys/fs/cgroup${path%/}/memory.max" ]; then
      cap=$(< "/sys/fs/cgroup${path%/}/memory.max")
      if [ "$cap" != max ] && [ "$cap" -lt "$budget" ]; then
        budget=$cap
      fi
    fi
    if [ "$path" = / ]; then
      break
    fi
    path=$(dirname "$path")
  done
  echo "$budget"
}

format_size() {
  local bytes=$1 unit=B scale=1
  if [ "$bytes" -ge $((1 << 30)) ]; then
    unit=GB scale=$((1 << 30))
  elif [ "$bytes" -ge $((1 << 20)) ]; then
    unit=MB scale=$((1 << 20))
  elif [ "$bytes" -ge $((1 << 10)) ]; then
    unit=KB scale=$((1 << 10))
  fi
  # bytes * 10 wraps past 2^63 for a budget near the largest one diet takes.
  local whole=$((bytes / scale)) tenth=$((((bytes % scale) * 10 + scale / 2) / scale))
  if [ "$tenth" = 10 ]; then
    whole=$((whole + 1)) tenth=0
  fi
  if [ "$tenth" = 0 ]; then
    echo "$whole $unit"
  else
    echo "$whole.$tenth $unit"
  fi
}

forward_signal() {
  if [ -n "$command_pid" ]; then
    kill -s "$1" "$command_pid" 2> /dev/null || true
  else
    pending_signal=$1
  fi
}

run_and_report() {
  local cgroup=$1 user=$2
  shift 2

  # The OOM killer picks among every process in the cgroup, and a kill of this
  # shell or its sampler loses the report; a privileged shell takes itself out
  # of the choice, and the command takes the default back.
  local protected=false
  if echo -1000 2> /dev/null > /proc/self/oom_score_adj; then
    protected=true
  fi

  # memory.peak counts the page cache, which the kernel takes back under the
  # cap; the anonymous memory, sampled every 200 ms, is what it cannot. Under
  # the cap a fork can fail, so the sampler runs on builtins alone, with a
  # timed read of a pipe that never gets data in place of sleep.
  local sample_fd sampler
  exec {sample_fd}< <(
    set +e
    peak=0
    trap 'echo "$peak"; exit 0' TERM
    exec {tick_fd}<> <(:)
    echo ready
    while :; do
      while read -r key value; do
        if [ "$key" = anon ] && [ "$value" -gt "$peak" ]; then
          peak=$value
        fi
      done < "$cgroup/memory.stat"
      read -rt 0.2 -u "$tick_fd"
    done
  )
  sampler=$!
  read -r _ <&"$sample_fd"

  # A signal to this shell goes on to the command as the same signal, so the
  # report and the cleanup still run once the command ends. The traps go in
  # before the command starts, and a signal that comes first waits for it.
  command_pid=''
  pending_signal=''
  local signal
  for signal in TERM INT HUP; do
    # shellcheck disable=SC2064 # each trap holds its own signal's name
    trap "forward_signal $signal" "$signal"
  done
  (
    if [ "$protected" = true ]; then
      echo 0 > /proc/self/oom_score_adj
    fi
    if [ -n "$user" ]; then
      exec setpriv --reuid="$user" --regid="$(id -g "$user")" --init-groups -- "$@"
    fi
    exec "$@"
  ) <&0 &
  command_pid=$!
  if [ -n "$pending_signal" ]; then
    kill -s "$pending_signal" "$command_pid" 2> /dev/null || true
  fi
  # bash prints the whole source of a job that a signal kills on its own
  # stderr, which only a background job's wait can silence. The <&0 keeps
  # stdin, which bash points at /dev/null for a background job. A wait that
  # a signal cuts short runs again until the kernel reaps the command.
  while :; do
    status=0
    wait "$command_pid" 2> /dev/null || status=$?
    if ! kill -0 "$command_pid" 2> /dev/null; then
      break
    fi
  done
  trap - TERM INT HUP

  kill "$sampler"
  local anon_peak
  read -r anon_peak <&"$sample_fd" || anon_peak=0
  exec {sample_fd}<&-
  wait "$sampler" 2> /dev/null || true

  local budget oom_kills peak=$anon_peak
  budget=$(format_size "$(< "$cgroup/memory.max")")
  oom_kills=$(sed -n 's/^oom_kill //p' "$cgroup/memory.events")
  # A command the kernel kills can climb to the cap between two samples, and
  # memory.peak, which needs Linux 5.19, still holds that climb.
  if [ "$oom_kills" != 0 ] && [ -f "$cgroup/memory.peak" ]; then
    local cgroup_peak
    cgroup_peak=$(< "$cgroup/memory.peak")
    if [ "$cgroup_peak" -gt "$peak" ]; then
      peak=$cgroup_peak
    fi
  fi
  echo "diet: peaked at $(format_size "$peak") of $budget" >&2
  if [ "$oom_kills" != 0 ]; then
    local prefix=''
    if [ "${GITHUB_ACTIONS:-}" = true ]; then
      prefix='::error::'
    fi
    echo "${prefix}diet: the command went over its $budget budget, and the kernel OOM-killed $oom_kills process$([ "$oom_kills" = 1 ] || echo es)" >&2
    status=1
  fi
}

# Moves this shell back to its own cgroup, then removes the capped one, which
# the kernel refuses while it holds a process.
remove_cgroup() {
  echo "$$" > "$own/cgroup.procs"
  if ! rmdir "$cgroup" 2> /dev/null; then
    echo "diet: $cgroup still holds a process the command left running, so it stays" >&2
  fi
}

if [ "${1:-}" = --modes ] && [ "$#" = 1 ]; then
  for mode in "${modes[@]}"; do
    if probe_mode "$mode"; then
      echo "$mode"
    fi
  done
  exit 0
fi

# The second half of a systemd mode, which systemd-run starts inside the scope.
if [ "${1:-}" = --inside ]; then
  user=$2
  shift 2
  run_and_report "/sys/fs/cgroup$(sed -n 's/^0:://p' /proc/self/cgroup)" "$user" "$@"
  exit "$status"
fi

budget=''
if [ "${1:-}" = --budget ]; then
  if [ "$#" -lt 2 ] || ! budget=$(parse_size "$2"); then
    usage
  fi
  shift 2
fi
if [ "${1:-}" != -- ] || [ "$#" -lt 2 ]; then
  usage
fi
shift

mode=${DIET_MODE:-}
if [ -z "$mode" ]; then
  mode=none
  for candidate in "${modes[@]}"; do
    if probe_mode "$candidate"; then
      mode=$candidate
      break
    fi
  done
elif [ "$mode" != none ] && ! probe_mode "$mode"; then
  echo "diet: DIET_MODE is $mode, which this host does not support; it supports: $(bash "$0" --modes | tr '\n' ' ')none" >&2
  exit 2
fi

if [ "$mode" != none ] && [ -z "$budget" ]; then
  budget=$(read_default_budget)
fi

self=$(readlink -f "$0")
case "$mode" in
  # sudo keeps the environment, and PATH, which its secure_path resets;
  # OOMPolicy=continue keeps the scope, and its report, alive when the kernel
  # kills the command.
  systemd-sudo)
    exec sudo --preserve-env env "PATH=$PATH" systemd-run --scope --quiet --collect \
      --unit="diet-$$" \
      -p MemoryMax="$budget" -p MemorySwapMax=0 -p OOMPolicy=continue \
      -- bash "$self" --inside "$(id -un)" "$@"
    ;;
  systemd-user)
    exec systemd-run --user --scope --quiet --collect \
      --unit="diet-$$" \
      -p MemoryMax="$budget" -p MemorySwapMax=0 -p OOMPolicy=continue \
      -- bash "$self" --inside '' "$@"
    ;;
  cgroupfs)
    own="/sys/fs/cgroup$(sed -n 's/^0:://p' /proc/self/cgroup)"
    cgroup="$(find_cgroupfs_parent)/diet-$$"
    mkdir "$cgroup"
    trap remove_cgroup EXIT
    echo "$budget" > "$cgroup/memory.max"
    if [ -f "$cgroup/memory.swap.max" ]; then
      echo 0 > "$cgroup/memory.swap.max"
    fi
    echo "$$" > "$cgroup/cgroup.procs"
    run_and_report "$cgroup" '' "$@"
    exit "$status"
    ;;
  none)
    echo 'diet: this host has no systemd scope and no writable cgroup v2 parent for a memory cap, so the command runs uncapped' >&2
    exec "$@"
    ;;
  *)
    echo "diet: DIET_MODE is $mode; use one of: ${modes[*]} none" >&2
    exit 2
    ;;
esac
