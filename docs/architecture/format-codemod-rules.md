# format-codemod rules

The [format-codemod](../../packages/format-codemod/README.md) codemod owns the blank lines between
TypeScript statements. It sets each gap between two adjacent statements to one blank line where a
rule below requires one, and to none where no rule does. It parses each file once with oxc-parser
and edits only whitespace, so a pass over compliant code changes nothing. The rules cover what
ESLint's `padding-line-between-statements` and `@stylistic/lines-between-class-members` cover, and
more.

## Padded statements

A statement padded on both sides stands as its own paragraph:

- a control-flow block: `if`, `for`, `for…in`, `for…of`, `while`, `switch`, `try`
- any statement that spans more than one line
- a type alias or an interface declaration, so a run of them is padded apart

Some statements take a blank line on one side only:

- before every `return`
- after a `function` or `class` declaration
- after a directive prologue (`'use strict'`, `'use client'`), while a run of directives stays flush
- after the last import of a block

Class members take one blank line between each pair.

Only a bare declaration matches the declaration rules, so the classifier reads `export const`,
`export function` and `export class` as no declaration. Type aliases and interfaces are the one
exception: `export type X = …` pads like `type X = …`.

## Kinds

The codemod sorts each statement into a kind. A run of one kind sits flush, and the boundary between
two kinds takes a blank line.

| Kind        | A statement of the kind                                                  |
| ----------- | ------------------------------------------------------------------------ |
| Declaration | `const`, `let` or `var`                                                  |
| Using       | `using` or `await using`                                                 |
| Bare call   | its first call in reading order calls a bare function: `use(x).report()` |
| Method call | its first call in reading order calls a member: `fs.writeFileSync(…)`    |
| Assertion   | its first call in reading order is `expect` or an `expect.*` helper      |
| Assignment  | an assignment or an increment                                            |

A member call chained onto a bare call's result is still a bare call. The assertion kind keeps a run
of `expect` lines flush and pads the boundary with each statement that acts.

Two axes lie over the kinds, and each pads its own boundary:

- **Instantiation:** a statement headed by `new`, such as `new X(…).method()`, is padded apart from
  a statement that is no instantiation. A `new` in argument position does not count.
- **Awaitedness:** a statement with an `await` at the head of its value chain, such as `await f()`
  or `const x = await f()`, is padded apart from a statement without one. An `await` in argument
  position, as in `use(await f())`, or under a head outside the chain, as in
  `flag ? await f() : g()`, does not count.

A run of instantiations stays flush, and so does a run of awaited statements.

## Gaps the codemod leaves alone

The codemod skips three kinds of gap:

- It only grows a gap that holds a comment, never shrinks it, because prose between statements marks
  a grouping the rules cannot see.
- It never edits the gaps inside an import block, which the import sorter owns. It still pads the
  boundary after the last import.
- It skips two statements that share one line, such as a leading-semicolon `;(expr)` guard, because
  a whitespace edit cannot split them without moving a token.

## Comments

The parser gives each comment's position, so text that only looks like a comment never changes a
statement's kind. A trailing comment on a statement's own line belongs to that statement, and the
blank line goes after the comment. A comment on its own line belongs to the statement after it, and
the blank line goes before the comment. The next statement keeps its indentation.
