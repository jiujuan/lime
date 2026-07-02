import { pathToFileURL } from "node:url";
import {
  buildContentFactoryWorkerProgressEvents,
  handleContentFactoryWorkerRequest,
} from "../../package-root/src/runtime/content-factory-worker.mjs";

export {
  buildContentFactoryWorkspacePatch,
  buildContentFactoryWorkerProgressEvents,
  handleContentFactoryWorkerRequest,
  runContentFactoryTask,
} from "../../package-root/src/runtime/content-factory-worker.mjs";

async function readStdinJson() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
  }
  return input.trim() ? JSON.parse(input) : {};
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const request = await readStdinJson();
  for (const event of buildContentFactoryWorkerProgressEvents(request)) {
    process.stdout.write(`${JSON.stringify(event)}\n`);
  }
  const response = handleContentFactoryWorkerRequest(request);
  process.stdout.write(`${JSON.stringify(response)}\n`);
  if (response.status !== "completed") {
    process.exitCode = 1;
  }
}
