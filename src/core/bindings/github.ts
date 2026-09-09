/**
 * Posts review results as pull request comments through the forge's REST API. GitHub and Gitea share the
 * endpoint and payload, so one binding serves both.
 */

import type { PullRequestOrigin } from "../context.js";

export async function postComment(origin: PullRequestOrigin, token: string, body: string): Promise<void> {
    const api = process.env.GITHUB_API_URL ?? "https://api.github.com";
    const response = await fetch(`${api}/repos/${origin.repo}/issues/${origin.number}/comments`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${token}`,
            accept: "application/vnd.github+json",
            "content-type": "application/json",
        },
        body: JSON.stringify({ body }),
    });

    if (!response.ok) {
        throw new Error(`failed to post the review comment (${response.status} ${response.statusText})`);
    }
}
