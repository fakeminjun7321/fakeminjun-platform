#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const index = path.join(dist, "client", "index.html");
const worker = path.join(root, "worker", "index.js");
const ingestion = path.join(root, "worker", "ingestion.js");
const sourceRegistry = path.join(root, "worker", "sourceRegistry.js");
const physicsProviders = path.join(root, "worker", "physicsProviders.js");
const hosting = path.join(root, ".openai", "hosting.json");

for (const file of [index, worker, ingestion, sourceRegistry, physicsProviders, hosting]) {
  if (!existsSync(file)) throw new Error("Missing Sites build input: " + file);
}

mkdirSync(path.join(dist, "server"), { recursive: true });
mkdirSync(path.join(dist, ".openai"), { recursive: true });
copyFileSync(worker, path.join(dist, "server", "index.js"));
copyFileSync(ingestion, path.join(dist, "server", "ingestion.js"));
copyFileSync(sourceRegistry, path.join(dist, "server", "sourceRegistry.js"));
copyFileSync(physicsProviders, path.join(dist, "server", "physicsProviders.js"));
copyFileSync(hosting, path.join(dist, ".openai", "hosting.json"));

console.log("Prepared Sites build: executable dist/server worker modules and dist/.openai/hosting.json");
