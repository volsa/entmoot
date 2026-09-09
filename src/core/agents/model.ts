/**
 * Maps providers and review modes to model and reasoning settings.
 */

import type { Provider } from "../credentials.js";

export type Mode = "fast" | "deep";

export type ModelChoice = {
    provider: Provider;
    model: string;
    effort: Effort;
};

type Effort = "off" | "low" | "medium" | "high" | "max";

const EFFORT = { fast: "max", deep: "max" } as const satisfies Record<Mode, Effort>;

const MODELS = {
    openrouter: { fast: "openai/gpt-5.6-luna", deep: "openai/gpt-5.6-luna" },
    openai: { fast: "gpt-5.6-luna", deep: "gpt-5.6-luna" },
} as const satisfies Record<Provider, Record<Mode, string>>;

export function getModels(provider: Provider): Readonly<Record<Mode, ModelChoice>> {
    const models = MODELS[provider];

    return {
        fast: { provider, model: models.fast, effort: EFFORT.fast },
        deep: { provider, model: models.deep, effort: EFFORT.deep },
    };
}
