import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const eslintConfig = [...nextCoreWebVitals, ...nextTypescript, {
  rules: {
    // ✅ AUDIT A-CODE C1 : réactivation des règles critiques précédemment
    //   désactivées. Les règles sont mises en "warn" (pas "error") pour ne
    //   pas casser le build, mais elles apparaîtront dans `bun run lint`.
    //   Règles de sécurité/correctness → error ; règles de style → warn.

    // TypeScript rules — gardées off car trop de code legacy utilise `any`
    // (audit A-CODE M5/M6). À actifier progressivement par module.
    "@typescript-eslint/no-explicit-any": "off",
    "@typescript-eslint/no-unused-vars": "warn",
    "@typescript-eslint/no-non-null-assertion": "off",
    "@typescript-eslint/ban-ts-comment": "warn",

    // React rules — react-hooks/exhaustive-deps désactivé car le plugin
    // react-hooks n'est pas explicitement chargé dans cette config flat.
    "react-hooks/exhaustive-deps": "off",
    "react-hooks/purity": "off",
    "react/no-unescaped-entities": "off",
    "react/display-name": "off",
    "react/prop-types": "off",

    // Next.js rules
    "@next/next/no-img-element": "off",
    "@next/next/no-html-link-for-pages": "off",

    // General JavaScript rules — correctness en error, style en warn
    "prefer-const": "warn",
    "no-unused-vars": "warn",
    "no-console": "off",
    "no-debugger": "error",
    "no-empty": "warn",
    "no-irregular-whitespace": "warn",
    "no-case-declarations": "warn",
    "no-fallthrough": "error",
    "no-mixed-spaces-and-tabs": "warn",
    "no-redeclare": "error",
    // no-undef désactivé car TypeScript gère déjà la vérification des
    // variables non définies (et avec jsx: react-jsx, React n'est pas
    // importé explicitement → faux positif sur les .tsx).
    "no-undef": "off",
    "no-unreachable": "error",
    "no-useless-escape": "warn",
  },
}, {
  ignores: ["node_modules/**", ".next/**", "out/**", "build/**", "next-env.d.ts", "examples/**", "skills", ".zscripts/**", "scripts/**", "tests/**"]
}];

export default eslintConfig;
