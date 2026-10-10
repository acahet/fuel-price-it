import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import sonarjs from "eslint-plugin-sonarjs";

// Sonar's code-quality and security rules (eslint-plugin-sonarjs) across the
// app and its scripts. Run with `npm run lint:sonar`.
export default [
    { ignores: ["node_modules/**", "dist/**", "coverage/**", "reports/**"] },
    {
        files: ["src/**/*.{js,jsx}", "scripts/**/*.js"],
        languageOptions: {
            ecmaVersion: "latest",
            sourceType: "module",
            parserOptions: { ecmaFeatures: { jsx: true } },
            globals: { ...globals.browser, ...globals.node },
        },
        plugins: { sonarjs, "react-hooks": reactHooks },
        rules: {
            ...js.configs.recommended.rules,
            ...sonarjs.configs.recommended.rules,
            // Only the rule the source disables by name; the React Compiler rules
            // in react-hooks recommended are not Sonar checks.
            "react-hooks/exhaustive-deps": "error",
        },
    },
];
