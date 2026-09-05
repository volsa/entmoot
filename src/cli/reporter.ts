/**
 * Renders review progress, diagnostics, and findings as log lines, and a finished run as a Markdown pull
 * request comment. Colors and spinners appear only when a terminal is attached so that CI logs stay plain.
 */

import { relative } from "node:path";

import { getModels } from "../core/agents/model.js";
import type { AgentResult, AgentStats } from "../core/agents/pi.js";
import type { Finding } from "../core/agents/tools/report-finding.js";
import type { Context } from "../core/context.js";
import type { Diagnostic, Skill } from "../core/skills.js";

export type Reporter = {
    printCredentials(): void;
    printChanges(): void;
    printSkills(skills: Skill[], skillRoot: string | undefined, diagnostics: Diagnostic[]): Progress;
    printFindings(results: AgentResult[], elapsedMs: number): void;
    formatComment(results: AgentResult[], elapsedMs: number): string;
};

export type Progress = {
    update(skill: Skill, stats: AgentStats): void;
    settle(skill: Skill, ok: boolean): void;
};

type Row = {
    skill: Skill;
    model: string;
    stats: AgentStats;
    state: "running" | "ok" | "failed";
};

type Summary = {
    findings: Finding[];
    notes: string[];
    headline: string;
};

const TTY = process.stdout.isTTY === true;
const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const FRAME_MS = 80;

const green = (text: string): string => paint("32", text);
const red = (text: string): string => paint("31", text);
const orange = (text: string): string => paint("38;5;208", text);
const gray = (text: string): string => paint("90", text);

export function createReporter(context: Context): Reporter {
    const { origin, changes } = context;
    const head = origin.kind === "local" ? `the working tree of ${origin.headRef}` : origin.headRef;
    const branches = `between ${origin.baseRef} and ${head}`;

    return {
        printCredentials() {
            console.log("Found OpenRouter API key");
        },

        printChanges() {
            if (changes.files === 0) {
                console.log(`Found no changes ${branches}`);
            } else {
                const lines = `${green(`+${changes.added}`)}/${red(`-${changes.removed}`)}`;
                console.log(`Found ${lines} changes across ${plural(changes.files, "file")} ${branches}`);
            }

            if (origin.kind === "local" && origin.untracked > 0) {
                const files = plural(origin.untracked, "untracked file");
                warn(`Found ${files}, ignored by Entmoot. Use \`git add\` to include them in the review`);
            }
        },

        printSkills(skills: Skill[], skillRoot: string | undefined, diagnostics: Diagnostic[]) {
            if (skillRoot === undefined) {
                warn("found no `.agents/skills` or `.claude/skills` directory");
            }

            for (const diagnostic of diagnostics) {
                const message = `${relative(context.root, diagnostic.path)}: ${diagnostic.message}`;
                (diagnostic.kind === "error" ? fail : warn)(message);
            }

            console.log(`Found ${plural(skills.length, "Entmoot skill")}`);

            // Separate the run's progress rows from the information above
            if (skills.length > 0) {
                console.log();
            }

            const rows: Row[] = skills.map((skill) => {
                const choice = getModels()[skill.entmoot.mode];
                const model = `${choice.provider}:${choice.model}/${choice.effort}`;
                return { skill, model, stats: { cost: 0, findings: 0 }, state: "running" };
            });

            if (!TTY || rows.length === 0) {
                for (const row of rows) {
                    console.log(`${row.skill.name}  ${row.model}`);
                }
                return { update() {}, settle() {} };
            }

            return animate(rows);
        },

        printFindings(results: AgentResult[], elapsedMs: number) {
            const { findings, notes, headline } = summarize(results, elapsedMs);

            console.log(`\n${headline}${findings.length === 0 ? "" : ":"}`);
            for (const finding of findings) {
                console.log(`${finding.severity}  ${location(finding)}  ${finding.message}`);
            }

            if (notes.length > 0) {
                console.log("\nNotes:");
                for (const note of notes) {
                    console.log(orange(`- ${note}`));
                }
            }
        },

        formatComment(results: AgentResult[], elapsedMs: number) {
            const { findings, notes, headline } = summarize(results, elapsedMs);

            // One paragraph per line, since Markdown merges adjacent lines
            const base = `\`${context.mergeBaseSha.slice(0, 7)}\` (${origin.baseRef})`;
            const tip = `\`${context.headSha.slice(0, 7)}\` (${origin.headRef})`;
            const colon = findings.length === 0 ? "" : ":";
            const remarks =
                notes.length === 0 ? [] : [["**Notes:**", ...notes.map((note) => `- ${note}`)].join("\n")];

            return [
                `**${headline}** between ${base} and ${tip}${colon}`,
                ...findings.map(
                    (finding) => `**${finding.severity}** \`${location(finding)}\` ${finding.message}`,
                ),
                ...remarks,
            ].join("\n\n");
        },
    };
}

function summarize(results: AgentResult[], elapsedMs: number): Summary {
    const findings = results
        .flatMap((result) => result.findings)
        .toSorted((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
    const failures = results.filter((result) => result.error !== undefined);

    // Remarks about skills that failed or stopped early
    const notes = results.flatMap((result) => [
        ...(result.error === undefined ? [] : [`${result.skill.name} failed: ${result.error}`]),
        ...(result.note === undefined ? [] : [`${result.skill.name} ${result.note}`]),
    ]);

    const cost = results.reduce((sum, result) => sum + result.cost, 0);
    const failed = failures.length === 0 ? "" : `, ${plural(failures.length, "skill")} failed`;
    const headline = `${plural(findings.length, "finding")} in ${duration(elapsedMs)} for $${cost.toFixed(2)}${failed}`;

    return { findings, notes, headline };
}

function location(finding: Finding): string {
    const column = finding.column === undefined ? "" : `:${finding.column}`;
    return `${finding.file}:${finding.line}${column}`;
}

function animate(rows: Row[]): Progress {
    let frame = 0;
    const nameWidth = Math.max(...rows.map((row) => row.skill.name.length));
    const modelWidth = Math.max(...rows.map((row) => row.model.length));

    // Redraws every row in place with its live stats, the cursor resting below the last one
    const render = (): void => {
        for (const row of rows) {
            const icon =
                row.state === "running"
                    ? FRAMES[frame % FRAMES.length]
                    : row.state === "ok"
                      ? green("✓")
                      : red("✗");
            const name = row.skill.name.padEnd(nameWidth);
            const model = gray(row.model.padEnd(modelWidth));
            const cost = gray(`$${row.stats.cost.toFixed(2)}`);
            const findings = row.stats.findings === 0 ? "" : `  ${plural(row.stats.findings, "finding")}`;
            process.stdout.write(`${icon} ${name}  ${model}  ${cost}${findings}\x1b[K\n`);
        }
    };
    const redraw = (): void => {
        process.stdout.write(`\x1b[${rows.length}A`);
        render();
    };

    // Hide the cursor while animating and restore it on any way out, including Ctrl+C
    const showCursor = (): void => {
        process.stdout.write("\x1b[?25h");
    };
    const interrupt = (): void => {
        process.exit(130); // a handled SIGINT no longer exits by itself, and exiting runs showCursor
    };
    process.stdout.write("\x1b[?25l");
    process.once("exit", showCursor);
    process.once("SIGINT", interrupt);

    render();
    const timer = setInterval(() => {
        frame++;
        redraw();
    }, FRAME_MS);

    return {
        update(skill, stats) {
            const row = rows.find((candidate) => candidate.skill === skill);
            if (row !== undefined) {
                row.stats = stats;
            }
        },

        settle(skill, ok) {
            const row = rows.find((candidate) => candidate.skill === skill);
            if (row === undefined) {
                return;
            }
            row.state = ok ? "ok" : "failed";

            // Stop animating once every skill has settled
            if (rows.every((candidate) => candidate.state !== "running")) {
                clearInterval(timer);
                redraw();
                showCursor();
                process.off("exit", showCursor);
                process.off("SIGINT", interrupt);
            }
        },
    };
}

function warn(message: string): void {
    console.log(TTY ? orange(message) : `! ${message}`); // color replaces the marker
}

function fail(message: string): void {
    console.log(red(`x ${message}`));
}

function paint(code: string, text: string): string {
    return TTY ? `\x1b[${code}m${text}\x1b[0m` : text;
}

function plural(count: number, noun: string): string {
    return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function duration(ms: number): string {
    const seconds = Math.round(ms / 1000);
    return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
