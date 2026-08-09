// Copies freshly compiled ABIs into the frontend so `lib/contracts.ts` always
// imports the real thing. Run `npm run abi` after any contract change.
//
// We emit `.ts` with `as const` rather than `.json`: a JSON import widens every
// string to `string`, which destroys wagmi/viem's ABI type inference and forces
// casts all over the app. The const assertion keeps `useReadContract` typed.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "out", "abi");
const to = resolve(root, "..", "frontend", "lib", "abi");

const targets = {
  GemHaven: "gemHavenAbi",
  ShardToken: "shardTokenAbi",
};

mkdirSync(to, { recursive: true });

for (const [name, exportName] of Object.entries(targets)) {
  const source = join(from, `${name}.json`);
  if (!existsSync(source)) {
    console.error(`missing ${source} — run \`npm run build\` first`);
    process.exit(1);
  }

  const abi = JSON.parse(readFileSync(source, "utf8"));
  const body = [
    `// Generated from contracts/src/${name}.sol by contracts/scripts/sync-abi.mjs.`,
    `// Do not edit by hand — run \`npm run abi\` in contracts/ instead.`,
    `export const ${exportName} = ${JSON.stringify(abi, null, 2)} as const;`,
    "",
  ].join("\n");

  writeFileSync(join(to, `${name}.ts`), body);
  console.log(`synced ${name}.ts -> frontend/lib/abi/`);
}
