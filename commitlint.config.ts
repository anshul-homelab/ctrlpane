import type { UserConfig } from '@commitlint/types';

const config: UserConfig = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'api',
        'web',
        'shared',
        'blueprint',
        'auth',
        'deps',
        'docs',
        'ci',
        'tooling',
        'db',
        'infra',
        'mcp',
        'testing',
        'deploy',
        'config',
        'security',
        'telemetry',
      ],
    ],
    'scope-empty': [1, 'never'],
    'subject-case': [2, 'always', 'lower-case'],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [0, 'always'],
  },
};

export default config;
