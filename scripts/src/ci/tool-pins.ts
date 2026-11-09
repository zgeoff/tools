export interface ToolPin {
  readonly url: string;

  readonly sha256: string;

  // A release that ships the binary inside a tar.gz names the archive member to extract.
  readonly packaging: 'binary' | 'tar.gz';

  // The check that needs the tool, for the line a job that skips it prints. A tool that no check
  // runs has none, and installs only when the caller asks for it.
  readonly neededBy: string | null;
}

const shfmtVersion = 'v3.13.1';
const actionlintVersion = '1.7.12';

// The version the gitleaks job's action runs, so a suite's scan matches the pull request's.
const gitleaksVersion = '8.30.1';

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

  // A caller's test suite may run gitleaks; no check does.
  gitleaks: {
    url: `https://github.com/gitleaks/gitleaks/releases/download/v${gitleaksVersion}/gitleaks_${gitleaksVersion}_linux_x64.tar.gz`,
    sha256: '551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb',
    packaging: 'tar.gz',
    neededBy: null,
  },
} as const satisfies Record<string, ToolPin>;
