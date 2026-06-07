type MockLayeredDesignProjectExport = {
  projectRootPath: string;
  exportDirectoryPath: string;
  exportDirectoryRelativePath: string;
  designPath: string;
  designJson: string;
  manifestPath: string;
  manifestJson: string;
  psdLikeManifestPath: string;
  psdLikeManifestJson: string;
  previewPngPath: string;
  assetCount: number;
  fileCount: number;
  remoteReferenceAssetCount: number;
  cachedRemoteAssetCount: number;
  uncachedRemoteAssetCount: number;
  updatedAtMs: number;
};

const mockLayeredDesignProjectExportStore = new Map<
  string,
  MockLayeredDesignProjectExport
>();

function buildMockLayeredDesignProjectExportKey(
  projectRootPath: string,
  exportDirectoryRelativePath: string,
) {
  return `${projectRootPath}::${exportDirectoryRelativePath}`;
}

function findMockProjectExportFile(files: any[], relativePath: string) {
  return files.find(
    (file: any) => String(file?.relativePath ?? "") === relativePath,
  );
}

function buildDefaultMockLayeredDesignProjectExport(
  projectRootPath = "/mock/workspace",
  exportDirectoryRelativePath = ".lime/layered-designs/mock-design.layered-design",
): MockLayeredDesignProjectExport {
  const exportDirectoryPath = `${projectRootPath}/${exportDirectoryRelativePath}`;

  return {
    projectRootPath,
    exportDirectoryPath,
    exportDirectoryRelativePath,
    designPath: `${exportDirectoryPath}/design.json`,
    designJson: JSON.stringify({
      schemaVersion: "2026-05-05.p1",
      id: "mock-design",
      title: "Mock 图层设计",
      status: "draft",
      canvas: {
        width: 1080,
        height: 1440,
        backgroundColor: "#ffffff",
      },
      layers: [],
      assets: [],
      editHistory: [],
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    }),
    manifestPath: `${exportDirectoryPath}/export-manifest.json`,
    manifestJson: '{"assets":[]}',
    psdLikeManifestPath: `${exportDirectoryPath}/psd-like-manifest.json`,
    psdLikeManifestJson:
      '{"projectionKind":"psd-like-layer-stack","layers":[]}',
    previewPngPath: `${exportDirectoryPath}/preview.png`,
    assetCount: 0,
    fileCount: 4,
    remoteReferenceAssetCount: 0,
    cachedRemoteAssetCount: 0,
    uncachedRemoteAssetCount: 0,
    updatedAtMs: 0,
  };
}

export function clearLayeredDesignMocks() {
  mockLayeredDesignProjectExportStore.clear();
}

export const layeredDesignMocks: Record<string, (args: any) => any> = {
  save_layered_design_project_export: (args: any) => {
    const request = args?.request ?? args ?? {};
    const projectRootPath = request?.projectRootPath ?? "/mock/workspace";
    const directoryName =
      request?.directoryName ??
      `${request?.documentId ?? "mock-design"}.layered-design`;
    const exportDirectoryRelativePath = `.lime/layered-designs/${directoryName}`;
    const exportDirectoryPath = `${projectRootPath}/${exportDirectoryRelativePath}`;
    const files = Array.isArray(request?.files) ? request.files : [];
    const embeddedAssetCount = files.filter((file: any) =>
      String(file?.relativePath ?? "").startsWith("assets/"),
    ).length;
    const remoteReferenceAssetCount = (() => {
      const manifestFile = files.find(
        (file: any) =>
          String(file?.relativePath ?? "") === "export-manifest.json",
      );
      if (
        !manifestFile ||
        typeof manifestFile?.content !== "string" ||
        !["utf8", "utf-8"].includes(
          String(manifestFile?.encoding ?? "").toLowerCase(),
        )
      ) {
        return 0;
      }

      try {
        const manifest = JSON.parse(manifestFile.content);
        const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];
        return assets.filter((asset: any) => {
          const source = String(asset?.source ?? "").trim();
          const originalSrc = String(asset?.originalSrc ?? "").trim();
          return (
            source === "reference" &&
            (originalSrc.startsWith("http://") ||
              originalSrc.startsWith("https://"))
          );
        }).length;
      } catch {
        return 0;
      }
    })();
    const cachedRemoteAssetCount = remoteReferenceAssetCount;
    const uncachedRemoteAssetCount = Math.max(
      0,
      remoteReferenceAssetCount - cachedRemoteAssetCount,
    );
    const designFile = findMockProjectExportFile(files, "design.json");
    const manifestFile = findMockProjectExportFile(
      files,
      "export-manifest.json",
    );
    const psdLikeManifestFile = findMockProjectExportFile(
      files,
      "psd-like-manifest.json",
    );
    const designJson =
      typeof designFile?.content === "string"
        ? designFile.content
        : buildDefaultMockLayeredDesignProjectExport().designJson;
    const manifestJson =
      typeof manifestFile?.content === "string"
        ? manifestFile.content
        : '{"assets":[]}';
    const psdLikeManifestJson =
      typeof psdLikeManifestFile?.content === "string"
        ? psdLikeManifestFile.content
        : '{"projectionKind":"psd-like-layer-stack","layers":[]}';
    const updatedAtMs = Date.now();
    const output = {
      projectRootPath,
      exportDirectoryPath,
      exportDirectoryRelativePath,
      designPath: `${exportDirectoryPath}/design.json`,
      designJson,
      manifestPath: `${exportDirectoryPath}/export-manifest.json`,
      manifestJson,
      psdLikeManifestPath: `${exportDirectoryPath}/psd-like-manifest.json`,
      psdLikeManifestJson,
      previewPngPath: `${exportDirectoryPath}/preview.png`,
      assetCount: embeddedAssetCount + cachedRemoteAssetCount,
      fileCount: files.length + cachedRemoteAssetCount,
      remoteReferenceAssetCount,
      cachedRemoteAssetCount,
      uncachedRemoteAssetCount,
      updatedAtMs,
    };

    mockLayeredDesignProjectExportStore.set(
      buildMockLayeredDesignProjectExportKey(
        projectRootPath,
        exportDirectoryRelativePath,
      ),
      output,
    );

    return {
      projectRootPath,
      exportDirectoryPath,
      exportDirectoryRelativePath,
      designPath: `${exportDirectoryPath}/design.json`,
      manifestPath: `${exportDirectoryPath}/export-manifest.json`,
      previewPngPath: `${exportDirectoryPath}/preview.png`,
      assetCount: embeddedAssetCount + cachedRemoteAssetCount,
      fileCount: files.length + cachedRemoteAssetCount,
      bytesWritten:
        files.reduce(
          (sum: number, file: any) => sum + String(file?.content ?? "").length,
          0,
        ) +
        cachedRemoteAssetCount * 1024,
      remoteReferenceAssetCount,
      cachedRemoteAssetCount,
      uncachedRemoteAssetCount,
    };
  },
  read_layered_design_project_export: (args: any) => {
    const request = args?.request ?? args ?? {};
    const projectRootPath = request?.projectRootPath ?? "/mock/workspace";
    const exportDirectoryRelativePath =
      typeof request?.exportDirectoryRelativePath === "string"
        ? request.exportDirectoryRelativePath
        : "";
    const explicitExport =
      exportDirectoryRelativePath.length > 0
        ? mockLayeredDesignProjectExportStore.get(
            buildMockLayeredDesignProjectExportKey(
              projectRootPath,
              exportDirectoryRelativePath,
            ),
          )
        : undefined;
    const latestExport =
      explicitExport ??
      Array.from(mockLayeredDesignProjectExportStore.values())
        .filter((item) => item.projectRootPath === projectRootPath)
        .sort((a, b) => b.updatedAtMs - a.updatedAtMs)[0];

    return (
      latestExport ??
      buildDefaultMockLayeredDesignProjectExport(
        projectRootPath,
        exportDirectoryRelativePath ||
          ".lime/layered-designs/mock-design.layered-design",
      )
    );
  },
  recognize_layered_design_text: () => ({
    supported: false,
    engine: "mock-native-ocr",
    blocks: [],
    message: "浏览器 mock 未执行 native OCR",
  }),
  analyze_layered_design_flat_image: () => ({
    supported: false,
    engine: "mock-native-analyzer",
    message: "浏览器 mock 未执行 native analyzer",
  }),
};
