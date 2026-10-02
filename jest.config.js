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
  roots: ["<rootDir>/UniversalGanttChartComponent", "<rootDir>/tools"],
  testMatch: ["**/*.test.ts", "**/*.test.tsx"],
  collectCoverageFrom: [
    "UniversalGanttChartComponent/**/*.{ts,tsx}",
    "!UniversalGanttChartComponent/**/*.test.{ts,tsx}",
    "!UniversalGanttChartComponent/generated/**",
    // Migration validator (offline tool): the pure modules; the CLI is glue.
    "tools/migration-validation/src/**/*.ts",
    "!tools/migration-validation/src/**/*.test.ts",
    "!tools/migration-validation/src/test-builders.ts",
    "!tools/migration-validation/src/cli.ts",
  ],
  // Per-module thresholds for the pure logic we add. Raise as coverage grows.
  coverageThreshold: {
    "./UniversalGanttChartComponent/columns.ts": {
      branches: 90, functions: 100, lines: 95, statements: 95,
    },
    "./UniversalGanttChartComponent/hierarchy.ts": {
      branches: 90, functions: 100, lines: 90, statements: 90,
    },
    "./UniversalGanttChartComponent/task-mapping.ts": {
      branches: 100, functions: 100, lines: 100, statements: 100,
    },
    "./UniversalGanttChartComponent/list-layout.ts": {
      branches: 100, functions: 100, lines: 100, statements: 100,
    },
    "./UniversalGanttChartComponent/wbs.ts": {
      branches: 100, functions: 100, lines: 100, statements: 100,
    },
    "./tools/migration-validation/src/": {
      branches: 100, functions: 100, lines: 100, statements: 100,
    },
  },
};