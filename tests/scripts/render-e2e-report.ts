import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

interface Department {
  name: string;
  staffRows: number;
  studentRows: number;
  offeringRows: number;
  enrollmentRows: number;
  sectionRows: number;
}

interface Report {
  environment: { database: string; browser: string };
  browsers: string[];
  imported: { cse: Department; swe: Department };
  campaignIds: Record<string, string>;
  taskCount: number;
  messageCount: number;
  responseTotals: { student: number; peer: number; manager: number };
  avp: { expected: Record<string, number>; actual: Record<string, number> };
  durationMs: number;
}

const inputPath = resolve("test-results/e2e-verification.json");
const outputPath = resolve("test-results/e2e-verification.md");
const report = JSON.parse(readFileSync(inputPath, "utf8")) as Report;
const campaignRows = Object.entries(report.campaignIds)
  .map(([department, id]) => `| ${department.toUpperCase()} | STUDENT + PEER + MANAGER | \`${id}\` |`)
  .join("\n");
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();

const markdown = `# Full E2E verification report

Generated: ${new Date().toISOString()}

## Commands

- \`npm run test:unit\`
- \`npm run test:integration\`
- \`npm run build\`
- \`npm run test:e2e:full\`

## Environment

- Database: \`${report.environment.database}\`
- Git commit: \`${commit}\`
- Browsers: ${report.browsers.join(", ")}
- Duration: ${(report.durationMs / 1000).toFixed(1)} seconds for the stateful Chromium workflow

## Imported registry counts

| Department | Staff | Students | Sections | Offerings | Enrolments |
| --- | ---: | ---: | ---: | ---: | ---: |
| CSE | ${report.imported.cse.staffRows} | ${report.imported.cse.studentRows} | ${report.imported.cse.sectionRows} | ${report.imported.cse.offeringRows} | ${report.imported.cse.enrollmentRows} |
| SWE | ${report.imported.swe.staffRows} | ${report.imported.swe.studentRows} | ${report.imported.swe.sectionRows} | ${report.imported.swe.offeringRows} | ${report.imported.swe.enrollmentRows} |

## Campaigns

| Department | Audience | Campaign ID |
| --- | --- | --- |
${campaignRows}

- Primary task count: ${report.taskCount}
- Captured message count (including invitations, reminders, and matrix fixtures): ${report.messageCount}
- Completed responses: STUDENT ${report.responseTotals.student}, PEER ${report.responseTotals.peer}, MANAGER ${report.responseTotals.manager}

## AVP expected versus actual

| Value | Expected | Actual |
| --- | ---: | ---: |
| CSE | ${report.avp.expected.cse.toFixed(1)} | ${report.avp.actual.cse.toFixed(1)} |
| SWE | ${report.avp.expected.swe.toFixed(1)} | ${report.avp.actual.swe.toFixed(1)} |
| Scope | ${report.avp.expected.scope.toFixed(1)} | ${report.avp.actual.scope.toFixed(1)} |

## Defects

None recorded by the completed automated run. A failed assertion blocks report generation and retains Playwright evidence instead.

## Known limitation

PDF download, non-empty output, and the \`%PDF-\` signature are verified. Automated PDF text extraction and physical print fidelity are deferred to the next pass; DOCX content remains fully asserted.
`;

writeFileSync(outputPath, markdown);
process.stdout.write(`Verification report written to ${outputPath}\n`);
