export const LIVE_PROVIDER_SMOKE_ENV = "LIME_ALLOW_LIVE_PROVIDER_SMOKE";
export const REAL_API_TEST_ENV = "LIME_REAL_API_TEST";
const LIVE_PROVIDER_TEST_PATH_PATTERN =
  /(^|\/)[^/]+[._-]live[._-](?:test|spec)\.(?:[cm]?[jt]sx?)$/i;

export function isTruthyEnv(value) {
  return /^(1|true|yes|on)$/i.test(String(value || "").trim());
}

export function liveProviderSmokeAllowed(env = process.env) {
  return (
    isTruthyEnv(env[LIVE_PROVIDER_SMOKE_ENV]) ||
    isTruthyEnv(env[REAL_API_TEST_ENV])
  );
}

export function isLiveProviderTestPath(filePath) {
  return LIVE_PROVIDER_TEST_PATH_PATTERN.test(
    String(filePath || "").replaceAll("\\", "/"),
  );
}

export function assertLiveProviderSmokeAllowed({
  allowed,
  scriptName,
  flag = "--allow-live-provider",
}) {
  if (allowed) {
    return;
  }

  throw new Error(
    `${scriptName} 会调用真实模型或多模态 Provider。为避免消耗额度，默认禁止执行；如确需运行，请显式传入 ${flag}，或设置 ${LIVE_PROVIDER_SMOKE_ENV}=1 / ${REAL_API_TEST_ENV}=1。`,
  );
}

export function liveProviderSmokeEnv(env = process.env) {
  return {
    ...env,
    [LIVE_PROVIDER_SMOKE_ENV]: "1",
  };
}
