import type { SkillMarketplaceVisualAsset } from "@/lib/api/officialSkillMarketplace";
import { cn } from "@/lib/utils";
import type { ServiceSkillTone } from "@/components/agent/chat/service-skills/types";

function svgToDataUrl(svg?: string): string | null {
  const normalized = svg?.trim();
  if (!normalized || !normalized.startsWith("<svg")) {
    return null;
  }
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(normalized)}`;
}

function resolveVisualAssetSource(
  asset?: SkillMarketplaceVisualAsset,
): string | null {
  const url = asset?.url?.trim();
  if (url) {
    return url;
  }
  return svgToDataUrl(asset?.svg);
}

export function SkillsHeroBannerSvg() {
  return (
    <svg
      viewBox="0 0 320 150"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      className="h-full w-full"
    >
      <circle cx="225" cy="36" r="42" fill="#dff3ff" />
      <g transform="translate(178 12) rotate(-15)">
        <rect
          x="0"
          y="0"
          width="92"
          height="118"
          rx="5"
          fill="#fff"
          stroke="#e8eef2"
          strokeWidth="2"
        />
        <circle cx="30" cy="38" r="15" fill="#4ade80" />
        <circle cx="50" cy="44" r="15" fill="#fb7185" />
        <rect x="18" y="72" width="54" height="7" rx="3.5" fill="#cbd5e1" />
        <rect x="18" y="88" width="42" height="6" rx="3" fill="#e2e8f0" />
      </g>
      <g transform="translate(226 2) rotate(13)">
        <rect
          x="0"
          y="0"
          width="90"
          height="124"
          rx="5"
          fill="#fff"
          stroke="#e8eef2"
          strokeWidth="2"
        />
        <circle cx="32" cy="38" r="16" fill="#fb923c" />
        <path
          d="M51 28c13 4 18 20 9 31"
          fill="none"
          stroke="#22c55e"
          strokeLinecap="round"
          strokeWidth="9"
        />
        <rect x="16" y="78" width="54" height="7" rx="3.5" fill="#cbd5e1" />
        <rect x="16" y="94" width="38" height="6" rx="3" fill="#e2e8f0" />
      </g>
      <g transform="translate(262 75) rotate(15)">
        <rect
          x="0"
          y="0"
          width="74"
          height="54"
          rx="5"
          fill="#fff"
          stroke="#e8eef2"
          strokeWidth="2"
        />
        <circle cx="24" cy="27" r="13" fill="#38bdf8" />
        <path
          d="M45 18c9 5 12 14 6 24"
          fill="none"
          stroke="#f43f5e"
          strokeLinecap="round"
          strokeWidth="5"
        />
      </g>
    </svg>
  );
}

export function SkillTileSvg({ tone = "emerald" }: { tone?: ServiceSkillTone }) {
  const fillByTone: Record<ServiceSkillTone, string> = {
    amber: "#f59e0b",
    emerald: "#10b981",
    sky: "#0ea5e9",
    slate: "#475569",
  };
  const fill = fillByTone[tone];

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="h-10 w-10">
      <rect x="3" y="3" width="42" height="42" rx="13" fill="#fff" />
      <rect
        x="3"
        y="3"
        width="42"
        height="42"
        rx="13"
        fill={fill}
        opacity="0.1"
      />
      <rect
        x="3"
        y="3"
        width="42"
        height="42"
        rx="13"
        stroke={fill}
        strokeOpacity="0.22"
        strokeWidth="2"
      />
      <path
        d="M24 12 34 18v12l-10 6-10-6V18l10-6Z"
        fill={fill}
        opacity="0.9"
      />
      <path
        d="m18 20 6 4 6-4M24 24v8"
        fill="none"
        stroke="#fff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
    </svg>
  );
}

export function MarketplaceSkillVisual({
  asset,
  title,
  tone = "emerald",
  variant = "icon",
}: {
  asset?: SkillMarketplaceVisualAsset;
  title: string;
  tone?: ServiceSkillTone;
  variant?: "icon" | "cover";
}) {
  const source = resolveVisualAssetSource(asset);
  if (!source) {
    return (
      <div
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden bg-white",
          variant === "cover" ? "h-full w-full" : "h-10 w-10 rounded-xl",
        )}
      >
        <SkillTileSvg tone={tone} />
      </div>
    );
  }

  return (
    <img
      src={source}
      alt={title}
      className={cn(
        "shrink-0 object-cover",
        variant === "cover"
          ? "h-full w-full"
          : "h-10 w-10 rounded-xl border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)]",
      )}
    />
  );
}
