// a digit ends a verb too, since an acronym such as 2FA starts a camelCase
// segment
export default function isVerbMatch(name, verb) {
  return name === verb || (name.startsWith(verb) && /[A-Z0-9]/u.test(name.charAt(verb.length)));
}
