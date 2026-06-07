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
const UPDATE_BASE_URL =
  process.env.LIME_UPDATES_BASE_URL || "https://updates.limecloud.com";

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

function macSignOptions() {
  if (
    process.platform !== "darwin" ||
    (process.env.LIME_ELECTRON_SIGN !== "1" && !process.env.LIME_MACOS_KEYCHAIN)
  ) {
    return undefined;
  }

  const options = {
    hardenedRuntime: true,
    entitlements: "lime-rs/entitlements.plist",
    "entitlements-inherit": "lime-rs/entitlements.plist",
  };
  if (process.env.APPLE_SIGNING_IDENTITY) {
    options.identity = process.env.APPLE_SIGNING_IDENTITY;
  }
  if (process.env.LIME_MACOS_KEYCHAIN) {
    options.keychain = process.env.LIME_MACOS_KEYCHAIN;
  }
  return options;
}

function macNotarizeOptions() {
  if (
    process.platform !== "darwin" ||
    (process.env.LIME_ELECTRON_SIGN !== "1" && !process.env.LIME_MACOS_KEYCHAIN)
  ) {
    return undefined;
  }

  const appleId = process.env.APPLE_ID;
  const appleIdPassword =
    process.env.APPLE_APP_SPECIFIC_PASSWORD || process.env.APPLE_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  if (!appleId || !appleIdPassword || !teamId) {
    return undefined;
  }

  return { appleId, appleIdPassword, teamId };
}

function normalizedUpdateBaseUrl() {
  return UPDATE_BASE_URL.trim().replace(/\/+$/, "");
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

function updateFeedUrl(platform = process.platform, arch = process.arch) {
  const explicitFeedUrl = process.env.LIME_ELECTRON_UPDATES_URL?.trim();
  if (explicitFeedUrl) {
    return explicitFeedUrl.replace(/\/+$/, "");
  }
  return `${normalizedUpdateBaseUrl()}/lime/stable/${updateFeedLabel(platform, arch)}`;
}

function macZipConfig(arch = process.arch) {
  return {
    macUpdateManifestBaseUrl: updateFeedUrl("darwin", arch),
  };
}

function windowsSigningOptions() {
  if (process.platform !== "win32" || process.env.LIME_ELECTRON_SIGN !== "1") {
    return {};
  }

  const certificateFile =
    process.env.LIME_WINDOWS_SIGNING_CERTIFICATE_FILE?.trim();
  const certificatePassword =
    process.env.LIME_WINDOWS_SIGNING_CERTIFICATE_PASSWORD;
  if (!certificateFile || !certificatePassword) {
    return {};
  }

  return {
    certificateFile,
    certificatePassword,
  };
}

function squirrelConfig(arch = process.arch) {
  return {
    authors: "Lime",
    exe: `${PRODUCT_NAME}.exe`,
    name: SQUIRREL_PACKAGE_NAME,
    noMsi: true,
    remoteReleases: updateFeedUrl("win32", arch),
    setupExe: `${PRODUCT_NAME}-${PACKAGE_VERSION} Setup.exe`,
    setupIcon: "lime-rs/icons/icon.ico",
    ...windowsSigningOptions(),
  };
}

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
