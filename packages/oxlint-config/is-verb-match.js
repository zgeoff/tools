// a name starts with a verb when the verb ends at a camelCase boundary; a
// digit also ends it, since acronyms like 2FA start camelCase segments
export default function isVerbMatch(name, verb, bareAllowed) {
  if (name === verb) {
    return bareAllowed;
  }

  return name.startsWith(verb) && /[A-Z0-9]/u.test(name.charAt(verb.length));
}
