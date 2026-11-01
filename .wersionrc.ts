import { semverMatcher, WersionConfigModel } from '@weichwarenprojekt/wersion';

export const configuration: Partial<WersionConfigModel> = {
  versionFile: {
    path: './package.json',
    matcher: `"version": ?"${semverMatcher}"`,
  },
  commitTypes: {
    major: [],
    minor: ['feat'],
    patch: ['fix'],
  },
  breakingChangeTrigger: 'breaking change',
  changelogFilePath: './CHANGELOG.md',
  // The lockfile repeats the version from package.json.
  beforeCommit: 'npm install --package-lock-only --ignore-scripts --no-audit --no-fund',
  filesToCommit: ['./package-lock.json'],
  projectName: 'isolator',
};
