import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "default";
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmText,
  cancelText,
  variant = "danger",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTranslation("common");
  const variantStyles = {
    danger: {
      icon: "text-red-500",
      button: "bg-red-600 hover:bg-red-700 text-white",
    },
    warning: {
      icon: "text-yellow-500",
      button: "bg-yellow-600 hover:bg-yellow-700 text-white",
    },
    default: {
      icon: "text-primary",
      button: "bg-primary hover:bg-primary/90 text-primary-foreground",
    },
  };

  const styles = variantStyles[variant];
  const resolvedTitle =
    title ??
    t("common.confirmDialog.title", {
      defaultValue: "确认操作",
    });
  const resolvedConfirmText =
    confirmText ??
    t("common.confirm", {
      defaultValue: "确定",
    });
  const resolvedCancelText =
    cancelText ??
    t("common.cancel", {
      defaultValue: "取消",
    });

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      maxWidth="max-w-sm"
      showCloseButton={false}
    >
      <div className="p-6">
        <div className="flex items-start gap-4">
          <div className={`mt-0.5 ${styles.icon}`}>
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold">{resolvedTitle}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{message}</p>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border px-4 py-2 text-sm hover:bg-muted"
          >
            {resolvedCancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm ${styles.button}`}
          >
            {resolvedConfirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
