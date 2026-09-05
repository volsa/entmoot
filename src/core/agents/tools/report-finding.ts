/**
 * Defines the finding schema and a Pi tool that records findings in an agent's collection.
 */

import { defineTool, type ToolDefinition } from "@earendil-works/pi-coding-agent";
import { type Static, Type } from "typebox";

const FINDING_SCHEMA = Type.Object({
    file: Type.String({ description: "Path relative to the repository root" }),
    line: Type.Integer({ description: "Line in the new version of the file" }),
    column: Type.Optional(Type.Integer()),
    severity: Type.Union([Type.Literal("P0"), Type.Literal("P1"), Type.Literal("P2"), Type.Literal("P3")]),
    message: Type.String({ description: "What is wrong, and why it matters" }),
});

export type Finding = Static<typeof FINDING_SCHEMA>;

const REPORT_FINDING_DESCRIPTION = [
    "Record one finding of your review, once per distinct problem.",
    "Severity: P0 must be fixed before merging, P1 should be fixed before merging, P2 should be fixed soon,",
    "P3 is a minor remark.",
].join(" ");

export function createReportFindingTool(findings: Finding[]): ToolDefinition<typeof FINDING_SCHEMA> {
    return defineTool({
        name: "report_finding",
        label: "Report finding",
        description: REPORT_FINDING_DESCRIPTION,
        parameters: FINDING_SCHEMA,
        execute: async (_toolCallId, finding) => {
            findings.push(finding);
            return { content: [{ type: "text", text: `recorded finding #${findings.length}` }], details: {} };
        },
    });
}
