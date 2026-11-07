// a table named through an interpolation holds `${`, both in a file's text and in a template
// literal whose parts the rule joins with `${}`
export default function toTableName(raw) {
  if (raw.includes('${')) {
    return null;
  }

  const name = raw
    .split(/\s+as\s+/iu)[0]
    .split('.')
    .at(-1)
    .replaceAll(/["[\]]/gu, '');

  return name === '' ? null : name.toLowerCase();
}
