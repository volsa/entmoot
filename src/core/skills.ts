/**
 * Discovery of the skills that take part in a review.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "yaml";

export type Skill = {
    path: string;
    name: string;
    description: string;
    entmoot: EntmootConfig;
    content: string;
};

export type EntmootConfig = {
    mode: "fast" | "deep";
};

export type Diagnostic = {
    kind: "warning" | "error";
    path: string;
    message: string;
};

type Frontmatter = Omit<Skill, "path" | "content">;

const SKILL_ROOT_CANDIDATES = [".agents/skills", ".claude/skills"];

export function getSkills(projectRoot: string): {
    skills: Skill[];
    skillRoot: string | undefined;
    diagnostics: Diagnostic[];
} {
    const diagnostics: Diagnostic[] = [];

    // Find the preferred skill root
    const root = SKILL_ROOT_CANDIDATES.find((candidate) =>
        statSync(join(projectRoot, candidate), { throwIfNoEntry: false })?.isDirectory(),
    );

    if (root === undefined) {
        return { skills: [], skillRoot: undefined, diagnostics };
    }

    // Parse skills in the selected root
    const skillRoot = join(projectRoot, root);
    const skills = parseSkills(skillRoot, diagnostics);

    return { skills, skillRoot, diagnostics };
}

function parseSkills(skillRoot: string, diagnostics: Diagnostic[]): Skill[] {
    const skills: Skill[] = [];

    // Read skills in directory order
    for (const entry of readdirSync(skillRoot).sort()) {
        const path = join(skillRoot, entry, "SKILL.md");
        if (!statSync(path, { throwIfNoEntry: false })?.isFile()) {
            continue;
        }

        // Read the skill file
        let source: string;
        try {
            source = readFileSync(path, "utf8");
        } catch (cause) {
            const reason = cause instanceof Error ? cause.message : cause;
            diagnostics.push(error(path, `failed to read skill file: ${reason}`));
            continue;
        }

        // Split the frontmatter from the Markdown body
        if (source.charCodeAt(0) === 0xfeff) {
            source = source.slice(1);
        }

        if (!/^---\r?\n/.test(source)) {
            diagnostics.push(error(path, "skill file must begin with a `---` frontmatter delimiter"));
            continue;
        }

        const match = /^---\r?\n([\s\S]*?)^---\r?(?:\n|$)/m.exec(source);
        if (match === null) {
            diagnostics.push(error(path, "skill frontmatter is missing its closing `---` delimiter"));
            continue;
        }

        // Parse and validate the frontmatter
        const frontmatter = parseFrontmatter(match[1] ?? "", path, diagnostics);
        if (frontmatter === undefined) {
            continue;
        }

        skills.push({ path, ...frontmatter, content: source.slice(match[0].length) });
    }

    return skills;
}

function parseFrontmatter(source: string, path: string, diagnostics: Diagnostic[]): Frontmatter | undefined {
    // Parse YAML and collect diagnostics
    const document = parseDocument(source);
    diagnostics.push(
        ...document.warnings.map((issue) => warning(path, issue.message)),
        ...document.errors.map((issue) => error(path, issue.message)),
    );

    if (document.errors.length > 0) {
        return undefined;
    }

    const fields: unknown = document.toJS();
    if (!isRecord(fields)) {
        diagnostics.push(error(path, "skill frontmatter must be a YAML object"));
        return undefined;
    }

    // Skip skills without review configuration
    if (fields.entmoot === undefined) {
        return undefined;
    }

    // Validate all required fields
    const name = parseRequiredString(fields.name, "name", path, diagnostics);
    const description = parseRequiredString(fields.description, "description", path, diagnostics);
    const entmoot = parseEntmootConfig(fields.entmoot, path, diagnostics);

    if (name === undefined || description === undefined || entmoot === undefined) {
        return undefined;
    }

    return { name, description, entmoot };
}

function parseRequiredString(
    value: unknown,
    field: string,
    path: string,
    diagnostics: Diagnostic[],
): string | undefined {
    if (typeof value !== "string" || value.trim() === "") {
        diagnostics.push(error(path, `skill \`${field}\` must be a non-empty string`));
        return undefined;
    }

    return value.trim();
}

function parseEntmootConfig(
    value: unknown,
    path: string,
    diagnostics: Diagnostic[],
): EntmootConfig | undefined {
    if (!isRecord(value)) {
        diagnostics.push(error(path, "skill `entmoot` must be an object with a `mode` field"));
        return undefined;
    }

    // Warn about unknown options
    for (const key of Object.keys(value)) {
        if (key !== "mode") {
            diagnostics.push(warning(path, `unknown entmoot option \`${key}\``));
        }
    }

    // Normalize and validate the review mode
    const mode = typeof value.mode === "string" ? value.mode.trim().toLowerCase() : undefined;
    if (mode !== "fast" && mode !== "deep") {
        diagnostics.push(error(path, "skill `entmoot.mode` must be `fast` or `deep`"));
        return undefined;
    }

    return { mode };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function error(path: string, message: string): Diagnostic {
    return { kind: "error", path, message };
}

function warning(path: string, message: string): Diagnostic {
    return { kind: "warning", path, message };
}
