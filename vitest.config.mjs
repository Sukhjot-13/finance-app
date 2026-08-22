// vitest.config.mjs
//
// Single-entry test runner: vitest executes ONLY test/run-all.test.js, which
// imports every suite under test/suites/ so `npm test` runs the entire site's
// tests in one go.
//
// - environment "jsdom": component suites need DOM; node-style API/lib tests
//   run fine under it too (Node globals remain available).
// - jsxInJs plugin: Next source components are .js files containing JSX with
//   the automatic runtime — esbuild only applies JSX to .jsx by default, so a
//   tiny transform plugin bridges that for tests.
import esbuild from "esbuild";
import { defineConfig } from "vitest/config";
import path from "path";

const jsxInJs = {
  name: "jsx-in-js",
  enforce: "pre",
  async transform(code, id) {
    if (id.includes("node_modules")) return null;
    if (!/\/src\/.*\.js$/.test(id)) return null;
    const result = await esbuild.transform(code, {
      loader: "jsx",
      jsx: "automatic",
      sourcemap: true,
    });
    return { code: result.code, map: result.map };
  },
};

export default defineConfig({
  plugins: [jsxInJs],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["test/run-all.test.js"],
    setupFiles: ["./test/helpers/setup.js"],
    testTimeout: 15000,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
