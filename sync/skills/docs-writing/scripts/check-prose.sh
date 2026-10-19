#!/usr/bin/env bash
# Greps committed docs for prose violations; exits non-zero when any are found.
# Violation greps fail the run; candidate greps print for judgment and never fail it.
# Usage (from the repo root): check-prose.sh <path>...
# The awk programs are single-quoted on purpose: awk, not the shell, expands their fields.
# shellcheck disable=SC2016
set -uo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: check-prose.sh <path>..." >&2
  exit 2
fi

# The paragraph limits in words. repo-sync overwrites this file, so a repo cannot loosen them.
paragraph_warn=150
paragraph_fail=250

# The skill's own files, the repo's project skill beside them, and the skill-writing skill document
# the forbidden patterns and contain them as examples. A file git marks linguist-vendored belongs to
# someone else, so a repo marks its third-party skills in .gitattributes.
set -- "$@" ':(exclude).claude/skills/docs-writing' ':(exclude).claude/skills/project-docs-writing' \
  ':(exclude)sync/skills/docs-writing' ':(exclude).claude/skills/skill-writing' \
  ':(exclude)sync/skills/skill-writing' ':(exclude,attr:linguist-vendored)' \
  ':(exclude,attr:linguist-vendored=true)'

# Every grep reads untracked files too, so a new doc is checked before it is staged, and skips
# binary files.
grep_docs() {
  git grep --untracked -I "$@"
}

list_markdown() {
  git -c core.quotePath=false ls-files --cached --others --exclude-standard -- "$@" | grep '\.md$'
}

# Tracks fenced code blocks (backtick or tilde, any indent, closed by the same marker at least as
# long) so the checks below can tell fence lines and fenced content from prose.
fence_awk='
function fence_marker(line, m) {
  if (match(line, /^[ \t]*(```+|~~~+)/)) {
    m = substr(line, RSTART, RLENGTH)
    sub(/^[ \t]*/, "", m)
    return m
  }
  return ""
}
function fence_rest(line, m) {
  return substr(line, index(line, m) + length(m))
}
function closes(m, rest) {
  return substr(m, 1, 1) == substr(open, 1, 1) && length(m) >= length(open) && rest ~ /^[ \t]*$/
}
FNR == 1 { open = "" }
'

fail=0

report() {
  local label=$1 out=$2
  if [ -n "$out" ]; then
    fail=1
    printf '%s\n%s\n\n' "$label" "$out"
  fi
}

candidate() {
  local label=$1 out=$2
  if [ -n "$out" ]; then
    printf '%s\n%s\n\n' "$label" "$out"
  fi
}

report 'Process residue (date stamps, investigation framing, memory citations, §):' \
  "$(grep_docs -nP 'Verified 20[0-9]{2}-|Investigation count|\(see memory |\([0-9]{2,4}-[0-9]{2}-[0-9]{2}\)|^Mitigation:|§' -- "$@")"

# The words every zgeoff repo bans; a repo's AGENTS.md lists them with their legal senses.
# Judgment-only bans (bites, floor, anchor) are not grepped. CAS stays case-sensitive so "CAs"
# passes.
# AGENTS.md and the agents/ partials hold the banned-words registry itself, and "code fence" is the
# legal markdown sense of the word.
report 'Banned words:' \
  "$(grep_docs -nPi '\bsurfaces?\b|load-bearing|\bseams?\b|\bceilings?\b|(?<!code )\bfenc(e|es|ed|ing)\b|(?-i:\bCAS\b)|significantly|near-instant' -- "$@" ':(exclude)AGENTS.md' ':(exclude)agents')"

report 'Filler with no term-of-art use:' \
  "$(grep_docs -nPi 'organically|earns its complexity|cheap insurance|lays (the )?foundation|the right level' -- "$@")"

report 'Possessive on a markdown link:' \
  "$(grep_docs -nE "\]\([^)]*\)'s" -- "$@")"

report 'Role-label headings:' \
  "$(grep_docs -nE '^#{2,4} (Overview|Notes|Details|Rationale)$' -- "$@")"

report '"Should succeed" in a procedure — state the expected outcome instead:' \
  "$(grep_docs -nPi 'should (succeed|work|pass)\b' -- "$@")"

report 'Number joined to its unit ("64KB"; write "64 KB"; code blocks are exempt):' \
  "$(
    grep_docs -nP '\b[0-9]+(KB|MB|GB|TB|KiB|MiB|GiB|ms)\b' -- "$@" ':(exclude)*.md'
    list_markdown "$@" | xargs -r awk "$fence_awk"'
    {
      m = fence_marker($0)
      if (m != "") {
        rest = fence_rest($0, m)
        if (open == "") open = m
        else if (closes(m, rest)) open = ""
        next
      }
      if (open == "" && $0 ~ /(^|[^[:alnum:]_])[0-9]+(KB|MB|GB|TB|KiB|MiB|GiB|ms)([^[:alnum:]_]|$)/) print FILENAME":"FNR":"$0
    }'
  )"

# Architecture docs state rules, never values. Code spans are dropped first, since a command the
# reader types may hold a value. A bare s, d or h joined to its number is no unit here ("1990s",
# "2d"); its spaced form is.
report 'Values with units under docs/architecture (the code owns its values; code blocks are exempt):' \
  "$(list_markdown "$@" | grep '^docs/architecture/' | xargs -r awk "$fence_awk"'
    {
      m = fence_marker($0)
      if (m != "") {
        rest = fence_rest($0, m)
        if (open == "") open = m
        else if (closes(m, rest)) open = ""
        next
      }
      if (open != "") next
      text = $0
      gsub(/`[^`]*`/, "", text)
      if (text ~ /(^|[^[:alnum:]_.])[0-9]+(\.[0-9]+)? ?(ms|min|KB|MB|GB|TB|KiB|MiB|GiB)([^[:alnum:]_]|$)/ ||
        text ~ /(^|[^[:alnum:]_.])[0-9]+(\.[0-9]+)? (s|h|d)([^[:alnum:]_]|$)/ ||
        text ~ /(^|[^[:alnum:]_.])[0-9]+[ -](second|minute|hour|day|week)s?([^[:alnum:]_]|$)/) print FILENAME":"FNR":"$0
    }')"

report 'Horizontal rules outside YAML frontmatter:' \
  "$(list_markdown "$@" | xargs -r awk \
    'FNR==1{fm=($0=="---")} fm&&FNR>1&&$0=="---"{fm=0;next} !fm&&$0=="---"{print FILENAME": "FNR}')"

report 'Untagged code fences:' \
  "$(list_markdown "$@" | xargs -r awk "$fence_awk"'
    {
      m = fence_marker($0)
      if (m == "") next
      rest = fence_rest($0, m)
      if (open == "") {
        open = m
        if (rest ~ /^[ \t]*$/) print FILENAME": "FNR
      } else if (closes(m, rest)) {
        open = ""
      }
    }')"

# Lists the files the branch changes since its merge base with origin's default branch, then the
# uncommitted and untracked ones. The paragraph check reads only these, so a doc written before the
# check fails nobody until a branch edits it. Each path ends in a NUL, so a path may hold any
# character.
list_changed() {
  local default base
  default=$(git rev-parse -q --abbrev-ref origin/HEAD 2> /dev/null) || default=origin/main
  # Before the first commit, every staged file is new.
  if ! git rev-parse -q --verify HEAD > /dev/null; then
    git ls-files -z --cached
  else
    if base=$(git merge-base HEAD "$default" 2> /dev/null); then
      git diff -z --name-only --no-renames --diff-filter=d "$base" HEAD
    # A pull-request run in GitHub Actions checks out the PR's merge commit with no history and no
    # origin branches, so the base tip is fetched and the two trees compared.
    elif [ -n "${GITHUB_BASE_REF:-}" ] &&
      git fetch -q --no-tags --depth=1 origin "$GITHUB_BASE_REF" 2> /dev/null; then
      git diff -z --name-only --no-renames --diff-filter=d FETCH_HEAD HEAD
    else
      echo "check-prose: no merge base with $default, so the paragraph check reads only uncommitted files" >&2
    fi
    git diff -z --name-only --no-renames --diff-filter=d HEAD
  fi
  git ls-files -z --others --exclude-standard
}

# Prints file:line:words for each prose paragraph over the warning limit. The parser is one state
# machine over CommonMark's block rules, so it counts what a renderer shows as a paragraph:
#
# - A paragraph runs until a blank line or a line that interrupts it: an ATX heading, a fence, an
#   HTML block of types 1 to 6, a block quote, a thematic break, a bullet item with content, or an
#   ordered item numbered 1 with content. Any other line continues it, indented or not.
# - A line of = or - under a paragraph makes it a Setext heading, and a table delimiter row makes its
#   last line a table header; neither counts. The paragraph lines above that header still count.
# - Indented code (4 columns or more where no paragraph is open), fenced code, block quotes, tables,
#   link definitions, frontmatter and ATX headings never count.
# - HTML blocks of types 1 to 5 (script, pre, style or textarea; a comment; a processing
#   instruction; a declaration; CDATA) run to their closing marker across blank lines. Types 6 (a
#   block tag) and 7 (a lone tag, which cannot interrupt a paragraph) run to a blank line.
# - Nothing inside a list counts. A list runs while each line is blank, indented to the content of
#   its outermost item, a new item, or a lazy continuation of a paragraph. A fence or an HTML block
#   opened in a list ends with it.
paragraph_awk='
function indent_of(line, i, c, col) {
  col = 0
  for (i = 1; i <= length(line); i++) {
    c = substr(line, i, 1)
    if (c == " ") col++
    else if (c == "\t") col += 4 - col % 4
    else break
  }
  return col
}
function is_atx(s) {
  return match(s, /^#+/) && RLENGTH <= 6 && substr(s, RLENGTH + 1) ~ /^([ \t]|$)/
}
function is_thematic(s) {
  return s ~ /^\*[ \t]*\*[ \t]*\*[ \t*]*$/ || s ~ /^-[ \t]*-[ \t]*-[ \t-]*$/ || s ~ /^_[ \t]*_[ \t]*_[ \t_]*$/
}
function is_item(s) {
  return s ~ /^([-*+]|[0-9]+[.)])([ \t]|$)/
}
function is_table_delimiter(s) {
  return s ~ /\|/ && s ~ /^\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/
}
# A link definition holds a label, a destination and an optional title, and nothing else.
function is_link_definition(s) {
  return s ~ /^\[[^]]+\]:[ \t]*(<[^>]*>|[^ \t<][^ \t]*)([ \t]+("[^"]*"|\([^)]*\)))?[ \t]*$/
}
# Returns the pattern that closes the HTML block this line starts for types 1 to 5, "closed" when
# the same line closes it, "block" for type 6, or "" for any other line. A tag name needs a boundary
# after it, so <preview> starts no pre block.
function html_start(s, lower) {
  lower = tolower(s)
  if (match(lower, /^<(script|pre|style|textarea)([ \t>]|$)/)) return html_marker(lower, "</(script|pre|style|textarea)>")
  if (match(lower, /^<!--/)) return substr(lower, 5) ~ /^-?>|-->/ ? "closed" : "-->"
  if (match(lower, /^<\?/)) return html_marker(lower, "[?]>")
  if (match(lower, /^<!\[cdata\[/)) return html_marker(lower, "]]>")
  if (match(lower, /^<![a-z]/)) return html_marker(lower, ">")
  if (lower ~ /^<\/?(address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)([ \t>]|\/>|$)/) return "block"
  return ""
}
function html_marker(lower, marker) {
  return substr(lower, RSTART + RLENGTH) ~ marker ? "closed" : marker
}
function is_lone_tag(s) {
  return s ~ /^<\/?[A-Za-z][A-Za-z0-9-]*([ \t][^<>]*)?\/?>[ \t]*$/
}
function interrupts(s, rel) {
  return rel < 4 && (fence_marker(s) != "" || is_atx(s) || is_thematic(s) || s ~ /^>/ ||
    html_start(s) != "" || s ~ /^[-*+][ \t]+[^ \t]/ || s ~ /^1[.)][ \t]+[^ \t]/)
}
function flush() {
  if (block == "para" && counted && words > warn) print start_file":"start_line":"words
  block = ""
  words = 0
}
# Starts the block that a line opens. s is the line without its indent, rel its indent in columns
# past the enclosing list item, and ind the column where s starts.
function start_block(s, rel, ind, m, h, mlen, rest, content, gap, off, parts) {
  if (rel >= 4) {
    block = "code"
    return
  }
  m = fence_marker(s)
  if (m != "") {
    open = m
    return
  }
  h = html_start(s)
  if (h == "closed") return
  if (h == "block" || (h == "" && is_lone_tag(s))) {
    block = "html"
    return
  }
  if (h != "") {
    html_end = h
    return
  }
  if (is_atx(s) || is_thematic(s)) return
  if (s ~ /^>/) {
    block = "quote"
    return
  }
  if (is_item(s)) {
    match(s, /^([-*+]|[0-9]+[.)])/)
    mlen = RLENGTH
    rest = substr(s, mlen + 1)
    content = rest
    sub(/^[ \t]+/, "", content)
    gap = length(rest) - length(content)
    off = ind + mlen + ((content == "" || gap >= 5) ? 1 : gap)
    if (!in_list || ind < list_off) list_off = off
    in_list = 1
    if (content != "") start_block(content, gap >= 5 ? gap - 1 : 0, off)
    return
  }
  if (is_link_definition(s)) {
    block = "linkdef"
    return
  }
  block = "para"
  counted = !in_list
  words = split(s, parts)
  last_words = words
  start_file = FILENAME
  start_line = FNR
}
FNR == 1 {
  flush()
  in_list = 0
  html_end = ""
  front = ($0 == "---")
  if (front) next
}
front {
  if ($0 == "---") front = 0
  next
}
{
  ind = indent_of($0)
  s = $0
  sub(/^[ \t]+/, "", s)
  blank = (s == "")
  # A line left of the list content ends the list, unless it starts a new item or lazily continues
  # a paragraph. A fence or an HTML block opened in the list ends with it.
  if (in_list && !blank && ind < list_off) {
    if (open != "" || html_end != "") {
      open = ""
      html_end = ""
      block = ""
    }
    if (ind < 4 && is_item(s) && !is_thematic(s)) {
      flush()
    } else if ((block == "para" || block == "quote" || block == "table") && !interrupts(s, ind)) {
      next
    } else {
      flush()
      in_list = 0
    }
  }
  rel = (in_list && ind >= list_off) ? ind - list_off : ind
  if (open != "") {
    m = fence_marker(s)
    if (m != "" && rel < 4 && closes(m, fence_rest(s, m))) open = ""
    next
  }
  if (html_end != "") {
    if (tolower($0) ~ html_end) html_end = ""
    next
  }
  if (blank) {
    flush()
    next
  }
  if (block == "linkdef") {
    block = ""
    if (rel < 4 && s ~ /^("[^"]*"|\([^)]*\))[ \t]*$/) next
  }
  if (block == "html") next
  if (block == "code") {
    if (rel >= 4) next
    block = ""
  }
  if (block == "para") {
    if (rel < 4 && s ~ /^(=+|-+)[ \t]*$/) {
      block = ""
      words = 0
      next
    }
    if (rel < 4 && is_table_delimiter(s)) {
      words -= last_words
      flush()
      block = "table"
      next
    }
    if (!interrupts(s, rel)) {
      last_words = split(s, parts)
      words += last_words
      next
    }
    flush()
  }
  if (block == "quote" || block == "table") {
    if (block == "quote" && rel < 4 && s ~ /^>/) next
    if (!interrupts(s, rel)) next
    block = ""
  }
  start_block(s, rel, ind)
}
END { flush() }
'

changed=$'\n'
while IFS= read -r -d '' file; do
  changed+=$file$'\n'
done < <(list_changed)

# The Markdown files the paths name that the branch changes, read NUL-separated like list_changed.
paragraph_files=()
while IFS= read -r -d '' file; do
  if [[ $file == *.md && $changed == *$'\n'"$file"$'\n'* && -f $file ]]; then
    paragraph_files+=("$file")
  fi
done < <(git ls-files -z --cached --others --exclude-standard -- "$@")

paragraphs=
if [ "${#paragraph_files[@]}" -gt 0 ]; then
  paragraphs=$(awk -v warn="$paragraph_warn" "$fence_awk$paragraph_awk" "${paragraph_files[@]}")
fi

report "Paragraphs over $paragraph_fail words in a changed file (split each one; lists, tables and code blocks are exempt):" \
  "$(awk -F: -v limit="$paragraph_fail" '$NF > limit { print $0" words" }' <<< "$paragraphs")"

candidate "Paragraphs over $paragraph_warn words in a changed file (warning; reread each one and split it where it defends a decision):" \
  "$(awk -F: -v limit="$paragraph_fail" '$NF != "" && $NF <= limit { print $0" words" }' <<< "$paragraphs")"

candidate 'Candidates — filler words with term-of-art uses; cull the filler, keep the terms:' \
  "$(grep_docs -nPi '\b(naturally|cleanly|trivially|easy|simple|quick)\b' -- "$@")"

candidate 'Candidates — speech verbs on data artifacts; the artifact holds, includes, returns, or matches:' \
  "$(grep_docs -nPi '(?<!file |table |column |export |bucket |method |variable |test )\b(names|says|tells|answers|knows|promises)\b(?! (rot|and locations|only))' -- "$@")"

candidate 'Candidates — delta-framing words; legal only when the baseline sits in the same doc:' \
  "$(grep_docs -nPi '(^|\. )(Also|Additionally|In addition),? |\b(already|today|before this work|as it does today)\b' -- "$@")"

candidate 'Candidates — headings written as claims; move the thesis into the first sentence:' \
  "$(grep_docs -nP '^#{2,4} (?!(What|Why|When|How|Before|Where|Which)\b).*\b(is|are|does|has|cannot|never|not)\b' -- "$@")"

if [ "$fail" -eq 0 ]; then
  echo 'check-prose: clean (candidates above, if any, need judgment only)'
fi

exit "$fail"
