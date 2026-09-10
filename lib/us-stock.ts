import "server-only";

import type { UsStockAssetType } from "@/models/UsStockPosition";

const YAHOO_FINANCE_SEARCH_URL =
  "https://query1.finance.yahoo.com/v1/finance/search";

type YahooFinanceQuote = {
  symbol?: unknown;
  shortname?: unknown;
  longname?: unknown;
  quoteType?: unknown;
  typeDisp?: unknown;
  sector?: unknown;
  industry?: unknown;
};

type YahooFinanceSearchResponse = {
  quotes?: unknown;
};

export type UsStockProfile = {
  stockCode: string;
  stockName: string;
  assetType: UsStockAssetType;
};

export class UsStockServiceError extends Error {}

export function normalizeUsStockCode(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError("美股代號必須是文字");
  }

  const stockCode = value.trim().toUpperCase();

  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(stockCode)) {
    throw new TypeError("美股代號格式不正確");
  }

  return stockCode;
}

function classifyAssetType(quote: YahooFinanceQuote): UsStockAssetType | null {
  if (quote.quoteType === "EQUITY") {
    return "stock";
  }

  if (quote.quoteType !== "ETF") {
    return null;
  }

  const classificationText = [
    quote.longname,
    quote.shortname,
    quote.typeDisp,
    quote.sector,
    quote.industry,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  const isBondEtf =
    /\b(BOND|TREASUR(?:Y|IES)|FIXED[\s-]?INCOME|CORPORATE DEBT|MUNICIPAL|MORTGAGE|GOVERNMENT CREDIT|FLOATING RATE|HIGH YIELD)\b/i.test(
      classificationText,
    );

  return isBondEtf ? "bondEtf" : "stockEtf";
}

function readStockName(quote: YahooFinanceQuote): string | null {
  for (const value of [quote.longname, quote.shortname]) {
    if (typeof value === "string") {
      const stockName = value.trim();

      if (stockName && stockName.length <= 100) {
        return stockName;
      }
    }
  }

  return null;
}

export async function findUsStockProfile(
  value: unknown,
): Promise<UsStockProfile | null> {
  const stockCode = normalizeUsStockCode(value);
  const url = new URL(YAHOO_FINANCE_SEARCH_URL);
  url.searchParams.set("q", stockCode);
  url.searchParams.set("quotesCount", "10");
  url.searchParams.set("newsCount", "0");
  url.searchParams.set("enableFuzzyQuery", "false");

  let response: Response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 PortfolioTrack/1.0",
      },
      next: { revalidate: 86_400 },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new UsStockServiceError("目前無法連線至美股資料服務");
  }

  if (!response.ok) {
    throw new UsStockServiceError(
      response.status === 429
        ? "美股資料服務查詢過於頻繁，請稍後再試"
        : `美股資料服務回應異常（HTTP ${response.status}）`,
    );
  }

  let body: YahooFinanceSearchResponse;

  try {
    body = (await response.json()) as YahooFinanceSearchResponse;
  } catch {
    throw new UsStockServiceError("美股資料服務回傳格式不正確");
  }

  if (!Array.isArray(body.quotes)) {
    throw new UsStockServiceError("美股資料服務回傳格式不正確");
  }

  const quote = (body.quotes as YahooFinanceQuote[]).find(
    (item) =>
      typeof item.symbol === "string" &&
      item.symbol.trim().toUpperCase() === stockCode,
  );

  if (!quote) {
    return null;
  }

  const stockName = readStockName(quote);
  const assetType = classifyAssetType(quote);

  if (!stockName || !assetType) {
    return null;
  }

  return { stockCode, stockName, assetType };
}
