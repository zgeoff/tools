#!/usr/bin/env bash
# Builds one small git repo per skills-folder layout under <work-dir>, then asks Claude Code and
# Codex which probe skills each sees. Prints one line per layout and agent: the skill names the
# agent listed, or NONE.
# Usage: probe.sh <work-dir>   (the folder must not exist yet)
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "usage: probe.sh <work-dir>" >&2
  exit 2
fi

work=$1

if [ -e "$work" ]; then
  echo "probe: $work exists; name a new folder" >&2
  exit 2
fi

question="Do not use any tool or run any command. From the list of skills available to you in this session, print every skill name that starts with 'probe-', one per line, or print NONE."

write_skill() {
  mkdir -p "$1/$2"
  printf -- '---\nname: %s\ndescription: Probe skill %s.\n---\n\nThe probe word is %s-ok.\n' \
    "$2" "$2" "$2" > "$1/$2/SKILL.md"
}

make_layout() {
  local repo=$work/$1
  mkdir -p "$repo/.claude" "$repo/.agents"
  git -C "$repo" init -q
  case $1 in
    claude-only)
      write_skill "$repo/.claude/skills" probe-claude
      ;;
    agents-only)
      write_skill "$repo/.agents/skills" probe-agents
      ;;
    claude-links-folder)
      write_skill "$repo/.agents/skills" probe-folder
      ln -s ../.agents/skills "$repo/.claude/skills"
      ;;
    claude-links-each-skill)
      write_skill "$repo/.agents/skills" probe-each
      mkdir -p "$repo/.claude/skills"
      ln -s ../../.agents/skills/probe-each "$repo/.claude/skills/probe-each"
      ;;
    agents-links-folder)
      write_skill "$repo/.claude/skills" probe-reverse
      ln -s ../.claude/skills "$repo/.agents/skills"
      ;;
    agents-links-each-skill)
      write_skill "$repo/.claude/skills" probe-reverse-each
      mkdir -p "$repo/.agents/skills"
      ln -s ../../.claude/skills/probe-reverse-each "$repo/.agents/skills/probe-reverse-each"
      ;;
  esac
}

# Prints the probe names in the agent's answer, or NONE. An answer with no name is no failure.
pick_names() {
  { grep -o -E 'probe-[a-z-]+' || true; } | sort -u | paste -sd ' ' | sed 's/^$/NONE/'
}

layouts=(claude-only agents-only claude-links-folder claude-links-each-skill agents-links-folder
  agents-links-each-skill)

for layout in "${layouts[@]}"; do
  make_layout "$layout"
done

echo "claude $(claude --version)"
echo "codex $(codex --version)"

for layout in "${layouts[@]}"; do
  claude_names=$(cd "$work/$layout" && printf '%s' "$question" |
    timeout 300 claude -p --max-turns 1 2>&1 | pick_names)

  # codex exec echoes the prompt, which names no skill, then the answer.
  codex_names=$(cd "$work/$layout" && timeout 300 codex exec --sandbox read-only "$question" \
    2> /dev/null | pick_names)

  printf '%-24s claude: %-20s codex: %s\n' "$layout" "$claude_names" "$codex_names"
done
