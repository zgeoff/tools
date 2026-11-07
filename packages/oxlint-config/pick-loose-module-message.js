export default function pickLooseModuleMessage(modules, name, limit) {
  if (modules.length <= limit || !modules.includes(name)) {
    return null;
  }

  return modules[0] === name ? 'capExample' : 'cap';
}
