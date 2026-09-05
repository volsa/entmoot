#!/usr/bin/env node

import { execFileSync } from "node:child_process";

import { Command } from "commander";

import { runInit } from "./cli/init.js";
import { runReview } from "./cli/review.js";

const program = new Command();

program.name("entmoot").description("A read-only, skill-driven review harness").version("0.1.0");
program.command("init").description("Initialize Entmoot in your project").action(runInit);
program.command("review").description("Review the changes in this branch").action(runReview);

// Report failures as a single message instead of a stack trace
try {
    try {
        execFileSync("git", ["--version"], { stdio: "ignore" });
    } catch (error) {
        throw new Error("failed to run git; make sure it's installed and on your PATH", { cause: error });
    }

    await program.parseAsync();
} catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).replaceAll("\n", "\n  ");
    const label = process.stderr.isTTY ? "\x1b[31mError:\x1b[0m" : "Error:";
    console.error(`${label} ${message}`);
    process.exit(1);
}
