import parser from "@typescript-eslint/parser";

const studioOnly = [
  { regex: "^(react|react-dom|@xyflow/react|@dagrejs/dagre|@codemirror/[^/]+|@lezer/[^/]+)(/|$)", message: "React, graph and editor libraries belong only in src/studio." },
  { regex: "(^|/)studio(/|$)", message: "The game must never import the Studio." },
];
const pure = { regex: "(^|/)(ui|app|persistence|debug)(/|$)|(^|/)main([.]|$)", message: "Content/core cannot depend on game presentation or storage." };
const importTypes = (patterns) => patterns.map(({ regex, message }) => ({
  selector: `TSImportType[source.value=/${regex.replaceAll("/", "\\/")}/]`, message,
}));
const noJsx = { selector: "JSXElement, JSXFragment", message: "JSX belongs only in src/studio." };
const staticOnly = { selector: "ImportExpression", message: "Use static imports to keep module boundaries auditable." };
export default [
  { ignores: ["node_modules/**", "dist/**", "dist-test/**", "docs/**", "playwright-report/**", "test-results/**"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      "no-restricted-imports": ["error", { patterns: studioOnly }],
      "no-restricted-syntax": ["error", staticOnly, ...importTypes(studioOnly), noJsx],
    },
  },
  {
    files: ["src/{content,core}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [...studioOnly, pure] }],
      "no-restricted-syntax": ["error", staticOnly, ...importTypes([...studioOnly, pure]), noJsx],
    },
  },
  {
    files: ["src/studio/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": ["error", staticOnly, ...importTypes([pure,
        { regex: "(^|/)content/(?!index(?:[.]|$))", message: "Use the public content surface." },
        { regex: "(^|/)core/(?!engine(?:[.]|$))", message: "Use the public engine API." },
      ])],
      "no-restricted-imports": ["error", { patterns: [
      pure,
      { regex: "(^|/)content/(?!index(?:[.]|$))", message: "Use the public src/content/index.ts surface." },
      { regex: "(^|/)core/(?!engine(?:[.]|$))", message: "Use the public engine API." },
    ] }] },
  },
];
