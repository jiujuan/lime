import type { AppCenterItem } from "./PluginsPageViewModel";
import {
  asRecord,
  readText,
  readTextArray,
} from "./pluginDetailDeclarations";

export function getDetailCategory(item: AppCenterItem): string | undefined {
  const manifest = item.installedState?.manifest;
  const manifestInterface = asRecord(manifest?.interface);
  return (
    readText(manifest?.presentation?.category) ??
    readText(manifestInterface?.category) ??
    readText(manifest?.appType)
  );
}

export function getDetailDeveloper(item: AppCenterItem): string | undefined {
  const manifest = item.installedState?.manifest;
  const distribution = asRecord(manifest?.distribution);
  const presentation = asRecord(manifest?.presentation);
  const publisher = asRecord(presentation?.publisher);
  const cloudPresentation = asRecord(item.cloudApp?.presentation);
  const cloudPublisher = asRecord(cloudPresentation?.publisher);
  return (
    readText(distribution?.publisher) ??
    readText(publisher?.name) ??
    readText(cloudPublisher?.name)
  );
}

export function getDetailCapabilityCount(item: AppCenterItem): number {
  return (
    item.installedState?.projection.requiredCapabilities?.length ??
    Object.keys(item.cloudApp?.capabilityRequirements ?? {}).length
  );
}

export function buildDetailTags(item: AppCenterItem): string[] {
  const manifest = item.installedState?.manifest;
  const manifestRecord = asRecord(manifest);
  const manifestInterface = asRecord(manifest?.interface);
  const manifestRequires = asRecord(manifest?.requires);
  const manifestRequiredCapabilities = asRecord(manifestRequires?.capabilities);
  return Array.from(
    new Set([
      ...readTextArray(manifestInterface?.capabilities),
      ...Object.keys(manifestRequiredCapabilities ?? {}),
      ...readTextArray(manifestRecord?.capabilities),
    ]),
  ).slice(0, 6);
}

export function getDetailPermissions(item: AppCenterItem) {
  return item.installedState?.manifest.permissions ?? [];
}

export function getDetailCommonEntries(item: AppCenterItem) {
  return item.entries ?? [];
}
