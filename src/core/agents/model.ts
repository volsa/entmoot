/**
 * Maps review modes to provider, model, and reasoning settings.
 */

export type ModelChoice = {
    provider: "openrouter";
    model: string;
    effort: "off" | "low" | "medium" | "high" | "max";
};

export type Mode = keyof typeof MODELS;

const MODELS = Object.freeze({
    fast: { provider: "openrouter", model: "openai/gpt-5.6-luna", effort: "max" },
    deep: { provider: "openrouter", model: "openai/gpt-5.6-luna", effort: "max" },
} as const satisfies Record<string, ModelChoice>);

export function getModels(): Readonly<Record<Mode, ModelChoice>> {
    return MODELS;
}
