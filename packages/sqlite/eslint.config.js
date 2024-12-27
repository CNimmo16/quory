import base from "@quory/config/eslint/base";
import node from "@quory/config/eslint/node";

/** @type {import('eslint').Linter.Config[]} */
export default [
  ...base,
  ...node,
  {
    ignores: ["dist"],
  },
];
