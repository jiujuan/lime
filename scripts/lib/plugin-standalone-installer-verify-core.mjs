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

function findArtifact(artifacts, kind) {
  return artifacts.find((artifact) => artifact?.kind === kind);
}

function validateArtifacts({ artifacts, outputRoot }) {
  const blockers = [];
  const normalizedOutputRoot = normalizeBoundaryPath(outputRoot);
  if (!normalizedOutputRoot) {
    blockers.push({
      code: "OUTPUT_ROOT_MISSING",
      message: "Installer verification requires a non-empty output root.",
    });
  }
  if (normalizedOutputRoot && hasTraversal(normalizedOutputRoot)) {
    blockers.push({
      code: "PATH_TRAVERSAL_DETECTED",
      message:
        "Installer verification output root must not contain parent traversal.",
      details: { path: normalizedOutputRoot },
    });
  }
  for (const artifact of artifacts) {
    if (!String(artifact?.path ?? "").trim()) {
      blockers.push({
        code: "ARTIFACT_PATH_MISSING",
        message:
          "Installer verification artifact refs require a non-empty path.",
        details: { kind: artifact?.kind },
      });
      continue;
    }
    if (hasTraversal(artifact?.path)) {
      blockers.push({
        code: "PATH_TRAVERSAL_DETECTED",
        message:
          "Installer verification artifact paths must not contain parent traversal.",
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
          "Installer verification refuses artifacts outside output root.",
        details: { path: artifact.path, outputRoot: normalizedOutputRoot },
      });
    }
  }
  return { outputRoot: normalizedOutputRoot || undefined, blockers };
}

function macosDistributableKind(packageFormat) {
  if (packageFormat === "dmg") return "dmg";
  return "app_bundle";
}

function macosCommands({ appBundle, distributable, packageFormat }) {
  const commands = [];
  if (appBundle) {
    commands.push(
      command(
        "codesign-verify-app",
        "codesign",
        ["--verify", "--deep", "--strict", "--verbose=2", appBundle.path],
        [artifactKey(appBundle)],
        [`${artifactKey(appBundle)}:codesign_verified`],
      ),
      command(
        "spctl-assess-app",
        "spctl",
        ["--assess", "--type", "execute", "--verbose", appBundle.path],
        [artifactKey(appBundle)],
        [`${artifactKey(appBundle)}:spctl_assessed`],
      ),
    );
  }
  if (packageFormat === "dmg" && distributable) {
    commands.push(
      command(
        "hdiutil-verify-dmg",
        "hdiutil",
        ["verify", distributable.path],
        [artifactKey(distributable)],
        [`${artifactKey(distributable)}:dmg_verified`],
      ),
    );
  }
  if (distributable) {
    commands.push(
      command(
        "stapler-validate",
        "xcrun",
        ["stapler", "validate", distributable.path],
        [artifactKey(distributable)],
        [`${artifactKey(distributable)}:stapler_validated`],
      ),
    );
  }
  return commands;
}

function windowsCommands({ installer }) {
  if (!installer) return [];
  return [
    command(
      "signtool-verify-installer",
      "signtool",
      ["verify", "/pa", "/v", installer.path],
      [artifactKey(installer)],
      [`${artifactKey(installer)}:signtool_verified`],
    ),
  ];
}

export function buildStandaloneInstallerVerificationPlan({
  artifacts = [],
  outputRoot,
  packageFormat = "app",
  platform = "macos",
}) {
  const normalizedArtifacts = Array.isArray(artifacts) ? artifacts : [];
  const normalizedPackageFormat = String(packageFormat ?? "app").trim();
  const validation = validateArtifacts({
    artifacts: normalizedArtifacts,
    outputRoot,
  });
  const blockers = [...validation.blockers];
  const commands = [];

  if (platform === "macos") {
    if (!["app", "dmg"].includes(normalizedPackageFormat)) {
      blockers.push({
        code: "PACKAGE_FORMAT_UNSUPPORTED",
        message: "macOS installer verification only supports app or dmg.",
        details: { packageFormat: normalizedPackageFormat },
      });
    }
    const appBundle = findArtifact(normalizedArtifacts, "app_bundle");
    const distributableKind = macosDistributableKind(normalizedPackageFormat);
    const distributable = findArtifact(normalizedArtifacts, distributableKind);
    if (!appBundle) {
      blockers.push({
        code: "APP_BUNDLE_ARTIFACT_MISSING",
        message:
          "macOS installer verification requires the .app bundle artifact ref.",
      });
    }
    if (!distributable) {
      blockers.push({
        code: "DISTRIBUTABLE_ARTIFACT_MISSING",
        message:
          "macOS installer verification requires the target distributable artifact ref.",
        details: { expectedKind: distributableKind },
      });
    }
    commands.push(
      ...macosCommands({
        appBundle,
        distributable,
        packageFormat: normalizedPackageFormat,
      }),
    );
  } else if (platform === "windows") {
    const installer = findArtifact(normalizedArtifacts, "windows_installer");
    if (!installer) {
      blockers.push({
        code: "WINDOWS_INSTALLER_ARTIFACT_MISSING",
        message:
          "Windows installer verification requires the installer artifact ref.",
      });
    }
    commands.push(...windowsCommands({ installer }));
  } else {
    blockers.push({
      code: "PLATFORM_UNSUPPORTED",
      message: "Installer verification only supports macos or windows.",
      details: { platform },
    });
  }

  if (blockers.length > 0) {
    return {
      schemaVersion: 1,
      status: "blocked",
      readyToRun: false,
      platform,
      packageFormat: normalizedPackageFormat,
      outputRoot: validation.outputRoot,
      blockers,
      commands: [],
    };
  }

  return {
    schemaVersion: 1,
    status: "ready",
    readyToRun: true,
    releaseReadiness: "verification_commands_ready_not_executed",
    platform,
    packageFormat: normalizedPackageFormat,
    outputRoot: validation.outputRoot,
    artifactRefs: normalizedArtifacts.map((artifact) => ({
      kind: artifact.kind,
      path: artifact.path,
      contentHash: artifact.contentHash,
    })),
    commands,
    blockers: [],
  };
}

export function runStandaloneInstallerVerificationPlan({
  plan,
  runner = {
    run({ args, tool }) {
      const result = spawnSync(tool, args, { encoding: "utf8" });
      return {
        exitCode: result.status ?? 1,
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
      releaseReadiness: "verification_not_started",
      commandsRun: [],
      blockers: plan?.blockers ?? [
        {
          code: "VERIFICATION_PLAN_NOT_READY",
          message: "Installer verification requires a ready plan.",
        },
      ],
    };
  }

  const commandsRun = [];
  for (const item of plan.commands) {
    const result = runner.run({
      args: item.args,
      id: item.id,
      tool: item.tool,
    });
    commandsRun.push({
      id: item.id,
      tool: item.tool,
      exitCode: result.exitCode,
      stdout: String(result.stdout ?? "").slice(0, 4000),
      stderr: String(result.stderr ?? "").slice(0, 4000),
      outputRefs: item.outputRefs,
    });
    if (result.exitCode !== 0) {
      return {
        schemaVersion: 1,
        status: "failed",
        releaseReadiness: "verification_failed",
        failedCommandId: item.id,
        commandsRun,
        blockers: [
          {
            code: "VERIFICATION_COMMAND_FAILED",
            message: "Installer verification command failed.",
            details: {
              id: item.id,
              tool: item.tool,
              exitCode: result.exitCode,
            },
          },
        ],
      };
    }
  }

  return {
    schemaVersion: 1,
    status: "completed",
    releaseReadiness: "installer_verification_completed",
    platform: plan.platform,
    packageFormat: plan.packageFormat,
    commandsRun,
    blockers: [],
  };
}

export function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
