export default function isInAnyZone(zones, names) {
  return names.some((name) => zones.includes(name)) === true;
}
