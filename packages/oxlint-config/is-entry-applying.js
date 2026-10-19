import isInAnyZone from './is-in-any-zone.js';

// an entry without `from` applies to every file
export default function isEntryApplying(entry, path, zones) {
  return (entry.from === undefined || isInAnyZone(zones, entry.from)) && !entry.ignore(path);
}
