import { useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { Check, CircleHelp, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  type McpElicitationFormContent,
  type McpElicitationFormIssue,
  type McpElicitationFormValue,
  type McpServerElicitationController,
  type PendingMcpServerElicitation,
} from "@/lib/api/mcpServerElicitation";

interface McpField {
  defaultValue?: McpElicitationFormValue;
  description?: string;
  enumNames?: string[];
  enumValues?: string[];
  format?: string;
  key: string;
  maximum?: number;
  maxLength?: number;
  minimum?: number;
  minLength?: number;
  required: boolean;
  title: string;
  type: "boolean" | "integer" | "number" | "string";
}

type SubmissionAction = "accept" | "cancel" | "decline";

export function McpServerElicitationDialog({
  controller,
}: {
  controller: McpServerElicitationController;
}) {
  const pending = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const request = pending[0];

  return request ? (
    <McpServerElicitationForm
      key={request.key}
      controller={controller}
      request={request}
    />
  ) : null;
}

function McpServerElicitationForm({
  controller,
  request,
}: {
  controller: McpServerElicitationController;
  request: PendingMcpServerElicitation;
}) {
  const { t } = useTranslation("agent");
  const fields = useMemo(
    () => readFields(request.params.requestedSchema),
    [request.params.requestedSchema],
  );
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(
      fields
        .filter(
          (field) =>
            field.defaultValue !== undefined ||
            (field.type === "boolean" && field.required),
        )
        .map((field) => [field.key, initialFieldValue(field)]),
    ),
  );
  const [issues, setIssues] = useState<McpElicitationFormIssue[]>([]);
  const [submitting, setSubmitting] = useState<SubmissionAction | null>(null);

  const settle = (action: SubmissionAction) => {
    if (submitting) {
      return;
    }
    setSubmitting(action);
    if (action === "decline") {
      controller.decline(request.key);
      return;
    }
    if (action === "cancel") {
      controller.cancel(request.key);
      return;
    }
    const { content, localIssues } = buildTypedContent(fields, values);
    if (localIssues.length > 0) {
      setIssues(localIssues);
      setSubmitting(null);
      return;
    }
    const validationIssues = controller.accept(request.key, content);
    if (validationIssues.length > 0) {
      setIssues(validationIssues);
      setSubmitting(null);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && settle("cancel")}>
      <DialogContent className="border-border p-0" maxWidth="max-w-xl">
        <DialogHeader className="border-b border-border px-5 py-4 pr-12">
          <DialogTitle className="flex items-center gap-2 text-base">
            <CircleHelp className="h-5 w-5 text-emerald-600" />
            {t("agentChat.mcpElicitation.title")}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t("agentChat.mcpElicitation.server", {
              server: request.params.serverName,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 space-y-5 overflow-y-auto px-5 py-4">
          <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">
            {request.params.message}
          </p>

          <div className="space-y-4">
            {fields.map((field) => {
              const fieldIssues = issues.filter(
                (issue) => issue.field === field.key,
              );
              const inputId = `mcp-elicitation-${request.key}-${field.key}`;
              return (
                <div className="space-y-1.5" key={field.key}>
                  <label
                    className="block text-sm font-medium text-foreground"
                    htmlFor={inputId}
                  >
                    {field.title}
                    {field.required ? (
                      <span className="ml-1 text-red-600" aria-hidden="true">
                        *
                      </span>
                    ) : null}
                  </label>
                  {field.description ? (
                    <p className="text-xs leading-5 text-muted-foreground">
                      {field.description}
                    </p>
                  ) : null}
                  <McpFieldInput
                    disabled={submitting !== null}
                    field={field}
                    id={inputId}
                    value={values[field.key]}
                    onChange={(value) => {
                      setValues((current) => ({
                        ...current,
                        [field.key]: value,
                      }));
                      setIssues((current) =>
                        current.filter((issue) => issue.field !== field.key),
                      );
                    }}
                  />
                  {fieldIssues.map((issue) => (
                    <p
                      className="text-xs text-red-600"
                      data-testid={`mcp-elicitation-error-${field.key}`}
                      key={`${issue.code}:${issue.field}`}
                    >
                      {t(`agentChat.mcpElicitation.validation.${issue.code}`)}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-border px-5 py-4 sm:space-x-0">
          <Button
            type="button"
            variant="ghost"
            disabled={submitting !== null}
            onClick={() => settle("cancel")}
          >
            <X className="mr-2 h-4 w-4" />
            {t("agentChat.mcpElicitation.action.cancel")}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={submitting !== null}
            onClick={() => settle("decline")}
          >
            {submitting === "decline" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : null}
            {t("agentChat.mcpElicitation.action.decline")}
          </Button>
          <Button
            type="button"
            disabled={submitting !== null}
            onClick={() => settle("accept")}
          >
            {submitting === "accept" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Check className="mr-2 h-4 w-4" />
            )}
            {t("agentChat.mcpElicitation.action.accept")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function McpFieldInput({
  disabled,
  field,
  id,
  onChange,
  value,
}: {
  disabled: boolean;
  field: McpField;
  id: string;
  onChange: (value: unknown) => void;
  value: unknown;
}) {
  const { t } = useTranslation("agent");
  if (field.type === "boolean") {
    return (
      <label
        className="flex h-10 items-center gap-3 rounded-md border border-border bg-background px-3 text-sm"
        htmlFor={id}
      >
        <input
          checked={value === true}
          disabled={disabled}
          id={id}
          type="checkbox"
          onChange={(event) => onChange(event.target.checked)}
        />
        {t("agentChat.mcpElicitation.booleanLabel")}
      </label>
    );
  }
  if (field.enumValues) {
    return (
      <select
        className="flex h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 focus-visible:ring-offset-2 disabled:opacity-50"
        disabled={disabled}
        id={id}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">
          {t("agentChat.mcpElicitation.selectPlaceholder")}
        </option>
        {field.enumValues.map((option, index) => (
          <option key={option} value={option}>
            {field.enumNames?.[index] || option}
          </option>
        ))}
      </select>
    );
  }
  const numeric = field.type === "number" || field.type === "integer";
  return (
    <Input
      disabled={disabled}
      id={id}
      max={field.maximum}
      maxLength={field.maxLength}
      min={field.minimum}
      minLength={field.minLength}
      step={field.type === "integer" ? 1 : numeric ? "any" : undefined}
      type={numeric ? "number" : htmlInputType(field.format)}
      value={
        typeof value === "string" || typeof value === "number" ? value : ""
      }
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function readFields(schema: Record<string, unknown>): McpField[] {
  const properties = schema.properties as Record<
    string,
    Record<string, unknown>
  >;
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter(
          (value): value is string => typeof value === "string",
        )
      : [],
  );
  return Object.entries(properties).map(([key, field]) => ({
    ...(isPrimitiveValue(field.default) ? { defaultValue: field.default } : {}),
    ...(typeof field.description === "string"
      ? { description: field.description }
      : {}),
    ...(Array.isArray(field.enumNames)
      ? { enumNames: field.enumNames.filter(isString) }
      : {}),
    ...(Array.isArray(field.enum)
      ? { enumValues: field.enum.filter(isString) }
      : {}),
    ...(typeof field.format === "string" ? { format: field.format } : {}),
    key,
    ...(typeof field.maximum === "number" ? { maximum: field.maximum } : {}),
    ...(typeof field.maxLength === "number"
      ? { maxLength: field.maxLength }
      : {}),
    ...(typeof field.minimum === "number" ? { minimum: field.minimum } : {}),
    ...(typeof field.minLength === "number"
      ? { minLength: field.minLength }
      : {}),
    required: required.has(key),
    title: typeof field.title === "string" ? field.title : key,
    type: field.type as McpField["type"],
  }));
}

function buildTypedContent(
  fields: McpField[],
  values: Record<string, unknown>,
): {
  content: McpElicitationFormContent;
  localIssues: McpElicitationFormIssue[];
} {
  const content: McpElicitationFormContent = {};
  const localIssues: McpElicitationFormIssue[] = [];
  for (const field of fields) {
    const value = values[field.key];
    if (field.type === "boolean") {
      if (typeof value === "boolean") {
        content[field.key] = value;
      } else if (field.required) {
        localIssues.push({ code: "missing_required", field: field.key });
      }
      continue;
    }
    if (value === undefined || value === "") {
      if (field.required) {
        localIssues.push({ code: "missing_required", field: field.key });
      }
      continue;
    }
    if (field.type === "string") {
      if (typeof value !== "string") {
        localIssues.push({ code: "invalid_type", field: field.key });
        continue;
      }
      if (field.format === "date-time") {
        const rfc3339 = localDateTimeToRfc3339(value);
        if (!rfc3339) {
          localIssues.push({ code: "invalid_format", field: field.key });
          continue;
        }
        content[field.key] = rfc3339;
      } else {
        content[field.key] = value;
      }
      continue;
    }
    const number = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(number)) {
      localIssues.push({ code: "invalid_number", field: field.key });
      continue;
    }
    if (field.type === "integer" && !Number.isInteger(number)) {
      localIssues.push({ code: "invalid_integer", field: field.key });
      continue;
    }
    content[field.key] = number;
  }
  return { content, localIssues };
}

function initialFieldValue(field: McpField): McpElicitationFormValue {
  if (field.defaultValue !== undefined) {
    if (
      field.type === "string" &&
      field.format === "date-time" &&
      typeof field.defaultValue === "string"
    ) {
      return rfc3339ToLocalDateTime(field.defaultValue) ?? field.defaultValue;
    }
    return field.defaultValue;
  }
  return false;
}

function rfc3339ToLocalDateTime(value: string): string | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return [
    `${date.getFullYear()}`.padStart(4, "0"),
    "-",
    `${date.getMonth() + 1}`.padStart(2, "0"),
    "-",
    `${date.getDate()}`.padStart(2, "0"),
    "T",
    `${date.getHours()}`.padStart(2, "0"),
    ":",
    `${date.getMinutes()}`.padStart(2, "0"),
    ":",
    `${date.getSeconds()}`.padStart(2, "0"),
  ].join("");
}

function localDateTimeToRfc3339(value: string): string | undefined {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(
      value,
    );
  if (!match) return undefined;
  const [year, month, day, hour, minute, second] = match
    .slice(1, 7)
    .map((part) => Number(part ?? 0));
  const millisecond = Number((match[7] ?? "").padEnd(3, "0"));
  const date = new Date(
    year,
    month - 1,
    day,
    hour,
    minute,
    second,
    millisecond,
  );
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return undefined;
  }
  return date.toISOString();
}

function htmlInputType(format: string | undefined): string {
  switch (format) {
    case "email":
      return "email";
    case "date":
      return "date";
    case "date-time":
      return "datetime-local";
    case "uri":
      return "url";
    default:
      return "text";
  }
}

function isPrimitiveValue(value: unknown): value is McpElicitationFormValue {
  return (
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  );
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
