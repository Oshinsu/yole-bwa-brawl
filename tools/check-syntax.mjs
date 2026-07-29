import { readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["src", "test", "tools"];
const files = [];

function collect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) collect(path);
    else if (entry.isFile() && (path.endsWith(".js") || path.endsWith(".mjs"))) files.push(path);
  }
}

for (const root of roots) collect(root);
files.push("service-worker.js");
files.sort();

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    process.stderr.write(`Syntax check failed: ${file}\n`);
    process.exit(result.status || 1);
  }
}

console.log(`syntax check: ${files.length} JavaScript modules ok`);
