// jest.config.js — unit tests for pure logic (ts-jest).
// Install (dev deps):
//   npm i -D jest ts-jest @types/jest
// package.json scripts:
//   "test": "jest --coverage"   (the gate: fails if there are no tests, and
//                                enforces coverageThreshold on every run)
//   "test:watch": "jest --watch"
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
  // Per-module thresholds for the pure logic we add. Raise as coverage grows.
  coverageThreshold: {
    "./UniversalGanttChartComponent/columns.ts": {
      branches: 90, functions: 100, lines: 95, statements: 95,
    },
  },
};
