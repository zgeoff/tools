// `zones` holds the compiled zones, each a name and a path matcher
export default function collectZoneNames(zones, path) {
  return zones.filter((zone) => zone.match(path)).map((zone) => zone.name);
}
