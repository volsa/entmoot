/**
 * Loads provider and forge credentials from the environment and verifies them with the provider.
 */

import { existsSync } from "node:fs";

export type Credentials = {
    openrouter: string;
    github: string | undefined;
};

export function loadCredentials(pullRequest: boolean): Credentials {
    // Load local environment defaults
    if (existsSync(".env")) {
        process.loadEnvFile(".env");
    }

    const openrouter = process.env.ENTMOOT_OPENROUTER_API_KEY;
    if (!openrouter) {
        throw new Error("missing ENTMOOT_OPENROUTER_API_KEY in the environment");
    }

    const github = process.env.GITHUB_TOKEN;
    if (pullRequest && !github) {
        throw new Error("missing GITHUB_TOKEN in the environment");
    }

    return { openrouter, github };
}

export async function verifyCredentials(credentials: Credentials): Promise<void> {
    const response = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { authorization: `Bearer ${credentials.openrouter}` },
    }); // verifies without spending tokens

    if (!response.ok) {
        throw new Error(
            `OpenRouter rejected ENTMOOT_OPENROUTER_API_KEY (${response.status} ${response.statusText})`,
        );
    }
}
