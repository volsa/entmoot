/**
 * Resolves repository paths, review commits, change statistics, and local or pull request metadata.
 */

import { readFileSync } from "node:fs";

import { type Changes, summarizeChanges } from "./diff.js";
import { runGit } from "./git.js";

export type Context = {
    root: string;
    headSha: string;
    mergeBaseSha: string;
    changes: Changes;
    origin: LocalOrigin | PullRequestOrigin;
};

export type LocalOrigin = {
    kind: "local";
    baseRef: string;
    headRef: string;
    untracked: number;
};

export type PullRequestOrigin = {
    kind: "pull-request";
    host: "github" | "gitea";
    repo: string;
    number: number;
    baseRef: string;
    headRef: string;
    draft: boolean;
};

type Commits = Pick<Context, "headSha" | "mergeBaseSha" | "origin">;

export function resolveContext(base?: string): Context {
    const root = runGit(process.cwd(), "rev-parse", "--show-toplevel");
    const eventPath = process.env.GITHUB_EVENT_PATH;

    const commits = eventPath ? resolvePullRequest(root, eventPath) : resolveLocal(root, base);
    const changes = summarizeChanges(root, commits);

    return { root, ...commits, changes };
}

function resolveLocal(root: string, base?: string): Commits {
    // Resolve branch names
    const baseRef = base ?? defaultBranch(root);
    const headRef = runGit(root, "rev-parse", "--abbrev-ref", "HEAD");

    const baseSha = runGit(root, "rev-parse", baseRef);
    const headSha = runGit(root, "rev-parse", "HEAD");
    const mergeBaseSha = runGit(root, "merge-base", baseSha, headSha);

    const status = runGit(root, "status", "--porcelain").split("\n");
    const untracked = status.filter((line) => line.startsWith("??")).length;

    return {
        headSha,
        mergeBaseSha,
        origin: { kind: "local", baseRef, headRef, untracked },
    };
}

function resolvePullRequest(root: string, eventPath: string): Commits {
    const event = JSON.parse(readFileSync(eventPath, "utf8"));
    const pullRequest = event.pull_request;

    // Validate the pull request and its source repository
    if (!pullRequest) {
        throw new Error("found no pull request in the event payload");
    }

    if (pullRequest.head?.repo?.full_name !== process.env.GITHUB_REPOSITORY) {
        throw new Error("refusing to review a pull request from another repository");
    }

    const baseRef = pullRequest.base.ref;
    const headSha = pullRequest.head.sha; // the event's frozen head, not the synthetic merge checkout
    const baseSha = runGit(root, "rev-parse", `origin/${baseRef}`);
    const mergeBaseSha = runGit(root, "merge-base", baseSha, headSha);

    return {
        headSha,
        mergeBaseSha,
        origin: {
            kind: "pull-request",
            host: process.env.GITEA_ACTIONS ? "gitea" : "github",
            repo: pullRequest.base.repo.full_name,
            number: pullRequest.number,
            baseRef,
            headRef: pullRequest.head.ref,
            draft: pullRequest.draft,
        },
    };
}

function defaultBranch(root: string): string {
    try {
        return runGit(root, "rev-parse", "--abbrev-ref", "origin/HEAD");
    } catch {
        throw new Error("failed to detect the default branch; try `git remote set-head origin --auto`");
    }
}
