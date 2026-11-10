import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseOperation } from "../src/api.js";

/**
 * The READMEs are the Marketplace page: they must list the operations that
 * action.yml declares, under the name people type in `uses:`.
 */

const READMES = ["README.md", "README.fr.md", "README.es.md"];

function read(name: string): string {
  return readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), "utf8");
}

/** Folded description (`>-`) or single-line description of an input in action.yml. */
function inputDescription(actionYml: string, input: string): string {
  const folded = new RegExp(
    `^  ${input}:\\r?\\n    description: >-\\r?\\n((?:      .*\\r?\\n)+)`,
    "m",
  ).exec(actionYml);
  const inline = new RegExp(`^  ${input}:\\r?\\n    description: (?!>)(.+)$`, "m").exec(actionYml);
  return (folded?.[1] ?? inline?.[1] ?? "").replace(/\s+/g, " ").trim();
}

/** Cells of the row of the inputs table that documents `input`. */
function inputRow(readme: string, input: string): string[] {
  const row = readme.split(/\r?\n/).find((line) => line.startsWith(`| \`${input}\` |`)) ?? "";
  return row.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

function codeSpans(text: string): string[] {
  return [...text.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? "");
}

const actionYml = read("action.yml");
const operations = inputDescription(actionYml, "operation")
  .replace(/^One of /, "")
  .split("|")
  .map((op) => op.trim());
const scenarioIdOperations = operations.filter((op) =>
  inputDescription(actionYml, "scenario_id").split(/[\s/]+/).includes(op),
);

describe("action.yml", () => {
  it("declares operations that the code accepts", () => {
    expect(operations.length).toBeGreaterThan(1);
    for (const op of operations) {
      expect(parseOperation(op)).toBe(op);
    }
  });

  it("names the operations that take scenario_id", () => {
    expect(scenarioIdOperations).toContain("assert-scenario");
    expect(scenarioIdOperations).toContain("run-scenario");
  });
});

describe.each(READMES)("%s", (name) => {
  const readme = read(name);

  it("lists exactly the operations of action.yml in the inputs table", () => {
    const cells = inputRow(readme, "operation");
    expect(cells).toHaveLength(6);
    expect(codeSpans(cells[4] ?? "")).toEqual(operations);
  });

  it("names every operation that takes scenario_id in the inputs table", () => {
    const row = inputRow(readme, "scenario_id").join(" ");
    for (const op of scenarioIdOperations) {
      expect(row).toContain(`\`${op}\``);
    }
  });

  it("uses the published names of the action and of the npm package", () => {
    expect(readme).not.toContain("pathlyhq/setup-pathly");
    expect(readme).not.toContain("@pathlyhq/sdk");
    expect(readme).toContain("uses: pathlyhq/pathly-action@v1");
  });
});
