import path from "node:path";
import { readFileSync } from "node:fs";

import { MakerDMG } from "@electron-forge/maker-dmg";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";

import { brandMacHelperApps } from "./scripts/electron/brand-mac-helper-apps.mjs";

const PRODUCT_NAME = "Lime";
const APP_ID = "com.limecloud.lime";
const RELEASE_OUTPUT_DIR =
  process.env.LIME_ELECTRON_FORGE_OUT_DIR || "release-electron";
const SQUIRREL_PACKAGE_NAME = "lime";
const PACKAGE_VERSION = JSON.parse(
  readFileSync("package.json", "utf8"),
).version;
const DEFAULT_UPDATE_BASE_URL = "https://updates.limecloud.com";

const retainedPackageRoots = new Set(["dist", "node_modules", "package.json"]);
const retainedPackageDirectories = new Set([
  "dist-electron",
  "dist-electron/main",
  "dist-electron/preload",
]);
const retainedPackagePrefixes = [
  "dist-electron/main/",
  "dist-electron/preload/",
];

function ignorePackagerInput(filePath) {
  const normalizedInput = filePath.replace(/\\/g, "/");
  const normalizedCwd = process.cwd().replace(/\\/g, "/");
  const relativePath =
    normalizedInput === normalizedCwd ||
    normalizedInput.startsWith(`${normalizedCwd}/`)
      ? path.relative(process.cwd(), filePath)
      : normalizedInput;
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) {
    return false;
  }

  const root = normalized.split("/")[0];
  if (retainedPackageRoots.has(root)) {
    return false;
  }
  if (retainedPackageDirectories.has(normalized)) {
    return false;
  }
  if (retainedPackagePrefixes.some((prefix) => normalized.startsWith(prefix))) {
    return false;
  }

  return true;
}

function macSignOptions({
  env = process.env,
  platform = process.platform,
} = {}) {
  if (
    platform !== "darwin" ||
    (env.LIME_ELECTRON_SIGN !== "1" && !env.LIME_MACOS_KEYCHAIN)
  ) {
    return undefined;
  }

  const options = {
    hardenedRuntime: true,
    entitlements: "lime-rs/entitlements.plist",
    "entitlements-inherit": "lime-rs/entitlements.plist",
  };
  if (env.APPLE_SIGNING_IDENTITY) {
    options.identity = env.APPLE_SIGNING_IDENTITY;
  }
  if (env.LIME_MACOS_KEYCHAIN) {
    options.keychain = env.LIME_MACOS_KEYCHAIN;
  }
  return options;
}

function macNotarizeOptions({
  env = process.env,
  platform = process.platform,
} = {}) {
  if (
    platform !== "darwin" ||
    (env.LIME_ELECTRON_SIGN !== "1" && !env.LIME_MACOS_KEYCHAIN)
  ) {
    return undefined;
  }

  const appleId = env.APPLE_ID;
  const appleIdPassword = env.APPLE_APP_SPECIFIC_PASSWORD || env.APPLE_PASSWORD;
  const teamId = env.APPLE_TEAM_ID;
  if (!appleId || !appleIdPassword || !teamId) {
    return undefined;
  }

  return { appleId, appleIdPassword, teamId };
}

function normalizedUpdateBaseUrl({ env = process.env } = {}) {
  return (env.LIME_UPDATES_BASE_URL || DEFAULT_UPDATE_BASE_URL)
    .trim()
    .replace(/\/+$/, "");
}

function updateFeedLabel(platform = process.platform, arch = process.arch) {
  if (platform === "darwin") {
    return arch === "arm64" ? "darwin-arm64" : "darwin-x64";
  }
  if (platform === "win32") {
    return arch === "arm64" ? "win32-arm64" : "win32-x64";
  }
  return `${platform}-${arch}`;
}

function updateFeedUrl(
  platform = process.platform,
  arch = process.arch,
  { env = process.env } = {},
) {
  const explicitFeedUrl = env.LIME_ELECTRON_UPDATES_URL?.trim();
  if (explicitFeedUrl) {
    return explicitFeedUrl.replace(/\/+$/, "");
  }
  return `${normalizedUpdateBaseUrl({ env })}/lime/stable/${updateFeedLabel(platform, arch)}`;
}

function macZipConfig(arch = process.arch, options = {}) {
  return {
    macUpdateManifestBaseUrl: updateFeedUrl("darwin", arch, options),
  };
}

function windowsSigningOptions({
  env = process.env,
  platform = process.platform,
} = {}) {
  if (platform !== "win32" || env.LIME_ELECTRON_SIGN !== "1") {
    return {};
  }

  const certificateFile = env.LIME_WINDOWS_SIGNING_CERTIFICATE_FILE?.trim();
  const certificatePassword = env.LIME_WINDOWS_SIGNING_CERTIFICATE_PASSWORD;
  if (!certificateFile || !certificatePassword) {
    return {};
  }

  return {
    certificateFile,
    certificatePassword,
  };
}

function squirrelConfig(arch = process.arch, options = {}) {
  const packageVersion = options.packageVersion || PACKAGE_VERSION;
  return {
    authors: "Lime",
    exe: `${PRODUCT_NAME}.exe`,
    name: SQUIRREL_PACKAGE_NAME,
    noMsi: true,
    remoteReleases: updateFeedUrl("win32", arch, options),
    setupExe: `${PRODUCT_NAME}-${packageVersion} Setup.exe`,
    setupIcon: "lime-rs/icons/icon.ico",
    ...windowsSigningOptions(options),
  };
}

export {
  ignorePackagerInput,
  macNotarizeOptions,
  macSignOptions,
  macZipConfig,
  normalizedUpdateBaseUrl,
  squirrelConfig,
  updateFeedLabel,
  updateFeedUrl,
  windowsSigningOptions,
};

export default {
  outDir: RELEASE_OUTPUT_DIR,
  packagerConfig: {
    name: PRODUCT_NAME,
    executableName: PRODUCT_NAME,
    appBundleId: APP_ID,
    appCategoryType: "public.app-category.productivity",
    appCopyright: "Copyright © Lime",
    asar: true,
    prune: true,
    icon:
      process.platform === "win32"
        ? "lime-rs/icons/icon.ico"
        : "lime-rs/icons/icon.icns",
    extraResource: [
      "dist-electron/desktop-assets",
      "dist-electron/app-server.release.json",
      "dist-electron/app-server",
    ],
    protocols: [
      {
        name: "Lime URL",
        schemes: ["lime"],
      },
    ],
    extendInfo: {
      NSMicrophoneUsageDescription: "Lime 需要访问麦克风以使用语音输入功能",
      NSAppleEventsUsageDescription: "Lime 需要控制其他应用以输入识别的文本",
    },
    osxSign: macSignOptions(),
    osxNotarize: macNotarizeOptions(),
    win32metadata: {
      CompanyName: "Lime",
      FileDescription: PRODUCT_NAME,
      ProductName: PRODUCT_NAME,
      InternalName: PRODUCT_NAME,
    },
    afterComplete: [
      async (buildPath, _electronVersion, platform) => {
        if (platform !== "darwin") {
          return;
        }
        brandMacHelperApps({
          appOutDir: buildPath,
          productName: PRODUCT_NAME,
        });
      },
    ],
    ignore: ignorePackagerInput,
  },
  rebuildConfig: {},
  makers: [
    new MakerDMG(
      {
        name: PRODUCT_NAME,
      },
      ["darwin"],
    ),
    new MakerZIP((arch) => macZipConfig(arch), ["darwin"]),
    new MakerSquirrel((arch) => squirrelConfig(arch), ["win32"]),
  ],
};
