const folderKinds = new Map([
  ['utils', 'utils'],
  ['test-utils', 'exempt'],
  ['generated', 'exempt'],
  ['lib', 'synonym'],
  ['shared', 'synonym'],
  ['helpers', 'synonym'],
  ['common', 'synonym'],
]);

export default function pickFolderKind(name) {
  return folderKinds.get(name) ?? 'feature';
}
