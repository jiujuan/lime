import { cn } from "@/lib/utils";
import type {
  ButtonComponent,
  TextComponent,
  A2UIComponent,
  A2UIEvent,
} from "../../../types";
import { getComponentById, resolveDynamicValue } from "../../../parser";

interface ButtonRendererProps {
  component: ButtonComponent;
  components: A2UIComponent[];
  data: Record<string, unknown>;
  onAction: (event: A2UIEvent) => void;
  scopePath?: string;
}

const variantClass: Record<string, string> = {
  primary:
    "border border-neutral-900 bg-neutral-900 text-white shadow-none hover:bg-neutral-800",
  borderless:
    "border border-transparent text-[color:var(--lime-text-muted)] shadow-none hover:border-slate-200 hover:bg-slate-50 hover:text-[color:var(--lime-text-strong)]",
};

export function ButtonRenderer({
  component,
  components,
  data,
  onAction,
  scopePath = "/",
}: ButtonRendererProps) {
  const child = getComponentById(components, component.child);
  const label =
    child && child.component === "Text"
      ? resolveDynamicValue((child as TextComponent).text, data, "", scopePath)
      : "";

  const resolveContextValue = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map((item) => resolveContextValue(item));
    }

    if (
      typeof value === "object" &&
      value !== null &&
      "path" in value &&
      typeof (value as { path: unknown }).path === "string"
    ) {
      return resolveDynamicValue(
        value as { path: string },
        data,
        undefined,
        scopePath,
      );
    }

    if (typeof value === "object" && value !== null) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
          key,
          resolveContextValue(entry),
        ]),
      );
    }

    return value;
  };

  const handleClick = () => {
    let actionName = "";
    let actionContext: Record<string, unknown> | undefined;

    if ("event" in component.action) {
      actionName = component.action.event.name;
      actionContext = component.action.event.context
        ? (resolveContextValue(component.action.event.context) as Record<
            string,
            unknown
          >)
        : undefined;
    } else if ("functionCall" in component.action) {
      actionName = component.action.functionCall.call;
      actionContext = component.action.functionCall.args
        ? (resolveContextValue(component.action.functionCall.args) as Record<
            string,
            unknown
          >)
        : undefined;
    } else if ("name" in component.action) {
      actionName = component.action.name;
      actionContext = component.action.context
        ? (resolveContextValue(component.action.context) as Record<
            string,
            unknown
          >)
        : undefined;
    }

    onAction({
      type: "action",
      componentId: component.id,
      action: {
        name: actionName,
        context: actionContext,
      },
    });
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "inline-flex h-8 items-center justify-center rounded-[8px] px-3 text-[12px] font-medium transition-colors",
        variantClass[component.variant || "primary"],
      )}
    >
      {String(label)}
    </button>
  );
}

export const Button = ButtonRenderer;
