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
# machine over the CommonMark block rules (with GFM tables), so it counts what a renderer shows as a
# paragraph:
#
# - A paragraph runs until a blank line or a line that interrupts it: an ATX heading, a fence, an
#   HTML block of types 1 to 6, a block quote, a thematic break, a bullet item with content, or an
#   ordered item numbered 1 with content. Any other line continues it, indented or not.
# - Link reference definitions at the start of a paragraph are dropped before it is counted, as
#   CommonMark drops them, so a definition never interrupts a paragraph and may span lines.
# - A line of = or - under a paragraph makes it a Setext heading. A delimiter row with as many cells
#   as the paragraph's last line makes that line a table header. Neither counts, but the paragraph
#   lines above a header do.
# - Indented code (4 columns or more where no paragraph is open), fenced code, block quotes, tables,
#   HTML blocks, frontmatter and ATX headings never count. A quote takes a lazy line only while a
#   paragraph is open inside it.
# - HTML blocks of types 1 to 5 run to their closing marker across blank lines. Types 6 and 7 run to
#   a blank line, and type 7 (one complete tag alone on its line) cannot interrupt a paragraph.
# - Nothing inside a list counts. A list runs while each line is blank, indented to the content of
#   its outermost item, a new item, or a lazy continuation of a paragraph. A fence or an HTML block
#   opened in a list ends with it, and an empty item followed by a blank line ends it.
paragraph_awk='
BEGIN {
  q = sprintf("%c", 39)
  esc = "\\\\."
  label = "\\[[ \t\n]*([^][\\\\ \t\n]|" esc ")([^][\\\\]|" esc ")*\\]:"
  destination = "(<([^<>\n\\\\]|" esc ")*>|[^ \t\n<][^ \t\n]*)"
  title = "(\"([^\"\\\\]|" esc ")*\"|" q "([^" q "\\\\]|" esc ")*" q "|\\(([^()\\\\]|" esc ")*\\))"
  definition = "^" label "[ \t]*\n?[ \t]*" destination
  titled_definition = definition "([ \t]+|[ \t]*\n[ \t]*)" title "[ \t]*(\n|$)"
  bare_definition = definition "[ \t]*(\n|$)"
  value = "([^ \t\"" q "=<>`]+|" q "[^" q "]*" q "|\"[^\"]*\")"
  attribute = "[ \t]+[A-Za-z_:][A-Za-z0-9_.:-]*([ \t]*=[ \t]*" value ")?"
  open_tag = "^<[A-Za-z][A-Za-z0-9-]*(" attribute ")*[ \t]*/?>[ \t]*$"
  closing_tag = "^</[A-Za-z][A-Za-z0-9-]*[ \t]*>[ \t]*$"
}
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
function is_setext_underline(s) {
  return s ~ /^(=+|-+)[ \t]*$/
}
# A bullet, or an ordered marker of 1 to 9 digits, followed by a space, a tab or the line end.
function is_item(s) {
  return s ~ /^[-*+]([ \t]|$)/ || (match(s, /^[0-9]+[.)]([ \t]|$)/) && match(s, /^[0-9]+/) && RLENGTH <= 9)
}
# Returns the fence marker this line opens, or "" when it opens none. A backtick fence takes no
# backtick in its info string.
function fence_open(s, m) {
  m = fence_marker(s)
  if (m != "" && substr(m, 1, 1) == "`" && index(fence_rest(s, m), "`")) return ""
  return m
}
function fence_closes(opener, s, m) {
  m = fence_marker(s)
  return m != "" && substr(m, 1, 1) == substr(opener, 1, 1) && length(m) >= length(opener) &&
    fence_rest(s, m) ~ /^[ \t]*$/
}
# Counts the cells of a table row: its unescaped pipes, less an outer pipe at either end, plus one.
function cell_count(s, t) {
  t = s
  gsub(/\\\|/, "", t)
  sub(/^[ \t]*\|/, "", t)
  sub(/\|[ \t]*$/, "", t)
  return gsub(/\|/, "|", t) + 1
}
function is_table_delimiter(s) {
  return s ~ /\|/ && s ~ /^\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/
}
# Returns the pattern that closes the HTML block this line starts for types 1 to 5, "closed" when
# the same line closes it, "block" for type 6, or "" for any other line. A tag name needs a boundary
# after it, so <preview> starts no pre block.
function html_start(s, lower) {
  lower = tolower(s)
  if (match(lower, /^<(script|pre|style|textarea)([ \t>]|$)/)) return html_marker(lower, "</(script|pre|style|textarea)>")
  if (match(lower, /^<!--/)) return substr(lower, 5) ~ /^-?>|-->/ ? "closed" : "-->"
  if (match(lower, /^<\?/)) return html_marker(lower, "[?]>")
  if (match(s, /^<!\[CDATA\[/)) return html_marker(s, "]]>")
  if (match(lower, /^<![a-z]/)) return html_marker(lower, ">")
  if (lower ~ /^<\/?(address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[1-6]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|search|section|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)([ \t>]|\/>|$)/) return "block"
  return ""
}
function html_marker(text, marker) {
  return substr(text, RSTART + RLENGTH) ~ marker ? "closed" : marker
}
# HTML block type 7: one complete open or closing tag, with valid attributes, alone on its line.
function is_lone_tag(s) {
  return (s ~ open_tag || s ~ closing_tag) && tolower(s) !~ /^<\/?(script|pre|style|textarea)[^a-z0-9-]/
}
function interrupts(s, rel) {
  return rel < 4 && (fence_open(s) != "" || is_atx(s) || is_thematic(s) || s ~ /^>/ ||
    html_start(s) != "" || s ~ /^[-*+][ \t]+[^ \t]/ || s ~ /^1[.)][ \t]+[^ \t]/)
}
# Returns the index of the first paragraph line that no link reference definition holds.
function first_text_line(text, i, k, matched, newlines) {
  text = lines[1]
  for (i = 2; i <= line_count; i++) text = text "\n" lines[i]
  k = 0
  while (text != "" && (match(text, titled_definition) || match(text, bare_definition))) {
    matched = substr(text, 1, RLENGTH)
    newlines = gsub(/\n/, "\n", matched)
    k += (substr(matched, length(matched)) == "\n") ? newlines : newlines + 1
    text = substr(text, RLENGTH + 1)
  }
  return k + 1
}
function flush(i, first, words, parts) {
  if (block == "para" && counted) {
    first = first_text_line()
    words = 0
    for (i = first; i <= line_count; i++) words += split(lines[i], parts)
    if (words > warn) print start_file":"line_numbers[first]":"words
  }
  block = ""
  line_count = 0
}
function add_line(s) {
  lines[++line_count] = s
  line_numbers[line_count] = FNR
}
# Reads one line of a block quote, given without its > markers, and records whether a paragraph,
# a fence or an HTML block is open inside the quote.
function read_quote(c, ind, t, h) {
  ind = indent_of(c)
  t = c
  sub(/^[ \t]+/, "", t)
  if (quote_fence != "") {
    if (ind < 4 && fence_closes(quote_fence, t)) quote_fence = ""
    return
  }
  if (quote_html != "") {
    if (tolower(c) ~ quote_html) quote_html = ""
    return
  }
  if (t == "") {
    quote_para = 0
    quote_block = 0
    return
  }
  if (quote_block) return
  if (quote_para) {
    if (ind < 4 && is_setext_underline(t)) {
      quote_para = 0
      return
    }
    if (!interrupts(t, ind)) return
    quote_para = 0
  }
  if (ind >= 4) return
  if (fence_open(t) != "") {
    quote_fence = fence_open(t)
    return
  }
  h = html_start(t)
  if (h == "closed") return
  if (h == "block" || (h == "" && is_lone_tag(t))) {
    quote_block = 1
    return
  }
  if (h != "") {
    quote_html = h
    return
  }
  if (is_atx(t) || is_thematic(t)) return
  if (is_item(t)) {
    sub(/^([-*+]|[0-9]+[.)])[ \t]*/, "", t)
    quote_para = (t != "")
    return
  }
  quote_para = 1
}
function strip_quote_markers(s) {
  while (s ~ /^[ \t]*>/) {
    sub(/^[ \t]*>/, "", s)
    sub(/^ /, "", s)
  }
  return s
}
# Starts the block that a line opens. s is the line without its indent, rel its indent in columns
# past the enclosing list item, and ind the column where s starts.
function start_block(s, rel, ind, m, h, mlen, rest, content, gap, off) {
  if (rel >= 4) {
    block = "code"
    return
  }
  m = fence_open(s)
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
    quote_para = quote_block = 0
    quote_fence = quote_html = ""
    read_quote(strip_quote_markers(s))
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
    if (!in_list || ind < list_off) {
      list_off = off
      empty_item = (content == "")
    }
    in_list = 1
    if (content != "") start_block(content, gap >= 5 ? gap - 1 : 0, off)
    return
  }
  block = "para"
  counted = !in_list
  start_file = FILENAME
  add_line(s)
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
  # An empty item followed by a blank line holds nothing more, so the list ends there.
  if (in_list && blank && empty_item && open == "" && html_end == "") in_list = 0
  if (in_list && !blank) empty_item = 0
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
    } else if ((block == "para" || (block == "quote" && quote_para)) && !interrupts(s, ind)) {
      next
    } else {
      flush()
      in_list = 0
    }
  }
  rel = (in_list && ind >= list_off) ? ind - list_off : ind
  if (open != "") {
    if (rel < 4 && fence_closes(open, s)) open = ""
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
  if (block == "html") next
  if (block == "code") {
    if (rel >= 4) next
    block = ""
  }
  if (block == "para") {
    if (rel < 4 && is_setext_underline(s)) {
      # A paragraph of link definitions alone has no text to underline, so the line is text.
      if (first_text_line() <= line_count) block = ""
      else add_line(s)
      next
    }
    if (rel < 4 && is_table_delimiter(s) && cell_count(s) == cell_count(lines[line_count])) {
      line_count--
      flush()
      block = "table"
      next
    }
    if (!interrupts(s, rel)) {
      add_line(s)
      next
    }
    flush()
  }
  if (block == "quote") {
    if (rel < 4 && s ~ /^>/) {
      read_quote(strip_quote_markers(s))
      next
    }
    if (quote_para && quote_fence == "" && quote_html == "" && !interrupts(s, rel)) next
    block = ""
  }
  if (block == "table") {
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
