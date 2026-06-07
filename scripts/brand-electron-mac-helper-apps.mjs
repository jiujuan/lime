#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const DEFAULT_PRODUCT_NAME = "Lime";

export default async function afterPack(context) {
  if (context?.electronPlatformName !== "darwin") {
    return [];
  }

  return brandMacHelperApps({
    appOutDir: context.appOutDir,
    productName: context.packager?.appInfo?.productName || DEFAULT_PRODUCT_NAME,
  });
}

export function brandMacHelperApps({
  appOutDir,
  productName = DEFAULT_PRODUCT_NAME,
}) {
  if (!appOutDir || !existsSync(appOutDir)) {
    return [];
  }

  const mainAppPath = findMainAppPath(appOutDir, productName);
  if (!mainAppPath) {
    return [];
  }

  const frameworksDir = path.join(mainAppPath, "Contents", "Frameworks");
  if (!existsSync(frameworksDir)) {
    return [];
  }

  return readdirSync(frameworksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isHelperAppName(entry.name))
    .map((entry) =>
      brandHelperInfoPlist(path.join(frameworksDir, entry.name), productName),
    )
    .filter(Boolean)
    .sort((left, right) =>
      left.infoPlistPath.localeCompare(right.infoPlistPath),
    );
}

function findMainAppPath(appOutDir, productName) {
  const preferred = path.join(appOutDir, `${productName}.app`);
  if (existsSync(preferred)) {
    return preferred;
  }

  return (
    readdirSync(appOutDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.endsWith(".app"))
      .map((entry) => path.join(appOutDir, entry.name))
      .sort()[0] || null
  );
}

function isHelperAppName(name) {
  return name.endsWith(".app") && /\bHelper(?: \(|\.app$)/.test(name);
}

function brandHelperInfoPlist(helperAppPath, productName) {
  const infoPlistPath = path.join(helperAppPath, "Contents", "Info.plist");
  if (!existsSync(infoPlistPath)) {
    return null;
  }

  const before = readFileSync(infoPlistPath, "utf8");
  const expectedName = expectedHelperName(helperAppPath, productName);
  let content = before;
  let changed = false;

  for (const key of [
    "CFBundleName",
    "CFBundleDisplayName",
    "CFBundleExecutable",
  ]) {
    const next = replacePlistStringValue(content, key, (value) =>
      value.startsWith("Electron Helper")
        ? value.replace(/^Electron Helper/, `${productName} Helper`)
        : value,
    );
    if (next !== content) {
      content = next;
      changed = true;
    }
  }

  for (const key of ["CFBundleName", "CFBundleDisplayName"]) {
    const next = replacePlistStringValue(content, key, (value) =>
      value === "Electron" ? expectedName : value,
    );
    if (next !== content) {
      content = next;
      changed = true;
    }
  }

  const next = replacePlistStringValue(
    content,
    "CFBundleExecutable",
    (value) => (value === "Electron" ? expectedName : value),
  );
  if (next !== content) {
    content = next;
    changed = true;
  }

  if (!changed) {
    return { changed: false, infoPlistPath };
  }

  writeFileSync(infoPlistPath, content);
  return { changed: true, infoPlistPath };
}

function expectedHelperName(helperAppPath, productName) {
  return path
    .basename(helperAppPath, ".app")
    .replace(/^Electron Helper/, `${productName} Helper`);
}

function replacePlistStringValue(content, key, mapper) {
  const pattern = new RegExp(
    `(<key>${escapeRegExp(key)}</key>\\s*<string>)([^<]*)(</string>)`,
  );
  return content.replace(pattern, (match, prefix, value, suffix) => {
    const nextValue = mapper(value);
    return nextValue === value ? match : `${prefix}${nextValue}${suffix}`;
  });
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
