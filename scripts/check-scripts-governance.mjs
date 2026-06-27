import { createScriptsGovernanceReport } from "./lib/scripts-governance-core.mjs";

function printList(prefix, files, writer = console.log) {
  if (files.length === 0) {
    return;
  }
  writer(prefix);
  for (const file of files) {
    writer(`- ${file}`);
  }
}

function formatExtensions(extensions) {
  return extensions
    .map(([extension, count]) => `${extension}:${count}`)
    .join(", ");
}

function printReport(report) {
  if (report.trackedNewRootFiles.length > 0) {
    printList(
      "[scripts-governance] scripts root has new tracked files:",
      report.trackedNewRootFiles,
      console.error,
    );
  }

  if (report.trackedNewDirectories.length > 0) {
    printList(
      "[scripts-governance] scripts has new tracked first-level directories:",
      report.trackedNewDirectories,
      console.error,
    );
  }
  if (report.trackedPythonCacheFiles.length > 0) {
    printList(
      "[scripts-governance] scripts has tracked Python cache files:",
      report.trackedPythonCacheFiles,
      console.error,
    );
  }

  if (report.hasFailures) {
    console.error("");
    console.error(
      "Move new executable scripts under an existing scripts/<domain>/, scripts/lib/, or the owning package. Only update the scripts baseline when explicitly approving a root or domain exception.",
    );
    return;
  }

  console.log(
    `[scripts-governance] ok rootFiles=${report.rootFileCount} directories=${report.directoryCount} retiredRoot=${report.retiredRootFiles.length} retiredDirs=${report.retiredDirectories.length} untrackedRoot=${report.untrackedNewRootFiles.length} untrackedDirs=${report.untrackedNewDirectories.length} ignoredLocalFiles=${report.ignoredLocalFiles.length}`,
  );
  printList(
    "[scripts-governance] untracked root files are not baseline-approved:",
    report.untrackedNewRootFiles,
  );
  printList(
    "[scripts-governance] untracked first-level directories are not baseline-approved:",
    report.untrackedNewDirectories,
  );
  printList(
    "[scripts-governance] ignored local directories are present and must not be committed:",
    report.ignoredLocalDirectories,
  );
  printList(
    "[scripts-governance] ignored local Python cache files are present and must not be committed:",
    report.ignoredLocalFiles,
  );
  printList(
    "[scripts-governance] retired baseline root entries:",
    report.retiredRootFiles,
  );
  printList(
    "[scripts-governance] retired baseline directories:",
    report.retiredDirectories,
  );

  console.log(`[scripts-governance] policy: ${report.policy}`);
  console.log("[scripts-governance] root buckets:");
  for (const [bucket, count] of report.rootBucketCounts) {
    console.log(`- ${bucket}: ${count}`);
  }
  console.log("[scripts-governance] first-level directories:");
  for (const summary of report.directorySummaries) {
    console.log(
      `- ${summary.directory}: files=${summary.fileCount} ${formatExtensions(summary.extensions)}`,
    );
  }
}

const report = createScriptsGovernanceReport();
printReport(report);
if (report.hasFailures) {
  process.exit(1);
}
