// Standalone solc driver so `contracts/` can be compiled and its ABIs extracted
// without a Foundry toolchain installed. `forge build` remains the canonical
// path (see foundry.toml); this exists so `npm run build` works anywhere Node does.
import { readFileSync, mkdirSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const srcDir = join(root, "src");
const outDir = join(root, "out");
const abiDir = join(outDir, "abi");

/** Recursively collect .sol files under `dir`, returned as paths relative to `root`. */
function collect(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...collect(full));
    else if (name.endsWith(".sol")) found.push(full.slice(root.length + 1).replaceAll("\\", "/"));
  }
  return found;
}

// Only `src/` is compiled here. `script/Deploy.s.sol` depends on forge-std and
// is built by `forge build` / `forge script` instead.
const sources = {};
for (const rel of collect(srcDir)) {
  sources[rel] = { content: readFileSync(join(root, rel), "utf8") };
}

/** Resolves bare package imports (`@inco/...`, `forge-std/...`) out of node_modules. */
function findImport(path) {
  const candidates = [
    join(root, "node_modules", path),
    join(root, path),
    join(root, "lib", path),
  ];
  for (const candidate of candidates) {
    try {
      return { contents: readFileSync(candidate, "utf8") };
    } catch {
      /* try next */
    }
  }
  return { error: `File not found: ${path}` };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object", "evm.deployedBytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImport }));

const errors = (output.errors ?? []).filter((entry) => entry.severity === "error");
const warnings = (output.errors ?? []).filter((entry) => entry.severity !== "error");

// Warnings from vendored dependencies are noise; only surface our own.
for (const warning of warnings) {
  const file = warning.sourceLocation?.file ?? "";
  if (file.startsWith("src/")) {
    console.warn(warning.formattedMessage);
  }
}

if (errors.length > 0) {
  for (const error of errors) console.error(error.formattedMessage ?? error.message);
  console.error(`\n${errors.length} error(s).`);
  process.exit(1);
}

mkdirSync(abiDir, { recursive: true });

const wanted = new Set(["GemHaven", "ShardToken"]);
let written = 0;
for (const [file, contracts] of Object.entries(output.contracts ?? {})) {
  if (!file.startsWith("src/")) continue;
  for (const [name, artifact] of Object.entries(contracts)) {
    writeFileSync(
      join(abiDir, `${name}.json`),
      `${JSON.stringify(artifact.abi, null, 2)}\n`,
    );
    if (wanted.has(name)) {
      writeFileSync(
        join(outDir, `${name}.bytecode.txt`),
        `0x${artifact.evm.bytecode.object}\n`,
      );
      const sizeKb = (artifact.evm.deployedBytecode.object.length / 2 / 1024).toFixed(2);
      console.log(`  ${name.padEnd(14)} deployed size ${sizeKb} KiB`);
    }
    written += 1;
  }
}

console.log(`\nCompiled OK with solc ${solc.version()} — ${written} ABI file(s) in out/abi/.`);
