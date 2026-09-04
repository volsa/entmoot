#!/usr/bin/env node

import { execFileSync } from "node:child_process";

import { Command } from "commander";

import { runInit } from "./cli/init.js";
import { runReview } from "./cli/review.js";

try {
    execFileSync("git", ["--version"], { stdio: "ignore" });
} catch (error) {
    throw new Error("failed to run git; make sure it's installed and on your PATH", {
        cause: error,
    });
}

const program = new Command();

program.name("entmoot").description("A read-only, skill-driven review harness").version("0.1.0");
program.command("init").description("Initialize Entmoot in your project").action(runInit);
program.command("review").description("Review the changes in this branch").action(runReview);

await program.parseAsync();
