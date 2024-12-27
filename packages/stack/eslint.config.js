import base from "@quory/config/eslint/base";
import node from "@quory/config/eslint/node";
import react from "@quory/config/eslint/react";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    ignores: ["dist"],
  },
  ...base,
  ...react.map((x) => ({
    ...x,
    files: ["**/src/react/**/*.{ts,tsx}"],
  })),
  ...node.map((x) => ({
    ...x,
    files: ["**/src/server/**/*.ts"],
  })),
];
