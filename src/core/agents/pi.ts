/**
 * Runs review skills in separate Pi sessions and collects findings and failures.
 */

import { tmpdir } from "node:os";
import { join } from "node:path";

import { type AssistantMessage, clampThinkingLevel, InMemoryCredentialStore } from "@earendil-works/pi-ai";
import {
    createAgentSession,
    DefaultResourceLoader,
    ModelRuntime,
    SessionManager,
    SettingsManager,
} from "@earendil-works/pi-coding-agent";

import type { Context } from "../context.js";
import type { Credentials } from "../credentials.js";
import type { Skill } from "../skills.js";
import { getModels, type Mode } from "./model.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import { createReportFindingTool, type Finding } from "./tools/report-finding.js";

export type AgentResult = {
    skill: Skill;
    findings: Finding[];
    cost: number;
    error?: string;
    note?: string;
};

export type AgentStats = {
    cost: number;
    findings: number;
};

export type AgentRunner = {
    run(
        skill: Skill,
        context: Context,
        diff: string,
        onProgress: (stats: AgentStats) => void,
    ): Promise<AgentResult>;
};

const READ_ONLY_TOOLS = ["read", "grep", "find", "ls"];
// TODO: make the budget configurable, track it across all agents rather than per agent, and apply it to pull
// request runs only, since local runs will sit on a subscription rather than pay per token
const BUDGET_USD = 5;

export async function prepare(credentials: Credentials): Promise<AgentRunner> {
    // Configure Pi with in-memory credentials
    const modelRuntime = await ModelRuntime.create({
        credentials: new InMemoryCredentialStore(),
        modelsPath: null,
    });
    await modelRuntime.setRuntimeApiKey("openrouter", credentials.openrouter);

    // Validate configured models before starting agents
    const choices = getModels();
    const errors: string[] = [];

    for (const mode of Object.keys(choices) as Mode[]) {
        const choice = choices[mode];
        const model = modelRuntime.getModel(choice.provider, choice.model);

        if (model === undefined) {
            errors.push(`${mode}: unknown model ${choice.provider}/${choice.model}`);
            continue;
        }

        if (clampThinkingLevel(model, choice.effort) !== choice.effort) {
            errors.push(`${mode}: ${choice.model} does not support effort ${choice.effort}`);
        }
    }

    if (errors.length > 0) {
        throw new Error(errors.join("\n"));
    }

    return {
        run: (skill, context, diff, onProgress) => runAgent(modelRuntime, skill, context, diff, onProgress),
    };
}

async function runAgent(
    modelRuntime: ModelRuntime,
    skill: Skill,
    context: Context,
    diff: string,
    onProgress: (stats: AgentStats) => void,
): Promise<AgentResult> {
    // Create the agent's findings collection and reporting tool
    const findings: Finding[] = [];
    const reportFinding = createReportFindingTool(findings);

    try {
        const choice = getModels()[skill.entmoot.mode];
        const model = modelRuntime.getModel(choice.provider, choice.model);
        if (model === undefined) {
            throw new Error(`unreachable: missing model ${choice.provider}/${choice.model}`);
        }

        // Configure skill prompts without automatic resource discovery
        const resourceLoader = new DefaultResourceLoader({
            cwd: context.root,
            agentDir: join(tmpdir(), "entmoot-pi"), // avoids the user's ~/.pi/agent directory
            settingsManager: SettingsManager.inMemory(),
            noExtensions: true,
            noSkills: true,
            noPromptTemplates: true,
            noThemes: true,
            noContextFiles: true,
            systemPromptOverride: () => buildSystemPrompt(skill, READ_ONLY_TOOLS, reportFinding.name),
            appendSystemPromptOverride: () => [],
        });
        await resourceLoader.reload();

        const { session } = await createAgentSession({
            cwd: context.root,
            model,
            thinkingLevel: choice.effort,
            modelRuntime,
            tools: [...READ_ONLY_TOOLS, reportFinding.name],
            customTools: [reportFinding],
            resourceLoader,
            sessionManager: SessionManager.inMemory(context.root),
            settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
        });

        // Report the running cost and finding count after every model turn and tool call, stopping past the budget
        let overBudget = false;
        const cost = (): number =>
            session.messages.reduce(
                (sum, message) => (message.role === "assistant" ? sum + message.usage.cost.total : sum),
                0,
            );
        const report = (): void => {
            onProgress({ cost: cost(), findings: findings.length });

            if (!overBudget && cost() > BUDGET_USD) {
                overBudget = true;
                void session.abort();
            }
        };
        const unsubscribe = session.subscribe((event) => {
            if (event.type === "turn_end" || event.type === "tool_execution_end") {
                report();
            }
        });
        report();

        try {
            await session.prompt(buildUserPrompt(diff));

            // Collect the final agent status
            const last = session.messages.findLast(
                (message): message is AssistantMessage => message.role === "assistant",
            ); // includes provider errors
            const failed = last?.stopReason === "error" || (last?.stopReason === "aborted" && !overBudget);
            const error = failed ? (last.errorMessage ?? `model stopped with ${last.stopReason}`) : undefined;
            const note = overBudget ? `ran out of budget at $${BUDGET_USD}, findings are partial` : undefined;

            return { skill, findings, cost: cost(), error, note };
        } finally {
            unsubscribe();
            session.dispose();
        }
    } catch (cause) {
        const error = cause instanceof Error ? cause.message : String(cause);
        return { skill, findings, cost: 0, error }; // failed before the session produced any usage
    }
}
