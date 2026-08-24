#!/usr/bin/env node
import { runCli } from "./verify-live-backend.mjs";

await runCli(process.argv.slice(2));
