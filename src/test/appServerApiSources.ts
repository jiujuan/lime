import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";

const APP_SERVER_API_SOURCE_FILES = [
  "src/lib/api/appServer.ts",
  "src/lib/api/appServerConstants.ts",
  "src/lib/api/appServerTypes.ts",
  "src/lib/api/appServerTransport.ts",
  "src/lib/api/appServerResponse.ts",
  "src/lib/api/appServerClient.ts",
  "src/lib/api/appServerClientMethods.ts",
  "src/lib/api/appServerClientMethodSpecs.ts",
];

function readRepoFile(path: string): string {
  return readFileSync(resolve(cwd(), path), "utf8");
}

export function readAppServerApiSources(): string {
  return APP_SERVER_API_SOURCE_FILES.map(readRepoFile).join("\n");
}
