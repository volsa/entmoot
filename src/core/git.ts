/**
 * Runs Git commands in an explicit directory and adds command context to failures.
 */

import { execFileSync } from "node:child_process";

const MAX_OUTPUT_BYTES = 64 * 1024 * 1024; // a large diff dwarfs the 1 MB default

export function runGit(cwd: string, ...args: string[]): string {
    try {
        return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: MAX_OUTPUT_BYTES }).trim();
    } catch (error) {
        throw new Error(`failed to run \`git ${args.join(" ")}\``, { cause: error });
    }
}
