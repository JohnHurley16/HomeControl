// Assembles the Home Assistant app folder: dist/cc/ = app/* + the bundled service + the built front end.
// Copy dist/cc to the Pi's local apps folder and install it from the app store's "Local apps" section.
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist", "cc");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
for (const file of ["config.yaml", "Dockerfile", "DOCS.md", "docker-compose.yml"]) {
  await cp(join(root, "app", file), join(out, file));
}
await cp(join(root, "core", "dist", "cc.mjs"), join(out, "cc.mjs"));
await cp(join(root, "web", "dist"), join(out, "web"), { recursive: true });

// Keep the app version in step with package.json so Home Assistant offers "Update" after a rebuild.
const version = JSON.parse(await readFile(join(root, "package.json"), "utf8")).version;
const config = await readFile(join(out, "config.yaml"), "utf8");
await writeFile(join(out, "config.yaml"), config.replace(/^version: .*$/m, `version: "${version}"`));
console.log(`packaged dist/cc (version ${version})`);
