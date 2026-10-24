import isEntryApplying from './is-entry-applying.js';
import isInAnyZone from './is-in-any-zone.js';

export default function isEdgeRefusing(entry, edgeImport) {
  const isForbidden =
    (entry.to === undefined || isInAnyZone(edgeImport.toZones, entry.to)) &&
    (entry.allow === undefined || !isInAnyZone(edgeImport.toZones, entry.allow));
  const isTypeExempt =
    edgeImport.typeOnly &&
    (entry.allowTypeOnly === true || entry.typeOnlyTargets?.(edgeImport.to) === true);

  return (
    isEntryApplying(entry, edgeImport.from, edgeImport.fromZones) &&
    isForbidden &&
    !isTypeExempt &&
    entry.within?.(edgeImport.from, edgeImport.to) !== true
  );
}
