import fs from "node:fs";
import path from "node:path";
import process from "node:process";

export function resolveToolExecutionEvidencePath(args, defaultOutput) {
  const index = args.indexOf("--output");
  return index >= 0 && args[index + 1]
    ? path.resolve(process.cwd(), String(args[index + 1]))
    : defaultOutput;
}

export function readToolExecutionEvidence(outputPath) {
  const evidence = JSON.parse(fs.readFileSync(outputPath, "utf8"));
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error(`tool execution evidence 结构非法: ${outputPath}`);
  }
  return evidence;
}

export function writeToolExecutionEvidence(outputPath, evidence) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
}

export function screenshotPathForEvidence(outputPath, stage = "visible-dom") {
  const extension = path.extname(outputPath);
  const stem = extension ? outputPath.slice(0, -extension.length) : outputPath;
  return `${stem}-${stage}.png`;
}
