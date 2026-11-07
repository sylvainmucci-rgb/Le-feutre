import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

let sha = "local";
try {
  sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim() || sha;
} catch {
  /* dépôt absent : le timestamp suffit à changer le cache */
}
const build = `${sha}-${Date.now().toString(36)}`;
const file = new URL("../dist/client/sw.js", import.meta.url);
const source = readFileSync(file, "utf8");
if (!source.includes("__FEUTRE_BUILD__")) {
  console.error("dist/client/sw.js ne contient pas la marque de build.");
  process.exit(1);
}
writeFileSync(file, source.replaceAll("__FEUTRE_BUILD__", build));
writeFileSync(new URL("../dist/client/version.json", import.meta.url), JSON.stringify({ build }));
console.log(`cache ${build}`);
