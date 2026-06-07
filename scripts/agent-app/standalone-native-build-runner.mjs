#!/usr/bin/env node

console.error(
  [
    "Standalone artifact adapter has been retired.",
    "Use the Electron/App Server release pipeline instead:",
    "  npm run dev",
    "  npm run build",
    "  npm run preview",
    "",
    "lime-rs remains the Rust Runtime / App Server workspace, not a desktop GUI host entrypoint.",
  ].join("\n"),
);

process.exit(1);
