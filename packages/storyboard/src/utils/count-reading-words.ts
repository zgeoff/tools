// A run of characters between spaces is a word when it holds a letter, so `→`, `|` and `[{` count
// for nothing.
export function countReadingWords(text: string): number {
  return text.split(/\s+/u).filter((run) => /\p{L}/u.test(run)).length;
}
