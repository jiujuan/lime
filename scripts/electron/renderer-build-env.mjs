const RENDERER_BUILD_NODE_OPTIONS = "--max-old-space-size=8192";
const DEFAULT_HEARTBEAT_INTERVAL_MS = 60_000;

export function rendererBuildEnv(env = process.env) {
  const nodeOptions = env.NODE_OPTIONS ?? "";
  const hasOldSpaceSize = /(?:^|\s)--max-old-space-size(?:=|\s|$)/.test(
    nodeOptions,
  );
  return {
    ...env,
    NODE_OPTIONS: hasOldSpaceSize
      ? nodeOptions
      : [nodeOptions, RENDERER_BUILD_NODE_OPTIONS].filter(Boolean).join(" "),
  };
}

export function startRendererBuildHeartbeat({
  intervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  now = () => new Date(),
  write = (message) => process.stdout.write(message),
} = {}) {
  const startedAt = Date.now();
  const timer = setInterval(() => {
    const elapsedSeconds = Math.round((Date.now() - startedAt) / 1000);
    write(
      `[electron-renderer-build] still running after ${elapsedSeconds}s at ${now().toISOString()}\n`,
    );
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
