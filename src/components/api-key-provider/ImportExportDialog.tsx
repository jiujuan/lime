/**
 * @file ImportExportDialog 组件
 * @description Provider 配置导入导出对话框
 * @module components/api-key-provider/ImportExportDialog
 *
 * **Feature: provider-ui-refactor**
 * **Validates: Requirements 9.4, 9.5**
 */

import React, { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, Upload, Copy, Check, AlertCircle } from "lucide-react";
import type { ImportResult } from "@/lib/api/apiKeyProvider";

// ============================================================================
// 类型定义
// ============================================================================

export interface ImportExportDialogProps {
  /** 是否打开 */
  isOpen: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 导出配置回调 */
  onExport: (includeKeys: boolean) => Promise<string>;
  /** 导入配置回调 */
  onImport: (configJson: string) => Promise<ImportResult>;
}

type TabValue = "export" | "import";

// ============================================================================
// 组件实现
// ============================================================================

/**
 * Provider 配置导入导出对话框
 *
 * 支持：
 * - 导出 Provider 配置（可选是否包含 API Key 元数据）
 * - 导入 Provider 配置（处理冲突和合并）
 *
 * @example
 * ```tsx
 * <ImportExportDialog
 *   isOpen={showDialog}
 *   onClose={() => setShowDialog(false)}
 *   onExport={handleExport}
 *   onImport={handleImport}
 * />
 * ```
 */
export const ImportExportDialog: React.FC<ImportExportDialogProps> = ({
  isOpen,
  onClose,
  onExport,
  onImport,
}) => {
  const { t } = useTranslation("settings");
  // ===== 状态 =====
  const [activeTab, setActiveTab] = useState<TabValue>("export");
  const [includeKeys, setIncludeKeys] = useState(false);
  const [exportedConfig, setExportedConfig] = useState<string>("");
  const [importConfig, setImportConfig] = useState<string>("");
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ===== 导出处理 =====
  const handleExport = useCallback(async () => {
    setExporting(true);
    setError(null);
    try {
      const config = await onExport(includeKeys);
      setExportedConfig(config);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("settings.providers.importExport.message.exportFailed"),
      );
    } finally {
      setExporting(false);
    }
  }, [onExport, includeKeys, t]);

  // ===== 复制到剪贴板 =====
  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(exportedConfig);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(t("settings.providers.importExport.message.copyFailed"));
    }
  }, [exportedConfig, t]);

  // ===== 下载文件 =====
  const handleDownload = useCallback(() => {
    const blob = new Blob([exportedConfig], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lime-providers-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [exportedConfig]);

  // ===== 导入处理 =====
  const handleImport = useCallback(async () => {
    if (!importConfig.trim()) {
      setError(t("settings.providers.importExport.message.emptyImport"));
      return;
    }

    setImporting(true);
    setError(null);
    setImportResult(null);

    try {
      // 验证 JSON 格式
      JSON.parse(importConfig);
      const result = await onImport(importConfig);
      setImportResult(result);
      if (result.success && result.imported_providers > 0) {
        // 导入成功，清空输入
        setImportConfig("");
      }
    } catch (e) {
      if (e instanceof SyntaxError) {
        setError(t("settings.providers.importExport.message.invalidJson"));
      } else {
        setError(
          e instanceof Error
            ? e.message
            : t("settings.providers.importExport.message.importFailed"),
        );
      }
    } finally {
      setImporting(false);
    }
  }, [importConfig, onImport, t]);

  // ===== 文件选择处理 =====
  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setImportConfig(content);
        setError(null);
        setImportResult(null);
      };
      reader.onerror = () => {
        setError(t("settings.providers.importExport.message.readFileFailed"));
      };
      reader.readAsText(file);

      // 重置 input 以允许选择相同文件
      e.target.value = "";
    },
    [t],
  );

  // ===== 关闭时重置状态 =====
  const handleClose = useCallback(() => {
    setExportedConfig("");
    setImportConfig("");
    setImportResult(null);
    setError(null);
    setCopied(false);
    onClose();
  }, [onClose]);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent
        className="sm:max-w-[600px] p-6"
        data-testid="import-export-dialog"
      >
        <DialogHeader className="mb-4">
          <DialogTitle>
            {t("settings.providers.importExport.title")}
          </DialogTitle>
          <DialogDescription>
            {t("settings.providers.importExport.description")}
          </DialogDescription>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as TabValue)}
          className="w-full"
        >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="export" data-testid="export-tab">
              <Download className="h-4 w-4 mr-2" />
              {t("settings.providers.importExport.tab.export")}
            </TabsTrigger>
            <TabsTrigger value="import" data-testid="import-tab">
              <Upload className="h-4 w-4 mr-2" />
              {t("settings.providers.importExport.tab.import")}
            </TabsTrigger>
          </TabsList>

          {/* 导出 Tab */}
          <TabsContent value="export" className="space-y-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="include-keys"
                checked={includeKeys}
                onCheckedChange={(checked) => setIncludeKeys(checked === true)}
                data-testid="include-keys-checkbox"
              />
              <Label htmlFor="include-keys" className="text-sm">
                {t("settings.providers.importExport.export.includeKeyMetadata")}
              </Label>
            </div>

            {!exportedConfig ? (
              <Button
                onClick={handleExport}
                disabled={exporting}
                className="w-full"
                data-testid="export-button"
              >
                {exporting
                  ? t(
                      "settings.providers.importExport.export.action.generating",
                    )
                  : t("settings.providers.importExport.export.action.generate")}
              </Button>
            ) : (
              <div className="space-y-3">
                <Textarea
                  value={exportedConfig}
                  readOnly
                  className="h-[200px] font-mono text-xs"
                  data-testid="export-config-textarea"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={handleCopy}
                    className="flex-1"
                    data-testid="copy-button"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 mr-2" />
                        {t(
                          "settings.providers.importExport.export.action.copied",
                        )}
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        {t(
                          "settings.providers.importExport.export.action.copy",
                        )}
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={handleDownload}
                    className="flex-1"
                    data-testid="download-button"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {t(
                      "settings.providers.importExport.export.action.download",
                    )}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          {/* 导入 Tab */}
          <TabsContent value="import" className="space-y-4">
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1"
                  data-testid="select-file-button"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {t(
                    "settings.providers.importExport.import.action.selectFile",
                  )}
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  className="hidden"
                  data-testid="file-input"
                />
              </div>

              <div className="text-center text-sm text-muted-foreground">
                {t("settings.providers.importExport.import.pasteJson")}
              </div>

              <Textarea
                value={importConfig}
                onChange={(e) => {
                  setImportConfig(e.target.value);
                  setError(null);
                  setImportResult(null);
                }}
                placeholder='{"version": "1.0", "providers": [...]}'
                className="h-[200px] font-mono text-xs"
                data-testid="import-config-textarea"
              />

              <Button
                onClick={handleImport}
                disabled={importing || !importConfig.trim()}
                className="w-full"
                data-testid="import-button"
              >
                {importing
                  ? t("settings.providers.importExport.import.action.importing")
                  : t("settings.providers.importExport.import.action.submit")}
              </Button>
            </div>

            {/* 导入结果 */}
            {importResult && (
              <div
                className={`p-3 rounded-lg text-sm ${
                  importResult.success
                    ? "bg-green-50 text-green-700"
                    : "bg-yellow-50 text-yellow-700"
                }`}
                data-testid="import-result"
              >
                <div className="font-medium mb-1">
                  {importResult.success
                    ? t("settings.providers.importExport.import.result.success")
                    : t(
                        "settings.providers.importExport.import.result.partial",
                      )}
                </div>
                <ul className="list-disc list-inside space-y-1">
                  <li>
                    {t(
                      "settings.providers.importExport.import.result.importedProviders",
                      {
                        count: importResult.imported_providers,
                      },
                    )}
                  </li>
                  <li>
                    {t(
                      "settings.providers.importExport.import.result.skippedProviders",
                      {
                        count: importResult.skipped_providers,
                      },
                    )}
                  </li>
                  {importResult.errors.length > 0 && (
                    <li className="text-red-600">
                      {t(
                        "settings.providers.importExport.import.result.errors",
                        {
                          errors: importResult.errors.join(", "),
                        },
                      )}
                    </li>
                  )}
                </ul>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* 错误提示 */}
        {error && (
          <div
            className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700"
            data-testid="error-message"
          >
            <AlertCircle className="h-4 w-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <DialogFooter className="mt-6 pt-4 border-t">
          <Button
            variant="outline"
            onClick={handleClose}
            data-testid="close-button"
          >
            {t("settings.providers.importExport.action.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
