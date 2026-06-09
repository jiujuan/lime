import fs from "node:fs/promises";
import path from "node:path";

export function workspaceSkillDirectoryFromName(name, fallback = "workspace-skill-fixture") {
  const directory = String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return directory || fallback;
}

function safeSkillRelativePath(relativePath) {
  const value = String(relativePath || "").trim();
  if (!value || path.isAbsolute(value)) {
    throw new Error(`workspace skill fixture path must be relative: ${relativePath}`);
  }
  const normalized = path.normalize(value);
  if (
    normalized === "." ||
    normalized === ".." ||
    normalized.startsWith(`..${path.sep}`)
  ) {
    throw new Error(`workspace skill fixture path escaped root: ${relativePath}`);
  }
  return normalized;
}

function ensureTargetInsideRoot(skillRoot, targetPath, relativePath) {
  const relative = path.relative(skillRoot, targetPath);
  if (
    !relative ||
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`workspace skill fixture path escaped root: ${relativePath}`);
  }
}

export async function writeWorkspaceSkillFixture({
  workspaceRoot,
  directory,
  generatedFiles,
  registration,
}) {
  const root = String(workspaceRoot || "").trim();
  if (!path.isAbsolute(root)) {
    throw new Error(`workspaceRoot must be absolute: ${workspaceRoot}`);
  }
  const skillDirectory = workspaceSkillDirectoryFromName(directory);
  const skillRoot = path.join(root, ".agents", "skills", skillDirectory);
  const files = Array.isArray(generatedFiles) ? generatedFiles : [];
  if (!files.some((file) => String(file?.relativePath || "") === "SKILL.md")) {
    throw new Error("workspace skill fixture requires SKILL.md");
  }

  await fs.mkdir(path.join(skillRoot, ".lime"), { recursive: true });
  for (const file of files) {
    const relativePath = safeSkillRelativePath(file?.relativePath);
    const target = path.join(skillRoot, relativePath);
    ensureTargetInsideRoot(skillRoot, target, file?.relativePath);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, String(file?.content ?? ""), "utf8");
  }

  const registrationPayload = {
    ...(registration && typeof registration === "object" ? registration : {}),
    skillDirectory,
    registeredSkillDirectory: skillRoot,
  };
  await fs.writeFile(
    path.join(skillRoot, ".lime", "registration.json"),
    `${JSON.stringify(registrationPayload, null, 2)}\n`,
    "utf8",
  );

  return {
    skillDirectory,
    registeredSkillDirectory: skillRoot,
    registration: registrationPayload,
  };
}

export function workspaceRegisteredSkillsArray(response) {
  return Array.isArray(response?.skills) ? response.skills : [];
}

export function workspaceSkillBindingsArray(response) {
  const directBindings = response?.bindings;
  if (Array.isArray(directBindings)) {
    return directBindings;
  }
  if (Array.isArray(directBindings?.bindings)) {
    return directBindings.bindings;
  }
  return [];
}

function pickString(target, ...keys) {
  for (const key of keys) {
    const value = target?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export function findWorkspaceRegisteredSkill(response, registeredSkillDirectory, name = "") {
  const expectedDirectory = String(registeredSkillDirectory || "").trim();
  const expectedName = String(name || "").trim();
  return workspaceRegisteredSkillsArray(response).find((skill) => {
    return (
      pickString(
        skill,
        "registeredSkillDirectory",
        "registered_skill_directory",
      ) === expectedDirectory ||
      (expectedName && pickString(skill, "name") === expectedName)
    );
  });
}

export function findWorkspaceSkillBinding(response, registeredSkillDirectory, directory = "") {
  const expectedDirectory = String(registeredSkillDirectory || "").trim();
  const expectedName = String(directory || "").trim();
  return workspaceSkillBindingsArray(response).find((binding) => {
    return (
      pickString(
        binding,
        "registeredSkillDirectory",
        "registered_skill_directory",
      ) === expectedDirectory ||
      (expectedName && pickString(binding, "directory") === expectedName)
    );
  });
}
