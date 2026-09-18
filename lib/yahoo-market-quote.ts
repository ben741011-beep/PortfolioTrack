export type MarketQuote = {
  price: number;
  quoteDate: string;
};

type YahooFinanceChartResponse = {
  chart?: {
    result?: unknown;
  };
};

type YahooFinanceChartResult = {
  meta?: {
    symbol?: unknown;
    currency?: unknown;
    exchangeTimezoneName?: unknown;
    regularMarketPrice?: unknown;
    regularMarketTime?: unknown;
  };
};

type Market = {
  currency: "TWD" | "USD";
  timeZone: "Asia/Taipei" | "America/New_York";
};

const YAHOO_FINANCE_CHART_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart";

function formatQuoteDate(timestamp: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp * 1_000));
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

export function parseYahooMarketQuote(
  body: YahooFinanceChartResponse,
  symbol: string,
  market: Market,
  now = Date.now(),
): MarketQuote | null {
  const rawResult = Array.isArray(body.chart?.result)
    ? body.chart.result[0]
    : null;

  if (!rawResult || typeof rawResult !== "object") return null;

  const result = rawResult as YahooFinanceChartResult;
  const price = result.meta?.regularMarketPrice;
  const marketTime = result.meta?.regularMarketTime;

  if (
    result.meta?.symbol !== symbol ||
    result.meta.currency !== market.currency ||
    result.meta.exchangeTimezoneName !== market.timeZone ||
    typeof price !== "number" ||
    !Number.isFinite(price) ||
    price <= 0 ||
    typeof marketTime !== "number" ||
    !Number.isSafeInteger(marketTime) ||
    marketTime <= 0 ||
    marketTime * 1_000 > now + 5 * 60 * 1_000
  ) {
    return null;
  }

  return {
    price,
    quoteDate: formatQuoteDate(marketTime, market.timeZone),
  };
}

export async function fetchYahooMarketQuote(
  symbol: string,
  market: Market,
): Promise<{ status: "notFound" } | { status: "found"; quote: MarketQuote | null }> {
  const url = new URL(`${YAHOO_FINANCE_CHART_URL}/${encodeURIComponent(symbol)}`);
  url.searchParams.set("range", "1d");
  url.searchParams.set("interval", "1d");
  url.searchParams.set("includePrePost", "false");
  url.searchParams.set("events", "history");

  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mozilla/5.0 PortfolioTrack/1.0",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (response.status === 404) return { status: "notFound" };
  if (!response.ok) {
    throw new Error(`Yahoo Finance 行情回應異常（HTTP ${response.status}）`);
  }

  return {
    status: "found",
    quote: parseYahooMarketQuote(await response.json(), symbol, market),
  };
}
