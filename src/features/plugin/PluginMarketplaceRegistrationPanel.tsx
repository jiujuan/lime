import type { FormEvent } from "react";
import type { PluginMarketplaceViewItem } from "./marketplace/pluginMarketplaceViewModel";

export interface PluginMarketplaceRegistrationPanelProps {
  item: PluginMarketplaceViewItem;
  code: string;
  pending: boolean;
  onCodeChange: (pluginId: string, code: string) => void;
  onSubmit: (item: PluginMarketplaceViewItem) => void;
  t: (key: string) => string;
}

export function PluginMarketplaceRegistrationPanel({
  item,
  code,
  pending,
  onCodeChange,
  onSubmit,
  t,
}: PluginMarketplaceRegistrationPanelProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(item);
  }

  return (
    <section
      className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4"
      data-testid="plugin-marketplace-registration-panel"
    >
      <h3 className="m-0 text-sm font-semibold text-amber-800">
        {t("plugin.marketplace.registration.title")}
      </h3>
      <p className="mt-2 text-sm leading-6 text-amber-800">
        {t("plugin.marketplace.registration.description")}
      </p>
      <form className="mt-3 flex gap-2" onSubmit={handleSubmit}>
        <input
          className="min-w-0 flex-1 rounded-full border border-amber-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`plugin-marketplace-registration-code-${item.pluginId}`}
          value={code}
          disabled={pending}
          placeholder={t("plugin.marketplace.registration.placeholder")}
          aria-label={t("plugin.marketplace.registration.placeholder")}
          onChange={(event) => onCodeChange(item.pluginId, event.target.value)}
        />
        <button
          type="submit"
          className="shrink-0 rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          data-testid={`plugin-marketplace-registration-submit-${item.pluginId}`}
          disabled={pending || !code.trim()}
        >
          {pending
            ? t("plugin.marketplace.action.pending")
            : t("plugin.marketplace.registration.submit")}
        </button>
      </form>
    </section>
  );
}
