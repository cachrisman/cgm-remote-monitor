import nextJest from "next/jest";

const createJestConfig = nextJest({
  dir: "./"
});

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

export default createJestConfig(customJestConfig);
