import fs from "node:fs";
import path from "node:path";

import {
  CONTENT_FACTORY_SIGNED_RELEASE_GATE_RESULT_FILE_NAME,
  CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES,
  readOptionalJsonFile,
} from "./plugin-content-factory-signed-release-gate-core.mjs";

function assertEvidenceDir(dirPath) {
  if (!dirPath) {
    throw new Error("--evidence-dir is required");
  }
  const resolvedDir = path.resolve(process.cwd(), dirPath);
  const stat = fs.existsSync(resolvedDir) ? fs.statSync(resolvedDir) : null;
  if (!stat?.isDirectory()) {
    throw new Error(`production evidence dir missing: ${resolvedDir}`);
  }
  return resolvedDir;
}

export function readContentFactorySignedReleaseEvidenceDir(dirPath) {
  const dir = assertEvidenceDir(dirPath);
  const fileNames = CONTENT_FACTORY_SIGNED_RELEASE_GATE_TEMPLATE_FILE_NAMES;
  const files = {
    bootstrap: path.join(dir, fileNames.bootstrap),
    catalog: path.join(dir, fileNames.catalog),
    fetchCloud: path.join(dir, fileNames.fetchCloud),
    guiEvidence: path.join(dir, fileNames.guiEvidence),
    preflight: path.join(dir, fileNames.preflight),
    result: path.join(
      dir,
      CONTENT_FACTORY_SIGNED_RELEASE_GATE_RESULT_FILE_NAME,
    ),
  };

  return {
    dir,
    files,
    evidence: {
      bootstrap: readOptionalJsonFile(files.bootstrap),
      catalog: readOptionalJsonFile(files.catalog),
      fetchCloud: readOptionalJsonFile(files.fetchCloud),
      guiEvidence: readOptionalJsonFile(files.guiEvidence),
      preflight: readOptionalJsonFile(files.preflight),
    },
  };
}
