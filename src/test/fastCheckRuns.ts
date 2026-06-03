import process from "node:process";

type FastCheckRunEnv = Record<string, string | undefined>;

interface FastCheckRunOptions {
  env?: FastCheckRunEnv;
  localRuns?: number;
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function isTruthyEnvFlag(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

export function fastCheckRuns(
  ciRuns = 100,
  options: FastCheckRunOptions = {},
): number {
  const env = options.env ?? process.env;
  const overrideRuns = parsePositiveInteger(env.LIME_FAST_CHECK_RUNS);
  if (overrideRuns !== null) {
    return overrideRuns;
  }

  if (isTruthyEnvFlag(env.CI)) {
    return ciRuns;
  }

  const localRuns = options.localRuns ?? 25;
  return Math.max(1, Math.min(localRuns, ciRuns));
}
