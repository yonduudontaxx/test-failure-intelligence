import vm from 'node:vm';
import type { Config } from 'jest';

// Below Node 24.9 Jest cannot require() ESM, so ESM-only deps loaded via require() are transformed to CommonJS.
const jestRequiresEsmNatively = 'hasAsyncGraph' in (vm.SourceTextModule?.prototype ?? {});

const esmOnlyDeps = ['content-disposition'];

const config: Config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'allure-jest/node',
  testEnvironmentOptions: {
    resultsDir: 'allure-results',
  },
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
      },
    ],
    ...(jestRequiresEsmNatively
      ? {}
      : {
          [`/node_modules/(${esmOnlyDeps.join('|')})/.+\\.js$`]: [
            'ts-jest',
            {
              useESM: false,
              tsconfig: { allowJs: true, module: 'CommonJS', moduleResolution: 'Node10' },
            },
          ],
        }),
  },
  ...(jestRequiresEsmNatively
    ? {}
    : { transformIgnorePatterns: [`/node_modules/(?!(${esmOnlyDeps.join('|')})/)`] }),
  testMatch: ['<rootDir>/tests/**/*.test.ts'],
  globalSetup: '<rootDir>/tests/integration/global-setup.ts',
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts'],
  coverageDirectory: 'coverage',
};

export default config;
