// @ts-check
const nextJest = require("next/jest");

const createJestConfig = nextJest({
  dir: "./"
});

/** @type {import('jest').Config} */
const customJestConfig = {
  clearMocks: true,
  collectCoverageFrom: ["<rootDir>/{app,components,lib}/**/*.{ts,tsx}", "!<rootDir>/**/index.{ts,tsx}"],
  coverageDirectory: "<rootDir>/coverage",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1"
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.ts"],
  testEnvironment: "jsdom",
  testPathIgnorePatterns: ["<rootDir>/.next/", "<rootDir>/node_modules/"],
  transform: {}
};

module.exports = createJestConfig(customJestConfig);

