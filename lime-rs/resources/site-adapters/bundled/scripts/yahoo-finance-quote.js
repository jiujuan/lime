async (args, helpers) => {
  const symbol = String(args.symbol || "").trim().toUpperCase();
  if (!symbol) {
    return {
      ok: false,
      error_code: "invalid_args",
      error_message: "symbol 不能为空。",
    };
  }

  const normalizeText = (value) => {
    const text = String(value ?? "").replace(/\s+/g, " ").trim();
    return text || null;
  };
  const normalizeNumber = (value) => {
    if (value === undefined || value === null || value === "") {
      return null;
    }
    const text = String(value).replace(/,/g, "").replace(/%/g, "").trim();
    const number = Number(text);
    return Number.isFinite(number) ? number : null;
  };
  const buildResult = (item) => ({
    ok: true,
    data: {
      symbol,
      items: [item],
      count: 1,
    },
    source_url: location.href,
  });

  try {
    const chartUrl =
      "https://query1.finance.yahoo.com/v8/finance/chart/" +
      encodeURIComponent(symbol) +
      "?interval=1d&range=1d";
    const response = await fetch(chartUrl, { credentials: "include" });
    if (response.ok) {
      const payload = await response.json();
      const chart = payload?.chart?.result?.[0];
      if (chart) {
        const meta = chart.meta || {};
        const previousClose = meta.previousClose ?? meta.chartPreviousClose ?? null;
        const price = meta.regularMarketPrice ?? null;
        const change =
          price != null && previousClose != null ? price - previousClose : null;
        const changePercent =
          change != null && previousClose
            ? Number(((change / previousClose) * 100).toFixed(2))
            : null;
        return buildResult({
          symbol: meta.symbol || symbol,
          name: meta.shortName || meta.longName || symbol,
          price: price != null ? Number(price.toFixed(2)) : null,
          change: change != null ? Number(change.toFixed(2)) : null,
          changePercent,
          open: chart.indicators?.quote?.[0]?.open?.[0] ?? null,
          high: meta.regularMarketDayHigh ?? null,
          low: meta.regularMarketDayLow ?? null,
          volume: meta.regularMarketVolume ?? null,
          marketCap: meta.marketCap ?? null,
        });
      }
    }
  } catch {}

  await helpers.waitFor(
    () =>
      document.querySelector('[data-testid="qsp-price"]') ||
      document.querySelector('fin-streamer[data-field="regularMarketPrice"]') ||
      document.querySelector("h1"),
    12000,
    300,
  );

  const titleText = normalizeText(document.querySelector("h1")?.textContent);
  const item = {
    symbol,
    name: titleText
      ? titleText.replace(/\s*\([^)]+\)\s*$/, "").trim() || symbol
      : symbol,
    price: normalizeNumber(
      document.querySelector('[data-testid="qsp-price"]')?.textContent ||
        document.querySelector('fin-streamer[data-field="regularMarketPrice"]')
          ?.textContent,
    ),
    change: normalizeNumber(
      document.querySelector('[data-testid="qsp-price-change"]')?.textContent ||
        document.querySelector('fin-streamer[data-field="regularMarketChange"]')
          ?.textContent,
    ),
    changePercent: normalizeNumber(
      document.querySelector('[data-testid="qsp-price-change-percent"]')
        ?.textContent ||
        document.querySelector(
          'fin-streamer[data-field="regularMarketChangePercent"]',
        )?.textContent,
    ),
    open: normalizeNumber(
      document.querySelector('[data-test="OPEN-value"]')?.textContent,
    ),
    high: normalizeNumber(
      document.querySelector('[data-test="DAYS_RANGE-value"]')
        ?.textContent?.split(" - ")
        ?.at(1),
    ),
    low: normalizeNumber(
      document.querySelector('[data-test="DAYS_RANGE-value"]')
        ?.textContent?.split(" - ")
        ?.at(0),
    ),
    volume: normalizeNumber(
      document.querySelector('[data-test="TD_VOLUME-value"]')?.textContent,
    ),
    marketCap: normalizeText(
      document.querySelector('[data-test="MARKET_CAP-value"]')?.textContent,
    ),
  };

  if (item.price != null || item.name !== symbol) {
    return buildResult(item);
  }

  return {
    ok: true,
    data: {
      symbol,
      items: [],
      count: 0,
    },
    source_url: location.href,
  };
};
