import path from "node:path";

export const GOVERNANCE_STATUSES = new Set([
  "current",
  "compat",
  "deprecated",
  "dead",
  "unclassified",
]);

export function normalizePath(filePath) {
  return filePath.split(path.sep).join("/");
}

export function isFrontendCodePath(relativePath) {
  return (
    relativePath.startsWith("src/") &&
    /\.(?:[cm]?[jt]sx?)$/i.test(relativePath) &&
    !relativePath.endsWith(".d.ts")
  );
}

export function isRustCodePath(relativePath) {
  return relativePath.startsWith("lime-rs/src/") && relativePath.endsWith(".rs");
}

export function isTestLikePath(relativePath) {
  return (
    /(^|\/)tests(\/|$)/.test(relativePath) ||
    /(^|\/)(__tests__|__mocks__)(\/|$)/.test(relativePath) ||
    /\.(test|spec)\.[^/.]+$/.test(relativePath) ||
    /(^|\/)tests\.rs$/.test(relativePath)
  );
}

export function isPagePath(relativePath) {
  return (
    /^src\/pages\/.+\.(?:[jt]sx?)$/i.test(relativePath) &&
    !/^src\/pages\/index\.(?:[jt]sx?)$/i.test(relativePath)
  );
}

export function createDirNodeId(relativePath) {
  return `dir:${relativePath}`;
}

export function validateGovernanceRules(rules) {
  if (!Array.isArray(rules)) {
    throw new Error("治理规则文件必须提供 rules 数组。");
  }

  for (const [index, rule] of rules.entries()) {
    if (!rule || typeof rule !== "object") {
      throw new Error(`治理规则第 ${index + 1} 项必须是对象。`);
    }

    if (!rule.match || typeof rule.match !== "string") {
      throw new Error(`治理规则第 ${index + 1} 项缺少 match。`);
    }

    if (!GOVERNANCE_STATUSES.has(rule.status)) {
      throw new Error(
        `治理规则 ${rule.match} 的 status 无效：${String(rule.status)}`,
      );
    }

    if (
      rule.ignoreSignals != null &&
      (!Array.isArray(rule.ignoreSignals) ||
        rule.ignoreSignals.some((item) => typeof item !== "string"))
    ) {
      throw new Error(`治理规则 ${rule.match} 的 ignoreSignals 必须是字符串数组。`);
    }

    if (rule.status === "compat" && !rule.sourceOfTruth) {
      throw new Error(`compat 规则 ${rule.match} 必须声明 sourceOfTruth。`);
    }

    if (rule.status === "deprecated" && !rule.exitCriteria) {
      throw new Error(`deprecated 规则 ${rule.match} 必须声明 exitCriteria。`);
    }
  }
}

export function globToRegExp(globPattern) {
  let pattern = "^";

  for (let index = 0; index < globPattern.length; index += 1) {
    const char = globPattern[index];
    const next = globPattern[index + 1];

    if (char === "*") {
      if (next === "*") {
        pattern += ".*";
        index += 1;
      } else {
        pattern += "[^/]*";
      }
      continue;
    }

    if (char === "?") {
      pattern += "[^/]";
      continue;
    }

    if ("\\^$+?.()|{}[]".includes(char)) {
      pattern += `\\${char}`;
      continue;
    }

    pattern += char;
  }

  pattern += "$";
  return new RegExp(pattern);
}

export function getRuleSpecificityScore(rule) {
  const match = String(rule.match || "");
  const literalChars = match.replace(/[*?]/g, "").length;
  const doubleStars = (match.match(/\*\*/g) || []).length;
  const singleStars = (match.match(/\*/g) || []).length - doubleStars * 2;
  const questions = (match.match(/\?/g) || []).length;
  return literalChars * 10 - doubleStars * 6 - singleStars * 3 - questions * 2;
}

export function resolveMatchingGovernanceRule(relativePath, rules) {
  const normalizedPath = normalizePath(relativePath);
  const matches = rules
    .map((rule, index) => ({
      ...rule,
      _index: index,
      _score: getRuleSpecificityScore(rule),
      _regexp: globToRegExp(rule.match),
    }))
    .filter((rule) => rule._regexp.test(normalizedPath))
    .sort((left, right) => right._score - left._score || left._index - right._index);

  return matches[0] ?? null;
}

export function buildRustModulePathFromFile(relativePath) {
  const normalizedPath = normalizePath(relativePath);

  if (!normalizedPath.startsWith("lime-rs/src/") || !normalizedPath.endsWith(".rs")) {
    return null;
  }

  const withoutRoot = normalizedPath.slice("lime-rs/src/".length);

  if (withoutRoot === "main.rs" || withoutRoot === "lib.rs") {
    return "";
  }

  if (withoutRoot.endsWith("/mod.rs")) {
    return withoutRoot.slice(0, -"/mod.rs".length).split("/").join("::");
  }

  return withoutRoot.slice(0, -".rs".length).split("/").join("::");
}

export function buildRustModuleIndex(relativePaths) {
  const moduleIndex = new Map();

  for (const relativePath of relativePaths) {
    const modulePath = buildRustModulePathFromFile(relativePath);
    if (modulePath == null) {
      continue;
    }

    if (!moduleIndex.has(modulePath)) {
      moduleIndex.set(modulePath, normalizePath(relativePath));
    }
  }

  return moduleIndex;
}

export function splitTopLevel(value, separator = ",") {
  const parts = [];
  let depth = 0;
  let current = "";

  for (const char of value) {
    if (char === "{") {
      depth += 1;
      current += char;
      continue;
    }

    if (char === "}") {
      depth = Math.max(0, depth - 1);
      current += char;
      continue;
    }

    if (char === separator && depth === 0) {
      if (current.trim()) {
        parts.push(current.trim());
      }
      current = "";
      continue;
    }

    current += char;
  }

  if (current.trim()) {
    parts.push(current.trim());
  }

  return parts;
}

function joinRustPath(prefix, segment) {
  if (!prefix) {
    return segment;
  }
  if (!segment) {
    return prefix;
  }
  return `${prefix}::${segment}`;
}

function stripRustVisibilityPrefix(statement) {
  return statement
    .trim()
    .replace(/^(?:pub(?:\([^)]*\))?\s+)?use\s+/, "")
    .replace(/;$/, "")
    .trim();
}

export function expandRustUseTree(statement) {
  const root = stripRustVisibilityPrefix(statement);

  if (!root) {
    return [];
  }

  return expandRustUseSegment(root);
}

function expandRustUseSegment(segment, prefix = "") {
  const trimmed = segment.trim();

  if (!trimmed) {
    return [];
  }

  const braceIndex = findTopLevelBraceIndex(trimmed);
  if (braceIndex === -1) {
    const normalizedLeaf = trimmed.replace(/\s+as\s+.+$/u, "").trim();
    if (normalizedLeaf === "self") {
      return prefix ? [prefix] : [];
    }
    return [joinRustPath(prefix, normalizedLeaf)];
  }

  const prefixPart = trimmed.slice(0, braceIndex).replace(/::$/, "").trim();
  const inner = trimmed.slice(braceIndex + 1, trimmed.lastIndexOf("}"));
  const nextPrefix = joinRustPath(prefix, prefixPart);

  return splitTopLevel(inner).flatMap((part) =>
    expandRustUseSegment(part, nextPrefix),
  );
}

function findTopLevelBraceIndex(value) {
  let depth = 0;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "{") {
      if (depth === 0) {
        return index;
      }
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth = Math.max(0, depth - 1);
    }
  }

  return -1;
}

export function resolveRustUseCandidateModules(currentModulePath, usePath) {
  const currentSegments = currentModulePath ? currentModulePath.split("::") : [];
  let remainder = usePath.trim();
  let baseSegments = [];

  if (remainder === "crate") {
    return [];
  }

  if (remainder.startsWith("crate::")) {
    remainder = remainder.slice("crate::".length);
  } else if (remainder === "self") {
    remainder = "";
    baseSegments = [...currentSegments];
  } else if (remainder.startsWith("self::")) {
    remainder = remainder.slice("self::".length);
    baseSegments = [...currentSegments];
  } else if (remainder === "super" || remainder.startsWith("super::")) {
    baseSegments = [...currentSegments];
    while (remainder === "super" || remainder.startsWith("super::")) {
      baseSegments.pop();
      remainder =
        remainder === "super" ? "" : remainder.slice("super::".length);
    }
  } else {
    return [];
  }

  const targetSegments = remainder ? remainder.split("::").filter(Boolean) : [];
  const absoluteSegments = [...baseSegments, ...targetSegments];
  const candidates = [];

  for (let length = absoluteSegments.length; length > 0; length -= 1) {
    candidates.push(absoluteSegments.slice(0, length).join("::"));
  }

  return candidates;
}

export function resolveRustUseToFile(moduleIndex, currentModulePath, usePath) {
  for (const candidate of resolveRustUseCandidateModules(
    currentModulePath,
    usePath,
  )) {
    const resolvedPath = moduleIndex.get(candidate);
    if (resolvedPath) {
      return resolvedPath;
    }
  }

  return null;
}
