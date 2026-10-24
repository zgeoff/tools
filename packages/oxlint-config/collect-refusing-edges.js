import collectZoneNames from './collect-zone-names.js';
import getZoneOptions from './get-zone-options.js';
import isEdgeRefusing from './is-edge-refusing.js';

export default function collectRefusingEdges(options, edgeImport) {
  const compiled = getZoneOptions(options);

  const judged = {
    from: edgeImport.from,
    to: edgeImport.to,
    fromZones: collectZoneNames(compiled.zones, edgeImport.from),
    toZones: collectZoneNames(compiled.zones, edgeImport.to),
    typeOnly: edgeImport.typeOnly === true,
  };

  return (options.edges ?? []).filter((_, index) => isEdgeRefusing(compiled.edges[index], judged));
}
