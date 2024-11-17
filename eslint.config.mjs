import globals from "globals";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default [{
    ignores: ["node_modules/*", "dist/*"],
}, ...compat.extends("eslint:recommended", "prettier"), {
    languageOptions: {
        globals: {
            ...globals.browser,
            ...globals.node
        },

        ecmaVersion: "latest",
        sourceType: "module",
    },

    rules: {
        "no-duplicate-imports": 2,
        "object-shorthand": 2,
        "prefer-arrow-callback": 2,
        "no-else-return": 2,

        "one-var": ["error", {
            uninitialized: "always",
        }],

        "prefer-exponentiation-operator": 2,
        "spaced-comment": ["error", "always", {
            exceptions: ["@__PURE__"],
        }],

        "array-bracket-spacing": 2,
        "object-curly-spacing": ["error", "always"],
        "no-trailing-spaces": 2,
        "multiline-comment-style": ["error", "separate-lines"],

        "max-len": ["error", {
            comments: 80,
            ignoreTrailingComments: true,
            ignoreUrls: true,
            ignoreStrings: true,
            ignoreRegExpLiterals: true,
        }],
    },
}];