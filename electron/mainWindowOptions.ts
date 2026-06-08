import type { BrowserWindowConstructorOptions } from "electron";

export type MainWindowChromeOptions = Pick<
  BrowserWindowConstructorOptions,
  "titleBarStyle" | "trafficLightPosition"
>;

export type MainWindowStartupOptions = Pick<
  BrowserWindowConstructorOptions,
  "backgroundColor" | "show"
>;

interface MainWindowStartupHtmlOptions {
  appName: string;
  iconDataUrl?: string | null;
  locale?: string;
  slogan?: string;
  subtitle?: string;
}

const FALLBACK_STARTUP_LOGO_SVG = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#064E3B"/><stop offset="35%" stop-color="#10B981"/><stop offset="70%" stop-color="#84CC16"/><stop offset="100%" stop-color="#D9F99D"/></linearGradient><linearGradient id="starGrad" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#22C55E"/><stop offset="100%" stop-color="#ECFCCB"/></linearGradient><filter id="macOSVolume" x="-15%" y="-15%" width="130%" height="130%"><feOffset dx="2" dy="2" in="SourceAlpha" result="lightOffset"/><feComposite operator="out" in="SourceAlpha" in2="lightOffset" result="lightEdge"/><feFlood flood-color="#ffffff" flood-opacity="0.6" result="lightColor"/><feComposite operator="in" in="lightColor" in2="lightEdge" result="lightRim"/><feOffset dx="-3" dy="-3" in="SourceAlpha" result="darkOffset"/><feComposite operator="out" in="SourceAlpha" in2="darkOffset" result="darkEdge"/><feFlood flood-color="#022C22" flood-opacity="0.5" result="darkColor"/><feComposite operator="in" in="darkColor" in2="darkEdge" result="darkRim"/><feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#022C22" flood-opacity="0.15" in="SourceGraphic" result="shadowedGraphic"/><feMerge><feMergeNode in="shadowedGraphic"/><feMergeNode in="lightRim"/><feMergeNode in="darkRim"/></feMerge></filter><mask id="ringMask"><rect width="512" height="512" fill="white"/><line x1="256" y1="256" x2="-20" y2="256" stroke="black" stroke-width="14"/><line x1="256" y1="256" x2="-20" y2="532" stroke="black" stroke-width="14"/><line x1="256" y1="256" x2="256" y2="532" stroke="black" stroke-width="14"/></mask></defs><g filter="url(#macOSVolume)"><g mask="url(#ringMask)"><path d="M 256 56 A 200 200 0 0 0 56 256 A 200 200 0 0 0 256 456 A 200 200 0 0 0 456 256 L 336 256 A 80 80 0 0 1 256 336 A 80 80 0 0 1 176 256 A 80 80 0 0 1 256 176 Z" fill="url(#ringGrad)"/></g><path d="M 256 220 Q 256 256 292 256 Q 256 256 256 292 Q 256 256 220 256 Q 256 256 256 220 Z" fill="#10B981"/><path d="M 356 92 Q 356 156 420 156 Q 356 156 356 220 Q 356 156 292 156 Q 356 156 356 92 Z" fill="url(#starGrad)"/><circle cx="436" cy="62" r="10" fill="#D9F99D"/><circle cx="456" cy="100" r="5" fill="#84CC16"/></g></svg>`;

const FALLBACK_STARTUP_LOGO_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  FALLBACK_STARTUP_LOGO_SVG,
)}`;

const MAIN_WINDOW_STARTUP_COPY = {
  "zh-CN": {
    slogan: "青柠一下，灵感即来",
    subtitle: "从一句想法，到成稿、成图、成片、成事",
  },
  "zh-TW": {
    slogan: "青檸一下，靈感即來",
    subtitle: "從一句想法，到成稿、成圖、成片、成事",
  },
  "en-US": {
    slogan: "Tap Lime, inspiration arrives",
    subtitle:
      "From one thought to polished copy, images, videos, and finished work",
  },
  "ja-JP": {
    slogan: "Lime で、ひらめきをすぐに",
    subtitle: "一つのアイデアから、原稿・画像・動画・成果まで",
  },
  "ko-KR": {
    slogan: "Lime으로, 영감이 바로",
    subtitle: "한 줄의 아이디어에서 글, 이미지, 영상, 완성된 일까지",
  },
} as const;

export function buildMainWindowStartupOptions(): MainWindowStartupOptions {
  return {
    backgroundColor: "#f7fbf4",
    show: false,
  };
}

export function buildMainWindowStartupHtml({
  appName,
  iconDataUrl,
  locale,
  slogan,
  subtitle,
}: MainWindowStartupHtmlOptions): string {
  const copy = resolveMainWindowStartupCopy(locale);
  const escapedAppName = escapeHtml(appName);
  const escapedSlogan = escapeHtml(slogan ?? copy.slogan);
  const escapedSubtitle = escapeHtml(subtitle ?? copy.subtitle);
  const startupLogoSrc = resolveStartupLogoDataUrl(iconDataUrl);
  const logoMarkup = `<img class="startup-logo" src="${escapeHtml(startupLogoSrc)}" alt="${escapedAppName}" data-lime-startup-logo />`;

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      :root {
        color-scheme: light;
        background: #f7fbf4;
      }

      html,
      body {
        width: 100%;
        height: 100%;
        margin: 0;
        overflow: hidden;
        background:
          radial-gradient(circle at 20% 18%, rgba(132, 204, 22, 0.18), transparent 30%),
          radial-gradient(circle at 78% 12%, rgba(250, 204, 21, 0.14), transparent 28%),
          radial-gradient(circle at 50% 84%, rgba(34, 197, 94, 0.1), transparent 28%),
          linear-gradient(180deg, #fbfff8 0%, #edf5ea 48%, #fbfff8 100%);
        color: #0f172a;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
        -webkit-app-region: drag;
        user-select: none;
      }

      body {
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .startup-orb {
        position: absolute;
        border-radius: 999px;
        filter: blur(40px);
        animation: startup-orb-float 10s ease-in-out infinite;
        pointer-events: none;
      }

      .startup-orb-primary {
        top: -72px;
        left: -56px;
        width: 280px;
        height: 280px;
        background: rgba(132, 204, 22, 0.22);
      }

      .startup-orb-secondary {
        top: 8%;
        right: -96px;
        width: 340px;
        height: 340px;
        background: rgba(250, 204, 21, 0.14);
        animation-delay: -2.2s;
      }

      .startup-orb-tertiary {
        bottom: -84px;
        left: 18%;
        width: 260px;
        height: 260px;
        background: rgba(34, 197, 94, 0.14);
        animation-delay: -4s;
      }

      .startup-stage {
        position: relative;
        z-index: 1;
        width: min(860px, calc(100vw - 40px));
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        opacity: 1;
      }

      .startup-logo-stack {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        width: min(360px, 78vw);
        height: min(360px, 78vw);
      }

      .startup-logo-glow {
        position: absolute;
        inset: 12% 12% 16%;
        border-radius: 999px;
        background: radial-gradient(
          circle,
          rgba(163, 230, 53, 0.4) 0%,
          rgba(163, 230, 53, 0.16) 38%,
          rgba(250, 204, 21, 0.1) 60%,
          transparent 78%
        );
        filter: blur(26px);
        animation: startup-glow-pulse 2.8s ease-in-out infinite;
      }

      .startup-logo {
        position: relative;
        width: clamp(240px, 34vw, 320px);
        height: clamp(240px, 34vw, 320px);
        object-fit: contain;
        animation: startup-logo-float 4.2s ease-in-out infinite;
        filter: drop-shadow(0 28px 44px rgba(15, 23, 42, 0.16));
      }

      .startup-copy {
        position: relative;
        margin-top: 12px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
      }

      .startup-copy-glow {
        position: absolute;
        inset: 0 auto auto;
        width: min(420px, 92vw);
        height: 112px;
        border-radius: 999px;
        background: radial-gradient(
          circle,
          rgba(163, 230, 53, 0.24) 0%,
          rgba(250, 204, 21, 0.18) 36%,
          transparent 74%
        );
        filter: blur(26px);
        pointer-events: none;
      }

      .startup-slogan {
        position: relative;
        margin: 22px 0 0;
        max-width: 18em;
        font-size: clamp(28px, 4vw, 38px);
        line-height: 1.16;
        font-weight: 700;
        letter-spacing: -0.04em;
        color: #0f172a;
        text-wrap: balance;
        text-shadow:
          0 0 18px rgba(163, 230, 53, 0.26),
          0 10px 30px rgba(15, 23, 42, 0.1),
          0 0 42px rgba(250, 204, 21, 0.14);
      }

      .startup-slogan::before {
        content: "";
        position: absolute;
        inset: 12% -10% -18%;
        z-index: -1;
        border-radius: 999px;
        background: radial-gradient(
          circle,
          rgba(163, 230, 53, 0.36) 0%,
          rgba(250, 204, 21, 0.2) 34%,
          rgba(255, 255, 255, 0.12) 52%,
          transparent 76%
        );
        filter: blur(30px);
        transform: scale(1.02);
      }

      .startup-slogan::after {
        content: "";
        position: absolute;
        inset: auto 12% -6% 12%;
        z-index: -1;
        height: 18px;
        border-radius: 999px;
        background: linear-gradient(
          90deg,
          rgba(132, 204, 22, 0) 0%,
          rgba(132, 204, 22, 0.42) 18%,
          rgba(250, 204, 21, 0.45) 50%,
          rgba(132, 204, 22, 0.42) 82%,
          rgba(132, 204, 22, 0) 100%
        );
        filter: blur(16px);
        opacity: 0.95;
      }

      .startup-subtitle {
        position: relative;
        margin: 0;
        max-width: min(33em, calc(100vw - 56px));
        font-size: clamp(15px, 2vw, 18px);
        line-height: 1.72;
        font-weight: 500;
        letter-spacing: 0;
        color: #667085;
        text-wrap: balance;
        text-shadow: 0 1px 0 rgba(255, 255, 255, 0.35);
      }

      .startup-progress-track {
        position: relative;
        overflow: hidden;
        margin-top: 30px;
        width: min(320px, 72vw);
        height: 8px;
        border-radius: 999px;
        background: linear-gradient(90deg, rgba(226, 232, 240, 0.82) 0%, rgba(226, 232, 240, 0.96) 100%);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.32),
          0 12px 28px rgba(15, 23, 42, 0.08);
      }

      .startup-progress-bar {
        position: absolute;
        inset: 0 auto 0 0;
        width: 44%;
        border-radius: inherit;
        background: linear-gradient(
          90deg,
          rgba(132, 204, 22, 0.96) 0%,
          rgba(250, 204, 21, 0.9) 100%
        );
        box-shadow: 0 0 24px rgba(163, 230, 53, 0.35);
        animation: startup-progress-shift 1.6s ease-in-out infinite;
      }

      @keyframes startup-orb-float {
        0%,
        100% {
          transform: translate3d(0, 0, 0) scale(1);
        }

        50% {
          transform: translate3d(0, -16px, 0) scale(1.06);
        }
      }

      @keyframes startup-logo-float {
        0%,
        100% {
          transform: translateY(0);
        }

        50% {
          transform: translateY(-8px);
        }
      }

      @keyframes startup-glow-pulse {
        0%,
        100% {
          opacity: 0.58;
          transform: scale(0.96);
        }

        50% {
          opacity: 1;
          transform: scale(1.04);
        }
      }

      @keyframes startup-progress-shift {
        0% {
          transform: translateX(-38%) scaleX(0.78);
          opacity: 0.56;
        }

        50% {
          opacity: 1;
          transform: translateX(10%) scaleX(1);
        }

        100% {
          transform: translateX(76%) scaleX(0.82);
          opacity: 0.56;
        }
      }

      @media (max-width: 640px) {
        .startup-logo {
          width: min(260px, 72vw);
          height: min(260px, 72vw);
        }

        .startup-slogan {
          margin-top: 16px;
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .startup-orb,
        .startup-logo,
        .startup-logo-glow,
        .startup-progress-bar {
          animation: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="startup-orb startup-orb-primary" aria-hidden="true"></div>
    <div class="startup-orb startup-orb-secondary" aria-hidden="true"></div>
    <div class="startup-orb startup-orb-tertiary" aria-hidden="true"></div>
    <main class="startup-stage" data-lime-startup-shell>
      <div class="startup-logo-stack">
        <div class="startup-logo-glow" aria-hidden="true"></div>
        ${logoMarkup}
      </div>
      <div class="startup-copy">
        <div class="startup-copy-glow" aria-hidden="true"></div>
        <h1 class="startup-slogan">${escapedSlogan}</h1>
        <p class="startup-subtitle">${escapedSubtitle}</p>
      </div>
      <div class="startup-progress-track" aria-hidden="true">
        <div class="startup-progress-bar"></div>
      </div>
    </main>
  </body>
</html>`;
}

export function resolveMainWindowStartupCopy(locale?: string): {
  slogan: string;
  subtitle: string;
} {
  const normalizedLocale = String(locale || "").toLowerCase();
  if (normalizedLocale.startsWith("zh-tw") || normalizedLocale.includes("hant")) {
    return MAIN_WINDOW_STARTUP_COPY["zh-TW"];
  }
  if (normalizedLocale.startsWith("en")) {
    return MAIN_WINDOW_STARTUP_COPY["en-US"];
  }
  if (normalizedLocale.startsWith("ja")) {
    return MAIN_WINDOW_STARTUP_COPY["ja-JP"];
  }
  if (normalizedLocale.startsWith("ko")) {
    return MAIN_WINDOW_STARTUP_COPY["ko-KR"];
  }
  return MAIN_WINDOW_STARTUP_COPY["zh-CN"];
}

export function buildMainWindowStartupDataUrl(html: string): string {
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

export function resolveStartupLogoDataUrl(iconDataUrl?: string | null): string {
  const normalizedIconDataUrl = iconDataUrl?.trim();
  return normalizedIconDataUrl || FALLBACK_STARTUP_LOGO_DATA_URL;
}

export function buildMainWindowChromeOptions(
  platform: NodeJS.Platform = process.platform,
): MainWindowChromeOptions {
  if (platform !== "darwin") {
    return {};
  }

  return {
    titleBarStyle: "hidden",
    trafficLightPosition: { x: 18, y: 18 },
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
