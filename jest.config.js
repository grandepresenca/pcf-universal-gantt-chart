// jest.config.js — unit tests for pure logic (ts-jest).
// Install (dev deps):
//   npm i -D jest ts-jest @types/jest
// package.json scripts:
//   "test": "jest --passWithNoTests"
//   "test:watch": "jest --watch"
//
// TEMPORARY: `--passWithNoTests` exists only so `npm test` is green on
// master before any test file exists. It MUST be removed (back to plain
// "jest") in the same change that lands the first real test on master,
// so an accidentally deleted test can never pass silently.
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node", // pure logic; no DOM needed. Use "jsdom" only if a test touches React.
  roots: ["<rootDir>/UniversalGanttChartComponent"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  collectCoverageFrom: [
    "UniversalGanttChartComponent/**/*.{ts,tsx}",
    "!UniversalGanttChartComponent/**/*.test.{ts,tsx}",
    "!UniversalGanttChartComponent/generated/**",
  ],
};
