import path from "node:path";

export const DARWIN_ARM64_SYSTEM_PATH_PREFIX = [
  "/usr/bin",
  "/bin",
  "/usr/sbin",
  "/sbin",
];

export function withNativeSystemPath(
  env,
  {
    platform = process.platform,
    arch = process.arch,
    delimiter = path.delimiter,
  } = {},
) {
  const nextEnv = { ...env };
  if (platform !== "darwin" || arch !== "arm64") {
    return nextEnv;
  }

  const inheritedPath = typeof env?.PATH === "string" ? env.PATH : "";
  nextEnv.PATH = [
    ...DARWIN_ARM64_SYSTEM_PATH_PREFIX,
    ...inheritedPath.split(delimiter),
  ]
    .map((entry) => entry.trim())
    .filter(
      (entry, index, entries) => entry && entries.indexOf(entry) === index,
    )
    .join(delimiter);
  return nextEnv;
}
