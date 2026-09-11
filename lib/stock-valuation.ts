import type { StockAssetType } from "@/lib/taiwan-stock";
import {
  listStockClosingPrices,
  upsertStockClosingPrices,
} from "@/models/StockClosingPrice";

const TWSE_STOCK_DAY_URL =
  "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY";
const TPEX_CLOSE_URL =
  "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes";

export const SELLING_FEE_RATE = 0.001425;

const TRANSACTION_TAX_RATES: Record<StockAssetType, number> = {
  stock: 0.003,
  stockEtf: 0.001,
  bondEtf: 0,
};

type ClosingQuote = {
  close: number;
  quoteDate: string;
};

export type StockValuation = ClosingQuote & {
  grossMarketValue: number;
  estimatedSellingFee: number;
  transactionTaxRate: number;
  estimatedTransactionTax: number;
  holdingMarketValue: number;
  unrealizedProfitLoss: number;
  unrealizedProfitLossRate: number;
};

type TwseStockDayResponse = {
  stat?: unknown;
  data?: unknown;
};

type TpexCloseRecord = {
  Date?: unknown;
  SecuritiesCompanyCode?: unknown;
  Close?: unknown;
};

function getTaipeiCandidateDates(): string[] {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const taipeiToday = Date.UTC(values.year, values.month - 1, values.day);

  return Array.from({ length: 10 }, (_, daysAgo) =>
    new Date(taipeiToday - daysAgo * 86_400_000).toISOString().slice(0, 10),
  );
}

function parsePrice(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const price = Number(String(value).replaceAll(",", "").trim());
  return Number.isFinite(price) && price > 0 ? price : null;
}

function parseRocDate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const digits = value.replaceAll("/", "").trim();

  if (!/^\d{7}$/.test(digits)) {
    return null;
  }

  const year = Number(digits.slice(0, 3)) + 1911;
  return `${year}-${digits.slice(3, 5)}-${digits.slice(5, 7)}`;
}

async function fetchTpexQuotes(): Promise<Map<string, ClosingQuote>> {
  const response = await fetch(TPEX_CLOSE_URL, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`櫃買中心行情回應異常（HTTP ${response.status}）`);
  }

  const data: unknown = await response.json();

  if (!Array.isArray(data)) {
    throw new Error("櫃買中心行情格式不正確");
  }

  const quotes = new Map<string, ClosingQuote>();

  for (const rawRecord of data) {
    const record = rawRecord as TpexCloseRecord;
    const quoteDate = parseRocDate(record.Date);
    const close = parsePrice(record.Close);

    if (
      typeof record.SecuritiesCompanyCode === "string" &&
      quoteDate &&
      close !== null
    ) {
      quotes.set(record.SecuritiesCompanyCode.trim(), { close, quoteDate });
    }
  }

  return quotes;
}

async function fetchTwseQuote(
  stockCode: string,
  candidateDates: string[],
): Promise<ClosingQuote | null> {
  const months = [
    ...new Set(candidateDates.map((date) => date.slice(0, 7).replace("-", ""))),
  ];
  const responses = await Promise.all(
    months.map(async (month) => {
      const response = await fetch(
        `${TWSE_STOCK_DAY_URL}?date=${month}01&stockNo=${encodeURIComponent(stockCode)}&response=json`,
        {
          cache: "no-store",
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (!response.ok) {
        throw new Error(`證交所行情回應異常（HTTP ${response.status}）`);
      }

      return (await response.json()) as TwseStockDayResponse;
    }),
  );
  const quotes = responses.flatMap((response) => {
    if (response.stat !== "OK" || !Array.isArray(response.data)) {
      return [];
    }

    return response.data.flatMap((rawRow) => {
      if (!Array.isArray(rawRow)) {
        return [];
      }

      const quoteDate = parseRocDate(rawRow[0]);
      const close = parsePrice(rawRow[6]);
      return quoteDate && close !== null ? [{ close, quoteDate }] : [];
    });
  });

  return (
    candidateDates
      .map((date) => quotes.find((quote) => quote.quoteDate === date))
      .find((quote): quote is ClosingQuote => Boolean(quote)) ?? null
  );
}

export function calculateStockValuation(
  quote: ClosingQuote,
  assetType: StockAssetType,
  shares: number,
  principal: number,
): StockValuation {
  const grossMarketValue = shares * quote.close;
  const estimatedSellingFee = grossMarketValue * SELLING_FEE_RATE;
  const transactionTaxRate = TRANSACTION_TAX_RATES[assetType];
  const estimatedTransactionTax = grossMarketValue * transactionTaxRate;
  const holdingMarketValue =
    grossMarketValue - estimatedSellingFee - estimatedTransactionTax;
  const unrealizedProfitLoss = holdingMarketValue - principal;

  return {
    ...quote,
    grossMarketValue,
    estimatedSellingFee,
    transactionTaxRate,
    estimatedTransactionTax,
    holdingMarketValue,
    unrealizedProfitLoss,
    unrealizedProfitLossRate: unrealizedProfitLoss / principal,
  };
}

export async function getStoredClosingQuotes(
  stockCodes: string[],
): Promise<Map<string, ClosingQuote>> {
  const uniqueStockCodes = [...new Set(stockCodes)];
  const storedDocuments = await listStockClosingPrices(uniqueStockCodes);

  return new Map(
    storedDocuments.map((document) => [
      document.stockCode,
      { close: document.close, quoteDate: document.quoteDate },
    ]),
  );
}

export async function refreshClosingQuotes(
  stockCodes: string[],
): Promise<Map<string, ClosingQuote>> {
  const uniqueStockCodes = [...new Set(stockCodes)];

  const candidateDates = getTaipeiCandidateDates();
  const allowedDates = new Set(candidateDates);
  let tpexQuotes = new Map<string, ClosingQuote>();

  try {
    tpexQuotes = await fetchTpexQuotes();
  } catch (error) {
    console.error("Failed to fetch TPEx closing quotes", error);
  }

  const quoteEntries = await Promise.all(
    uniqueStockCodes.map(async (stockCode) => {
      const tpexQuote = tpexQuotes.get(stockCode);

      if (tpexQuote && allowedDates.has(tpexQuote.quoteDate)) {
        return [stockCode, tpexQuote] as const;
      }

      try {
        const twseQuote = await fetchTwseQuote(stockCode, candidateDates);
        return twseQuote ? ([stockCode, twseQuote] as const) : null;
      } catch (error) {
        console.error(`Failed to fetch TWSE close for ${stockCode}`, error);
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

  return new Map(fetchedQuoteEntries);
}
