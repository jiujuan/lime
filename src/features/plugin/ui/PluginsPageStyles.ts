import type {
  AppCenterHostLifecycleTone,
  AppCenterSourceKind,
  AppCenterStatusKind,
} from "./PluginsPageViewModel";

export function appCenterStatusClass(status: AppCenterStatusKind): string {
  if (status === "installed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "installable") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (status === "update" || status === "registration") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (status === "disabled" || status === "partial") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function appCenterSourceClass(source: AppCenterSourceKind): string {
  if (source === "cloud") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  if (source === "local") {
    return "border-slate-200 bg-slate-50 text-slate-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export function hostLifecycleClass(tone: AppCenterHostLifecycleTone): string {
  if (tone === "emerald") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (tone === "amber") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (tone === "rose") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export function sourceStateClass(tone: string): string {
  if (tone === "emerald") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (tone === "amber") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  if (tone === "rose") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (tone === "sky") {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}
