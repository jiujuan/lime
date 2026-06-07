import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const SCRIPTS_DIR = "scripts";
const BASELINE_PATH = path.join(
  SCRIPTS_DIR,
  "script-root-governance-baseline.json",
);

function readBaseline() {
  const raw = fs.readFileSync(BASELINE_PATH, "utf8");
  const parsed = JSON.parse(raw);
  const allowedRootFiles = Array.isArray(parsed.allowedRootFiles)
    ? parsed.allowedRootFiles
    : [];
  return {
    policy: typeof parsed.policy === "string" ? parsed.policy : "",
    allowedRootFiles: new Set(allowedRootFiles),
  };
}

function listCurrentRootFiles() {
  return fs
    .readdirSync(SCRIPTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.posix.join(SCRIPTS_DIR, entry.name))
    .sort();
}

function listGitTrackedFiles() {
  try {
    const output = execFileSync("git", ["ls-files", "--", "scripts/*"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return new Set(
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((file) => file.replace(/\\/g, "/")),
    );
  } catch {
    return new Set();
  }
}

function inferBucket(filePath) {
  const fileName = path.basename(filePath);
  if (fileName === "README.md" || fileName.includes("governance")) {
    return "governance";
  }
  if (fileName.startsWith("i18n-") || fileName.includes("translation")) {
    return "i18n";
  }
  if (fileName.startsWith("electron-") || fileName.includes("electron")) {
    return "electron";
  }
  if (fileName.startsWith("agent-app")) {
    return "agent-app";
  }
  if (fileName.startsWith("agent-qc")) {
    return "agent-qc";
  }
  if (fileName.startsWith("agent-runtime") || fileName.startsWith("agent-")) {
    return "agent-runtime";
  }
  if (fileName.startsWith("app-server")) {
    return "app-server";
  }
  if (fileName.startsWith("harness-")) {
    return "harness";
  }
  if (fileName.includes("smoke") || fileName.includes("e2e")) {
    return "smoke";
  }
  if (
    fileName.startsWith("check-") ||
    fileName.startsWith("verify-") ||
    fileName.startsWith("quality-") ||
    fileName.startsWith("run-") ||
    fileName.startsWith("report-")
  ) {
    return "quality";
  }
  if (fileName.includes("release") || fileName.includes("updater")) {
    return "release";
  }
  return "misc";
}

function countByBucket(files) {
  const counts = new Map();
  for (const file of files) {
    const bucket = inferBucket(file);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
  }
  return [...counts.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

function main() {
  const baseline = readBaseline();
  const currentRootFiles = listCurrentRootFiles();
  const gitTrackedFiles = listGitTrackedFiles();
  const allowedRootFiles = baseline.allowedRootFiles;
  const newRootFiles = currentRootFiles.filter(
    (file) => !allowedRootFiles.has(file),
  );
  const trackedNewRootFiles = newRootFiles.filter((file) =>
    gitTrackedFiles.has(file),
  );
  const untrackedNewRootFiles = newRootFiles.filter(
    (file) => !gitTrackedFiles.has(file),
  );
  const retiredRootFiles = [...allowedRootFiles].filter(
    (file) => !currentRootFiles.includes(file),
  );
  const bucketCounts = countByBucket(currentRootFiles);

  if (trackedNewRootFiles.length > 0) {
    console.error("[scripts-governance] scripts root has new files:");
    for (const file of trackedNewRootFiles) {
      console.error(`- ${file}`);
    }
    console.error("");
    console.error(
      "Move new executable scripts under scripts/<domain>/, scripts/lib/, or the owning package. Only update the root baseline when intentionally shrinking or explicitly approving a root exception.",
    );
    process.exit(1);
  }

  console.log(
    `[scripts-governance] ok rootFiles=${currentRootFiles.length} retired=${retiredRootFiles.length} untrackedNew=${untrackedNewRootFiles.length}`,
  );
  if (untrackedNewRootFiles.length > 0) {
    console.warn(
      "[scripts-governance] untracked root files are not baseline-approved:",
    );
    for (const file of untrackedNewRootFiles) {
      console.warn(`- ${file}`);
    }
  }
  if (retiredRootFiles.length > 0) {
    console.log("[scripts-governance] retired baseline entries:");
    for (const file of retiredRootFiles) {
      console.log(`- ${file}`);
    }
  }
  console.log(
    `[scripts-governance] policy: ${baseline.policy || "scripts root is frozen"}`,
  );
  console.log("[scripts-governance] root buckets:");
  for (const [bucket, count] of bucketCounts) {
    console.log(`- ${bucket}: ${count}`);
  }
}

main();
