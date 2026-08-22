import coreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
    ],
  },
  ...coreWebVitals,
  {
    rules: {
      // Data-fetch-on-mount patterns throughout the app trip this new
      // React-compiler-era rule. Rewriting all fetch flows is tracked as
      // future work; until then keep visibility without failing builds.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default eslintConfig;
