export default {
  displayName: 'portfolio-manager-integration',
  preset: '../../jest.preset.js',
  testEnvironment: 'node',
  testTimeout: 20000,
  testMatch: ['<rootDir>/src/**/*.integration.spec.ts'],
  transform: {
    '^.+\\.[tj]s$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.spec.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/portfolio-manager-integration',
};
