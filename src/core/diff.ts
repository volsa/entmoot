/**
 * Produces the review patch and its change statistics from one shared revision range, so that both always
 * describe the same changes. Local runs compare the working tree with the merge base to include uncommitted
 * work, while pull requests compare the event's frozen head.
 */

import type { Context } from "./context.js";
import { runGit } from "./git.js";

export type Changes = {
    files: number;
    added: number;
    removed: number;
};

export type Target = Pick<Context, "mergeBaseSha" | "headSha" | "origin">;

export function resolveDiff(root: string, target: Target): string {
    return runGit(
        root,
        "-c",
        "core.quotePath=false",
        "diff",
        "--no-color",
        "--no-ext-diff",
        "--no-textconv",
        "--find-renames",
        "--diff-algorithm=histogram",
        "--unified=3",
        ...revisions(target),
    );
}

export function summarizeChanges(root: string, target: Target): Changes {
    const output = runGit(root, "diff", "--numstat", "--find-renames", ...revisions(target));
    const changes = { files: 0, added: 0, removed: 0 };

    for (const line of output.split("\n").filter(Boolean)) {
        const [added, removed] = line.split("\t");
        changes.files++;
        changes.added += Number(added) || 0; // binary files report "-"
        changes.removed += Number(removed) || 0;
    }

    return changes;
}

function revisions({ mergeBaseSha, headSha, origin }: Target): string[] {
    return origin.kind === "local" ? [mergeBaseSha] : [mergeBaseSha, headSha];
}
