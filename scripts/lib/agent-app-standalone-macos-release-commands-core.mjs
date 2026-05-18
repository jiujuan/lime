import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function normalizeBoundaryPath(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/");
  if (normalized.length > 1 && normalized.endsWith("/")) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function hasTraversal(filePath) {
  return normalizeBoundaryPath(filePath).split("/").includes("..");
}

function isInsideOutputRoot(filePath, outputRoot) {
  const normalizedPath = normalizeBoundaryPath(filePath);
  const normalizedRoot = normalizeBoundaryPath(outputRoot);
  return (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot}/`)
  );
}

function shellQuote(value) {
  const text = String(value);
  return /^[A-Za-z0-9_./:=@+-]+$/.test(text)
    ? text
    : `'${text.replaceAll("'", "'\\''")}'`;
}

function artifactKey(artifact) {
  return artifact?.contentHash ?? artifact?.path;
}

function findArtifact(artifacts, kind) {
  return artifacts.find((artifact) => artifact?.kind === kind);
}

function signedPkgPath(pkgPath) {
  return pkgPath.endsWith(".pkg")
    ? pkgPath.replace(/\.pkg$/, ".signed.pkg")
    : `${pkgPath}.signed.pkg`;
}

function command(id, tool, args, inputRefs, outputRefs = []) {
  return {
    id,
    tool,
    args,
    display: [tool, ...args].map(shellQuote).join(" "),
    inputRefs,
    outputRefs,
  };
}

function validateArtifacts({ artifacts, outputRoot }) {
  const blockers = [];
  const normalizedOutputRoot = normalizeBoundaryPath(outputRoot);
  if (!normalizedOutputRoot) {
    blockers.push({
      code: "OUTPUT_ROOT_MISSING",
      message:
        "macOS release command planner requires a non-empty output root.",
    });
  }
  if (normalizedOutputRoot && hasTraversal(normalizedOutputRoot)) {
    blockers.push({
      code: "PATH_TRAVERSAL_DETECTED",
      message: "macOS release output root must not contain parent traversal.",
      details: { path: normalizedOutputRoot },
    });
  }
  for (const artifact of artifacts) {
    if (hasTraversal(artifact?.path)) {
      blockers.push({
        code: "PATH_TRAVERSAL_DETECTED",
        message:
          "macOS release artifact paths must not contain parent traversal.",
        details: { path: artifact?.path },
      });
    }
    if (
      normalizedOutputRoot &&
      artifact?.path &&
      !isInsideOutputRoot(artifact.path, normalizedOutputRoot)
    ) {
      blockers.push({
        code: "ARTIFACT_OUTSIDE_OUTPUT_ROOT",
        message:
          "macOS release command planner refuses artifacts outside output root.",
        details: { path: artifact.path, outputRoot: normalizedOutputRoot },
      });
    }
  }
  return { outputRoot: normalizedOutputRoot || undefined, blockers };
}

export function buildMacOsStandaloneReleaseCommandPlan({
  applicationSigningIdentity = "",
  artifacts = [],
  installerSigningIdentity = "",
  notarizationProfile = "",
  outputRoot,
  packageFormat = "app",
}) {
  const normalizedArtifacts = Array.isArray(artifacts) ? artifacts : [];
  const validation = validateArtifacts({
    artifacts: normalizedArtifacts,
    outputRoot,
  });
  const blockers = [...validation.blockers];
  const appBundle = findArtifact(normalizedArtifacts, "app_bundle");
  const distributableKind =
    packageFormat === "pkg"
      ? "pkg"
      : packageFormat === "dmg"
        ? "dmg"
        : "app_bundle";
  const distributable = findArtifact(normalizedArtifacts, distributableKind);

  if (!appBundle) {
    blockers.push({
      code: "APP_BUNDLE_ARTIFACT_MISSING",
      message: "macOS release signing requires the .app bundle artifact ref.",
    });
  }
  if (!distributable) {
    blockers.push({
      code: "DISTRIBUTABLE_ARTIFACT_MISSING",
      message:
        "macOS release notarization requires the target distributable artifact ref.",
      details: { expectedKind: distributableKind },
    });
  }
  if (!String(applicationSigningIdentity).trim()) {
    blockers.push({
      code: "APPLICATION_SIGNING_IDENTITY_MISSING",
      message:
        "macOS release command plan requires a Developer ID Application identity ref.",
    });
  }
  if (packageFormat === "pkg" && !String(installerSigningIdentity).trim()) {
    blockers.push({
      code: "INSTALLER_SIGNING_IDENTITY_MISSING",
      message:
        "pkg release command plan requires a Developer ID Installer identity ref.",
    });
  }
  if (!String(notarizationProfile).trim()) {
    blockers.push({
      code: "NOTARIZATION_PROFILE_MISSING",
      message:
        "macOS release command plan requires a notarytool keychain profile ref.",
    });
  }

  if (blockers.length > 0) {
    return {
      schemaVersion: 1,
      status: "blocked",
      readyToRun: false,
      outputRoot: validation.outputRoot,
      blockers,
      commands: [],
    };
  }

  const commands = [
    command(
      "codesign-app",
      "codesign",
      [
        "--force",
        "--timestamp",
        "--options",
        "runtime",
        "--sign",
        applicationSigningIdentity,
        appBundle.path,
      ],
      [artifactKey(appBundle)],
      [artifactKey(appBundle)],
    ),
  ];
  let notarizationTarget = distributable;
  if (packageFormat === "pkg") {
    const signedPath = signedPkgPath(distributable.path);
    const signedPkgRef = `${artifactKey(distributable)}:signed`;
    commands.push(
      command(
        "productsign-pkg",
        "productsign",
        ["--sign", installerSigningIdentity, distributable.path, signedPath],
        [artifactKey(distributable)],
        [signedPkgRef],
      ),
    );
    notarizationTarget = {
      ...distributable,
      path: signedPath,
      contentHash: signedPkgRef,
    };
  }
  commands.push(
    command(
      "notarytool-submit",
      "xcrun",
      [
        "notarytool",
        "submit",
        notarizationTarget.path,
        "--keychain-profile",
        notarizationProfile,
        "--wait",
      ],
      [artifactKey(notarizationTarget)],
      [`${artifactKey(notarizationTarget)}:notarized`],
    ),
  );
  commands.push(
    command(
      "stapler-staple",
      "xcrun",
      ["stapler", "staple", notarizationTarget.path],
      [`${artifactKey(notarizationTarget)}:notarized`],
      [`${artifactKey(notarizationTarget)}:stapled`],
    ),
  );

  return {
    schemaVersion: 1,
    status: "ready",
    readyToRun: true,
    releaseReadiness: "commands_only_not_executed",
    outputRoot: validation.outputRoot,
    packageFormat,
    appBundleRef: artifactKey(appBundle),
    distributableRef: artifactKey(distributable),
    commands,
    blockers: [],
  };
}

export function runMacOsStandaloneReleaseCommandPlan({
  plan,
  runner = {
    run({ args, tool }) {
      const result = spawnSync(tool, args, { encoding: "utf8" });
      return {
        exitCode: typeof result.status === "number" ? result.status : 1,
        stderr: result.stderr ?? "",
        stdout: result.stdout ?? "",
      };
    },
  },
}) {
  if (!plan || plan.status !== "ready") {
    return {
      schemaVersion: 1,
      status: "blocked",
      commandsRun: [],
      blockers: plan?.blockers ?? [
        {
          code: "RELEASE_COMMAND_PLAN_NOT_READY",
          message:
            "macOS release command runner requires a ready command plan.",
        },
      ],
    };
  }

  const commandsRun = [];
  for (const item of plan.commands) {
    const result = runner.run({ args: item.args, tool: item.tool });
    commandsRun.push({
      id: item.id,
      display: item.display,
      exitCode: result.exitCode,
      stderr: result.stderr,
      stdout: result.stdout,
    });
    if (result.exitCode !== 0) {
      return {
        schemaVersion: 1,
        status: "failed",
        commandsRun,
        failure: {
          code: "RELEASE_COMMAND_FAILED",
          message: "macOS release command failed.",
          details: { commandId: item.id, exitCode: result.exitCode },
        },
      };
    }
  }

  return {
    schemaVersion: 1,
    status: "completed",
    releaseReadiness: "commands_completed_not_release_ready",
    commandsRun,
  };
}

export function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
