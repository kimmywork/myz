/** @type {import('jest').Config} */
const config = {
  testEnvironment: "node",
  testMatch: ["**/__tests__/**/*.test.ts"],
  resetMocks: true,
  restoreMocks: true,
  clearMocks: true,
  setupFilesAfterEnv: ["<rootDir>/tests/setup-tests.ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@server/(.*)$": "<rootDir>/server/$1",
  },
  transform: {
    "^.+\\.(t|j)sx?$": [
      "ts-jest",
      {
        useESM: true,
        tsconfig: "<rootDir>/tsconfig.jest.json",
      },
    ],
  },
  extensionsToTreatAsEsm: [".ts", ".tsx"],
  collectCoverageFrom: [
    "src/**/*.{ts,tsx}",
    "!src/app/(globals|layout).tsx",
    "!src/**/*.d.ts",
  ],
};

export default config;
