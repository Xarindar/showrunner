import nextTypescript from "eslint-config-next/typescript";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: [".next/**", ".next-*/**", ".tmp/**", ".impeccable/review/**", "node_modules/**"]
  },
  ...nextVitals,
  ...nextTypescript
];

export default eslintConfig;
