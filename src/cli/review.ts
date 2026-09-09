/**
 * Coordinates branch review and reports progress and findings, posting them to the pull request when run
 * from one.
 */

import { prepare } from "../core/agents/pi.js";
import { postComment } from "../core/bindings/github.js";
import { resolveContext } from "../core/context.js";
import { loadCredentials, verifyCredentials } from "../core/credentials.js";
import { resolveDiff } from "../core/diff.js";
import { getSkills } from "../core/skills.js";
import { createReporter } from "./reporter.js";

export async function runReview(): Promise<void> {
    const started = Date.now();
    const context = resolveContext();
    const credentials = loadCredentials(context.origin.kind === "pull-request");

    const reporter = createReporter(context, credentials.provider);
    reporter.printCredentials();

    // Stop when there is nothing to review
    reporter.printChanges();
    if (context.changes.files === 0) {
        return;
    }

    await verifyCredentials(credentials);

    // Prepare everything that can fail before the progress rows start animating
    const runner = await prepare(credentials);
    const diff = resolveDiff(context.root, context);

    const { skills, skillRoot, diagnostics } = getSkills(context.root);
    const progress = reporter.printSkills(skills, skillRoot, diagnostics);

    // Run review skills, settling each one's progress as it finishes
    const results = await Promise.all(
        skills.map(async (skill) => {
            const result = await runner.run(skill, context, diff, (stats) => progress.update(skill, stats));
            progress.settle(skill, result.error === undefined);
            return result;
        }),
    );

    const elapsed = Date.now() - started;
    reporter.printFindings(results, elapsed);

    // Publish to the pull request, loadCredentials having guaranteed the token
    if (context.origin.kind === "pull-request" && credentials.github !== undefined) {
        await postComment(context.origin, credentials.github, reporter.formatComment(results, elapsed));
    }

    // Fail the run when a skill never completed its review
    if (results.some((result) => result.error !== undefined)) {
        process.exitCode = 1;
    }
}
