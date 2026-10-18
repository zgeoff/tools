// The config file is unreadable or breaks a rule. The runner prints the message and exits 2.
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);

    this.name = 'ConfigError';
  }
}
