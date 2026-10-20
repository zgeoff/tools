import type { ProgramResult } from '../run-program.ts';
import type { Finding } from '../types.ts';

// Reads what check-length.sh prints: its README lines, then check-prose's blocks, then check-skill's
// lines. Only what fails the script's run becomes a finding; warnings, candidates and summaries
// never fail it.
export function parseCheckLengthOutput(result: ProgramResult): Finding[] {
  // check-length exits 1 when a check fails, and 2 on a bad argument.
  if (result.exitCode > 1) {
    throw new Error(`docs: check-length failed: ${result.stderr.trim()}`);
  }

  if (result.exitCode === 0) {
    return [];
  }

  const findings = parseFailures(result.stdout);

  // A failed run with no line the parser reads comes from a copy of the scripts that prints another
  // format, so the check stops instead of passing it.
  if (findings.length === 0) {
    throw new Error(
      `docs: check-length failed, and it printed no problem the check can read:\n${result.stdout.trim()}`,
    );
  }

  return findings;
}

// check-prose heads each block with a label line that ends in a colon, and ends it with a blank
// line. A candidate block, and the paragraph block that only warns, never fail its run.
const LABEL = /^[^:]+:$/u;
const WARNING_LABEL = /^Candidates|\(warning;/u;

function parseFailures(stdout: string): Finding[] {
  const findings: Finding[] = [];
  let label: string | null = null;

  for (const line of stdout.split('\n')) {
    if (line === '') {
      label = null;
    } else if (label === null) {
      if (LABEL.test(line)) {
        label = line.slice(0, -1);
      } else {
        findings.push(...parseLine(line));
      }
    } else if (!WARNING_LABEL.test(label)) {
      findings.push(...parseProseItem(label, line));
    }
  }

  return findings;
}

const SUMMARY = /^check-(?:prose|skill): /u;
const WARNING = /\bwarning[:)]/u;
const README_PASS = /^.+?: \d+ lines \(.+ README; target \d+, limit \d+\)$/u;

const README_FAILURE =
  /^(?<path>.+?): (?<message>\d+ lines, over the .+ README limit of \d+ \(target \d+\))$/u;

const SKILL_ITEM = /^(?<path>.+?)(?::(?<line>\d+))?: (?<message>.+)$/u;

// A README over its limit, or a check-skill error. A finding that check-skill prints without a line
// number is about the frontmatter, so it takes line 1.
function parseLine(line: string): Finding[] {
  if (SUMMARY.test(line) || WARNING.test(line) || README_PASS.test(line)) {
    return [];
  }

  const readme = README_FAILURE.exec(line)?.groups;

  if (readme?.['path'] !== undefined && readme['message'] !== undefined) {
    return [{ path: readme['path'], line: 1, message: `check-length: ${readme['message']}` }];
  }

  const skill = SKILL_ITEM.exec(line)?.groups;

  if (skill?.['path'] === undefined || skill['message'] === undefined) {
    return [];
  }

  return [
    {
      path: skill['path'],
      line: Number(skill['line'] ?? 1),
      message: `check-skill: ${skill['message']}`,
    },
  ];
}

// A grep item prints as path:line:text, and the horizontal-rule and fence items as path: line.
const PROSE_ITEM = /^(?<path>.+?):(?<line>\d+):/u;
const PROSE_RULE_ITEM = /^(?<path>.+?): (?<line>\d+)$/u;

function parseProseItem(label: string, line: string): Finding[] {
  const groups = (PROSE_ITEM.exec(line) ?? PROSE_RULE_ITEM.exec(line))?.groups;

  if (groups?.['path'] === undefined || groups['line'] === undefined) {
    return [];
  }

  return [{ path: groups['path'], line: Number(groups['line']), message: `check-prose: ${label}` }];
}
