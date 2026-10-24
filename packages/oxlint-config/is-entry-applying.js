import isInAnyZone from './is-in-any-zone.js';

export default function isEntryApplying(entry, path, zones) {
  return (entry.from === undefined || isInAnyZone(zones, entry.from)) && !entry.ignore(path);
}
