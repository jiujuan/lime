import fs from "node:fs";
import path from "node:path";

export function readOptionalJsonFile(filePath) {
  if (!filePath) return null;
  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) return null;
  return JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
}

export function writeJsonFile(filePath, value) {
  const resolvedPath = path.resolve(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
