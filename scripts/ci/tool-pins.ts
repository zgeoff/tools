export interface ToolPin {
  readonly url: string;

  readonly sha256: string;

  // A release that ships the binary inside a tar.gz names the archive member to extract.
  readonly packaging: 'binary' | 'tar.gz';

  // The check that needs the tool, for the line a job that skips it prints.
  readonly neededBy: string;
}

const shfmtVersion = 'v3.13.1';
const actionlintVersion = '1.7.12';

export const toolPins = {
  // The shell check runs shellcheck, which the runner image carries, and shfmt, which it lacks.
  shfmt: {
    url: `https://github.com/mvdan/sh/releases/download/${shfmtVersion}/shfmt_${shfmtVersion}_linux_amd64`,
    sha256: 'fb096c5d1ac6beabbdbaa2874d025badb03ee07929f0c9ff67563ce8c75398b1',
    packaging: 'binary',
    neededBy: 'shell check',
  },
  actionlint: {
    url: `https://github.com/rhysd/actionlint/releases/download/v${actionlintVersion}/actionlint_${actionlintVersion}_linux_amd64.tar.gz`,
    sha256: '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8',
    packaging: 'tar.gz',
    neededBy: 'workflows check',
  },
} as const satisfies Record<string, ToolPin>;
