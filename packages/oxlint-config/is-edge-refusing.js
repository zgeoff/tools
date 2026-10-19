import isEntryApplying from './is-entry-applying.js';
import isInAnyZone from './is-in-any-zone.js';

// `entry` is a compiled edge; `edgeImport` is `{ from, to, fromZones,
// toZones, typeOnly }`, both paths relative to the repo root
export default function isEdgeRefusing(entry, edgeImport) {
  // `to` picks the targets judged, every target when absent; `allow` exempts
  // some of them. The schema needs one of the two.
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
