import "server-only";

import {
  listStockClosingPricesFetchedSince,
  upsertStockClosingPrices,
} from "@/models/StockClosingPrice";

const YAHOO_FINANCE_CHART_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart";

type ClosingQuote = {
  close: number;
  quoteDate: string;
};

export type UsStockValuation = ClosingQuote & {
  holdingMarketValue: number;
  unrealizedProfitLoss: number;
  unrealizedProfitLossRate: number;
};

type YahooFinanceChartResponse = {
  chart?: {
    error?: unknown;
    result?: unknown;
  };
};

type YahooFinanceChartResult = {
  meta?: {
    currency?: unknown;
    exchangeTimezoneName?: unknown;
    currentTradingPeriod?: {
      regular?: {
        end?: unknown;
      };
    };
  };
  timestamp?: unknown;
  indicators?: {
    quote?: unknown;
  };
};

type YahooFinanceQuoteSeries = {
  close?: unknown;
};

function getTaipeiDayStart(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return new Date(`${values.year}-${values.month}-${values.day}T00:00:00+08:00`);
}

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

async function fetchYahooClosingQuote(
  stockCode: string,
): Promise<ClosingQuote | null> {
  const url = new URL(`${YAHOO_FINANCE_CHART_URL}/${stockCode}`);
  url.searchParams.set("range", "10d");
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

  if (!response.ok) {
    throw new Error(`Yahoo Finance 行情回應異常（HTTP ${response.status}）`);
  }

  const body = (await response.json()) as YahooFinanceChartResponse;
  const rawResult = Array.isArray(body.chart?.result)
    ? body.chart.result[0]
    : null;

  if (!rawResult || typeof rawResult !== "object") {
    return null;
  }

  const result = rawResult as YahooFinanceChartResult;

  if (
    result.meta?.currency !== "USD" ||
    typeof result.meta.exchangeTimezoneName !== "string" ||
    !Array.isArray(result.timestamp) ||
    !Array.isArray(result.indicators?.quote)
  ) {
    return null;
  }

  const series = result.indicators.quote[0] as
    | YahooFinanceQuoteSeries
    | undefined;

  if (!Array.isArray(series?.close)) {
    return null;
  }

  const closeValues = series.close;
  const exchangeTimezoneName = result.meta.exchangeTimezoneName;
  const regularSessionEnd = result.meta.currentTradingPeriod?.regular?.end;
  const currentSessionHasEnded =
    typeof regularSessionEnd === "number" &&
    Date.now() >= regularSessionEnd * 1_000;
  const exchangeToday = formatQuoteDate(
    Math.floor(Date.now() / 1_000),
    exchangeTimezoneName,
  );
  const quotes = result.timestamp.flatMap((rawTimestamp, index) => {
    const rawClose = closeValues[index];

    if (
      typeof rawTimestamp !== "number" ||
      typeof rawClose !== "number" ||
      !Number.isFinite(rawClose) ||
      rawClose <= 0
    ) {
      return [];
    }

    const quoteDate = formatQuoteDate(
      rawTimestamp,
      exchangeTimezoneName,
    );

    if (!currentSessionHasEnded && quoteDate === exchangeToday) {
      return [];
    }

    return [{ close: rawClose, quoteDate }];
  });

  return quotes.at(-1) ?? null;
}

export function calculateUsStockValuation(
  quote: ClosingQuote,
  shares: number,
  principal: number,
): UsStockValuation {
  const holdingMarketValue = shares * quote.close;
  const unrealizedProfitLoss = holdingMarketValue - principal;

  return {
    ...quote,
    holdingMarketValue,
    unrealizedProfitLoss,
    unrealizedProfitLossRate: unrealizedProfitLoss / principal,
  };
}

export async function getLatestUsClosingQuotes(
  stockCodes: string[],
): Promise<Map<string, ClosingQuote>> {
  const uniqueStockCodes = [...new Set(stockCodes)];
  const cachedDocuments = await listStockClosingPricesFetchedSince(
    uniqueStockCodes,
    getTaipeiDayStart(),
  );
  const cachedQuotes = new Map(
    cachedDocuments.map((document) => [
      document.stockCode,
      { close: document.close, quoteDate: document.quoteDate },
    ]),
  );
  const missingStockCodes = uniqueStockCodes.filter(
    (stockCode) => !cachedQuotes.has(stockCode),
  );

  if (missingStockCodes.length === 0) {
    return cachedQuotes;
  }

  const quoteEntries = await Promise.all(
    missingStockCodes.map(async (stockCode) => {
      try {
        const quote = await fetchYahooClosingQuote(stockCode);
        return quote ? ([stockCode, quote] as const) : null;
      } catch (error) {
        console.error(`Failed to fetch US close for ${stockCode}`, error);
        return null;
      }
    }),
  );
  const fetchedQuoteEntries = quoteEntries.filter(
    (entry): entry is readonly [string, ClosingQuote] => entry !== null,
  );

  await upsertStockClosingPrices(
    fetchedQuoteEntries.map(([stockCode, quote]) => ({ stockCode, ...quote })),
  );

  return new Map([...cachedQuotes, ...fetchedQuoteEntries]);
}
