/**
 * Loads provider and forge credentials from the environment and verifies them with the provider. Exactly one
 * provider key may be set, the provider being chosen by whichever key is present.
 */

import { existsSync } from "node:fs";

export type Provider = keyof typeof PROVIDERS;

export type Credentials = {
    provider: Provider;
    apiKey: string;
    github: string | undefined;
};

type ProviderAuth = {
    name: string;
    variable: string; // environment variable holding the API key
    url: string; // authenticated endpoint that verifies the key without spending tokens
};

// TODO: let a config option choose the provider once one exists, instead of rejecting several keys. For
//       example a `providers=openai,openrouter` in entmoot.toml once that exists.
export const PROVIDERS = {
    openrouter: {
        name: "OpenRouter",
        variable: "ENTMOOT_OPENROUTER_API_KEY",
        url: "https://openrouter.ai/api/v1/key",
    },
    openai: {
        name: "OpenAI",
        variable: "ENTMOOT_OPENAI_API_KEY",
        url: "https://api.openai.com/v1/models",
    },
} as const satisfies Record<string, ProviderAuth>;

export function loadCredentials(pullRequest: boolean): Credentials {
    // Load local environment defaults
    if (existsSync(".env")) {
        process.loadEnvFile(".env");
    }

    // Select the single provider whose key is set
    const providers = Object.keys(PROVIDERS) as Provider[];
    const found = providers.flatMap((provider) => {
        const apiKey = process.env[PROVIDERS[provider].variable];
        return apiKey ? [{ provider, apiKey }] : [];
    });

    const [selected, ...extra] = found;
    if (selected === undefined) {
        throw new Error(`missing a provider API key in the environment; set one of ${variables(providers)}`);
    }

    if (extra.length > 0) {
        const set = variables(found.map((entry) => entry.provider));
        throw new Error(`found ${set} in the environment; set exactly one provider API key`);
    }

    const github = process.env.GITHUB_TOKEN;
    if (pullRequest && !github) {
        throw new Error("missing GITHUB_TOKEN in the environment");
    }

    return { ...selected, github };
}

export async function verifyCredentials(credentials: Credentials): Promise<void> {
    const { name, variable, url } = PROVIDERS[credentials.provider];
    const response = await fetch(url, { headers: { authorization: `Bearer ${credentials.apiKey}` } });

    if (!response.ok) {
        throw new Error(`${name} rejected ${variable} (${response.status} ${response.statusText})`);
    }
}

function variables(providers: Provider[]): string {
    return providers.map((provider) => PROVIDERS[provider].variable).join(", ");
}
