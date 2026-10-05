// Baut dist/busplaner-artifact.html: eine einzelne HTML-Datei mit Oberflaeche, Scheduler und Fahrplandaten.
// React kommt von cdnjs (laut Vorgabe fuer Artifacts), alles andere steckt in der Datei.
//   node scripts/build-artifact.mjs
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

mkdirSync("dist", { recursive: true });

// 1) Startplan vorberechnen (Node)
await build({ entryPoints: ["artifact/precompute.ts"], bundle: true, platform: "node", format: "esm", outfile: "dist/precompute.mjs", logLevel: "error" });
const initialPlan = execFileSync("node", ["dist/precompute.mjs"], { maxBuffer: 64 * 1024 * 1024 }).toString();

// 2) Browser-Bundle. react und react-dom/client werden auf die globalen Objekte der CDN-Skripte abgebildet.
const globals = {
  name: "react-globals",
  setup(b) {
    b.onResolve({ filter: /^react(-dom\/client)?$/ }, (a) => ({ path: a.path, namespace: "globals" }));
    b.onLoad({ filter: /.*/, namespace: "globals" }, (a) => ({ contents: `module.exports = window.${a.path === "react" ? "React" : "ReactDOM"};`, loader: "js" }));
  },
};
const out = await build({
  entryPoints: ["artifact/entry.tsx"], bundle: true, write: false, minify: true, format: "iife", target: "es2020",
  // Klassische JSX-Umwandlung gegen das globale React der CDN (React 18). Die tsconfig des Projekts (react-jsx,
  // React 19) wird hier bewusst ueberschrieben, sonst mischen sich zwei React-Versionen.
  tsconfigRaw: JSON.stringify({ compilerOptions: { jsx: "react", jsxFactory: "React.createElement", jsxFragmentFactory: "React.Fragment", baseUrl: ".", paths: { "@/*": ["./*"] } } }),
  banner: { js: "const React = window.React;" }, define: { "process.env.NODE_ENV": '"production"' },
  plugins: [globals], logLevel: "error",
});
const js = out.outputFiles[0].text.replaceAll("</script", "<\\/script");

// 3) HTML zusammensetzen
const css = readFileSync("app/globals.css", "utf-8");
const html = `<title>Busplaner Nürnberg</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap">
<style>${css}</style>
<div id="root"></div>
<script type="application/json" id="initial-plan">${initialPlan.replaceAll("</", "<\\/")}</script>
<script>window.__ARTIFACT__ = true;</script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>${js}</script>
`;
writeFileSync("dist/busplaner-artifact.html", html);
console.log(`dist/busplaner-artifact.html: ${(html.length / 1024 / 1024).toFixed(2)} MB (Startplan ${(initialPlan.length / 1024).toFixed(0)} KB, Code ${(js.length / 1024).toFixed(0)} KB)`);
