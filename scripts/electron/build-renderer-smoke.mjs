process.env.LIME_ELECTRON_RENDERER = "1";

const { spawn } = await import("node:child_process");

const RENDERER_BUILD_NODE_OPTIONS = "--max-old-space-size=8192";

await run("npx", ["vite", "build"]);

function rendererBuildEnv() {
  const nodeOptions = process.env.NODE_OPTIONS ?? "";
  const hasOldSpaceSize = /(?:^|\s)--max-old-space-size(?:=|\s|$)/.test(
    nodeOptions,
  );
  return {
    ...process.env,
    NODE_OPTIONS: hasOldSpaceSize
      ? nodeOptions
      : [nodeOptions, RENDERER_BUILD_NODE_OPTIONS].filter(Boolean).join(" "),
  };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: rendererBuildEnv(),
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
    child.once("error", reject);
  });
}
