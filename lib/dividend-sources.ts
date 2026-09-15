import {
  DIVIDEND_START_YEAR,
  type DividendSource,
} from "@/models/DividendRecord";
import type { StockPositionDocument } from "@/models/StockPosition";
import type { UsStockPositionDocument } from "@/models/UsStockPosition";

const TWSE_STOCK_DIVIDEND_URL =
  "https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL";
const TWSE_STOCK_DIVIDEND_HISTORY_URL =
  "https://www.twse.com.tw/rwd/zh/exRight/TWT49U";
const TPEX_STOCK_DIVIDEND_URL =
  "https://www.tpex.org.tw/openapi/v1/tpex_exright_prepost";
const TWSE_ETF_DIVIDEND_URL =
  "https://www.twse.com.tw/zh/ETFortune/dividendList";
const TPEX_ETF_DIVIDEND_URL = "https://info.tpex.org.tw/api/etfExDiv";
const YAHOO_FINANCE_CHART_URL =
  "https://query1.finance.yahoo.com/v8/finance/chart";
const SOURCE_TIMEOUT_MS = 12_000;

type JsonObject = Record<string, unknown>;

export interface ExternalDividendEvent {
  stockCode: string;
  market: "tw" | "us";
  source: DividendSource;
  exDividendDate: Date;
  recordDate: Date | null;
  paymentDate: Date | null;
  dividendPerShare: number;
}

export class DividendSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DividendSourceError";
  }
}

function createSourceSignal() {
  return AbortSignal.timeout(SOURCE_TIMEOUT_MS);
}

function parsePositiveNumber(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const normalized = String(value)
    .replace(/<[^>]*>/g, "")
    .replaceAll(",", "")
    .trim();
  const parsed = Number(normalized);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseTaiwanDate(value: unknown): Date | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  const compactMatch = normalized.match(/^(\d{3})(\d{2})(\d{2})$/);
  const displayMatch = normalized.match(/^(\d{3})年(\d{2})月(\d{2})日$/);
  const match = compactMatch ?? displayMatch;

  if (!match) {
    return null;
  }

  const year = Number(match[1]) + 1911;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return date;
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: createSourceSignal(),
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new DividendSourceError(
      `股息來源回應錯誤：${response.status} ${response.statusText}`,
    );
  }

  return response.json();
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: createSourceSignal(),
    headers: { Accept: "text/html" },
  });

  if (!response.ok) {
    throw new DividendSourceError(
      `股息來源回應錯誤：${response.status} ${response.statusText}`,
    );
  }

  return response.text();
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stripHtml(value: string) {
  return value
    .replace(/<[^>]*>/g, " ")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"')
    .replace(/\s+/g, " ")
    .trim();
}

function deduplicateEvents(events: ExternalDividendEvent[]) {
  return [
    ...new Map(
      events.map((event) => [
        `${event.source}:${event.stockCode}:${event.exDividendDate.toISOString()}`,
        event,
      ]),
    ).values(),
  ];
}

async function fetchTwseStockDividends(
  stockCodes: Set<string>,
): Promise<ExternalDividendEvent[]> {
  if (stockCodes.size === 0) {
    return [];
  }

  const payload = await fetchJson(TWSE_STOCK_DIVIDEND_URL);

  if (!Array.isArray(payload)) {
    throw new DividendSourceError("證交所股票除息資料格式錯誤");
  }

  return payload.flatMap((row): ExternalDividendEvent[] => {
    if (!isJsonObject(row)) {
      return [];
    }

    const stockCode = typeof row.Code === "string" ? row.Code.trim() : "";
    const exDividendDate = parseTaiwanDate(row.Date);
    const dividendPerShare = parsePositiveNumber(row.CashDividend);

    if (
      !stockCodes.has(stockCode) ||
      !exDividendDate ||
      dividendPerShare === null
    ) {
      return [];
    }

    return [
      {
        stockCode,
        market: "tw",
        source: "twseStock",
        exDividendDate,
        recordDate: null,
        paymentDate: null,
        dividendPerShare,
      },
    ];
  });
}

async function fetchTwseHistoricalStockDividends(
  stockCodes: Set<string>,
  currentYear: number,
): Promise<ExternalDividendEvent[]> {
  if (stockCodes.size === 0) {
    return [];
  }

  const years = Array.from(
    { length: currentYear - DIVIDEND_START_YEAR + 1 },
    (_, index) => DIVIDEND_START_YEAR + index,
  );
  const payloads = await Promise.all(
    years.map((year) => {
      const query = new URLSearchParams({
        startDate: `${year}0101`,
        endDate: `${year}1231`,
        response: "json",
      });

      return fetchJson(`${TWSE_STOCK_DIVIDEND_HISTORY_URL}?${query}`);
    }),
  );

  return payloads.flatMap((payload): ExternalDividendEvent[] => {
    if (!isJsonObject(payload) || !Array.isArray(payload.data)) {
      throw new DividendSourceError("證交所股票歷史除息資料格式錯誤");
    }

    return payload.data.flatMap((row): ExternalDividendEvent[] => {
      if (!Array.isArray(row) || row.length < 7 || row[6] !== "息") {
        return [];
      }

      const stockCode = typeof row[1] === "string" ? row[1].trim() : "";
      const exDividendDate = parseTaiwanDate(row[0]);
      const dividendPerShare = parsePositiveNumber(row[5]);

      if (
        !stockCodes.has(stockCode) ||
        !exDividendDate ||
        dividendPerShare === null
      ) {
        return [];
      }

      return [
        {
          stockCode,
          market: "tw",
          source: "twseStock",
          exDividendDate,
          recordDate: null,
          paymentDate: null,
          dividendPerShare,
        },
      ];
    });
  });
}

async function fetchTpexStockDividends(
  stockCodes: Set<string>,
): Promise<ExternalDividendEvent[]> {
  if (stockCodes.size === 0) {
    return [];
  }

  const payload = await fetchJson(TPEX_STOCK_DIVIDEND_URL);

  if (!Array.isArray(payload)) {
    throw new DividendSourceError("櫃買中心股票除息資料格式錯誤");
  }

  return payload.flatMap((row): ExternalDividendEvent[] => {
    if (!isJsonObject(row)) {
      return [];
    }

    const stockCode =
      typeof row.SecuritiesCompanyCode === "string"
        ? row.SecuritiesCompanyCode.trim()
        : "";
    const exDividendDate = parseTaiwanDate(row.ExRrightsExDividendDate);
    const dividendPerShare = parsePositiveNumber(row.CashDividend);

    if (
      !stockCodes.has(stockCode) ||
      !exDividendDate ||
      dividendPerShare === null
    ) {
      return [];
    }

    return [
      {
        stockCode,
        market: "tw",
        source: "tpexStock",
        exDividendDate,
        recordDate: null,
        paymentDate: null,
        dividendPerShare,
      },
    ];
  });
}

async function fetchTwseEtfDividends(
  stockCode: string,
  currentYear: number,
): Promise<ExternalDividendEvent[]> {
  const query = new URLSearchParams({
    stkNo: stockCode,
    startDate: String(DIVIDEND_START_YEAR),
    endDate: String(currentYear),
  });
  const html = await fetchText(`${TWSE_ETF_DIVIDEND_URL}?${query}`);
  const tableBody = html.match(/<tbody>([\s\S]*?)<\/tbody>/i)?.[1];

  if (tableBody === undefined) {
    throw new DividendSourceError("證交所 ETF 配息資料格式錯誤");
  }

  const events: ExternalDividendEvent[] = [];

  for (const rowMatch of tableBody.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [
      ...rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi),
    ].map((match) => stripHtml(match[1]));

    if (cells.length < 6 || cells[0] !== stockCode) {
      continue;
    }

    const exDividendDate = parseTaiwanDate(cells[2]);
    const recordDate = parseTaiwanDate(cells[3]);
    const paymentDate = parseTaiwanDate(cells[4]);
    const dividendPerShare = parsePositiveNumber(cells[5]);

    if (!exDividendDate || dividendPerShare === null) {
      continue;
    }

    events.push({
      stockCode,
      market: "tw",
      source: "twseEtf",
      exDividendDate,
      recordDate,
      paymentDate,
      dividendPerShare,
    });
  }

  return events;
}

async function fetchTpexEtfDividends(
  stockCode: string,
  currentYear: number,
): Promise<ExternalDividendEvent[]> {
  const body = new URLSearchParams({
    stkNo: stockCode,
    startDate: `${DIVIDEND_START_YEAR}0101`,
    endDate: `${currentYear}1231`,
    lang: "zh-tw",
  });
  const payload = await fetchJson(TPEX_ETF_DIVIDEND_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
    },
    body,
  });

  if (!Array.isArray(payload)) {
    throw new DividendSourceError("櫃買中心 ETF 配息資料格式錯誤");
  }

  return payload.flatMap((row): ExternalDividendEvent[] => {
    if (!isJsonObject(row) || row.stockNo !== stockCode) {
      return [];
    }

    const exDividendDate = parseTaiwanDate(row.divDate);
    const dividendPerShare = parsePositiveNumber(row.amount);

    if (!exDividendDate || dividendPerShare === null) {
      return [];
    }

    return [
      {
        stockCode,
        market: "tw",
        source: "tpexEtf",
        exDividendDate,
        recordDate: parseTaiwanDate(row.inBaseDate),
        paymentDate: parseTaiwanDate(row.inDate),
        dividendPerShare,
      },
    ];
  });
}

async function fetchEtfDividends(
  stockCode: string,
  currentYear: number,
): Promise<ExternalDividendEvent[]> {
  const results = await Promise.allSettled([
    fetchTwseEtfDividends(stockCode, currentYear),
    fetchTpexEtfDividends(stockCode, currentYear),
  ]);
  const events = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  if (events.length === 0 && results.every((result) => result.status === "rejected")) {
    throw new DividendSourceError(`無法取得 ${stockCode} 的 ETF 配息資料`);
  }

  return events;
}

export async function fetchDividendEventsForPositions(
  positions: StockPositionDocument[],
): Promise<ExternalDividendEvent[]> {
  const currentYear = new Date().getUTCFullYear();
  const stockCodes = new Set(
    positions
      .filter((position) => position.assetType === "stock")
      .map((position) => position.stockCode),
  );
  const etfCodes = positions
    .filter((position) => position.assetType !== "stock")
    .map((position) => position.stockCode);
  const [twseStocks, twseHistoricalStocks, tpexStocks, ...etfResults] =
    await Promise.all([
      fetchTwseStockDividends(stockCodes),
      fetchTwseHistoricalStockDividends(stockCodes, currentYear),
      fetchTpexStockDividends(stockCodes),
      ...etfCodes.map((stockCode) =>
        fetchEtfDividends(stockCode, currentYear),
      ),
    ]);

  return deduplicateEvents([
    ...twseStocks,
    ...twseHistoricalStocks,
    ...tpexStocks,
    ...etfResults.flat(),
  ]).filter(
    (event) => event.exDividendDate.getUTCFullYear() >= DIVIDEND_START_YEAR,
  );
}

type YahooDividendEvent = {
  amount?: unknown;
  date?: unknown;
};

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      events?: { dividends?: Record<string, YahooDividendEvent> };
    }>;
  };
};

async function fetchUsDividendEvents(
  stockCode: string,
): Promise<ExternalDividendEvent[]> {
  const period1 = Math.floor(
    Date.UTC(DIVIDEND_START_YEAR, 0, 1) / 1_000,
  );
  const period2 = Math.floor((Date.now() + 86_400_000) / 1_000);
  const query = new URLSearchParams({
    period1: String(period1),
    period2: String(period2),
    interval: "1d",
    events: "div",
  });
  const payload = (await fetchJson(
    `${YAHOO_FINANCE_CHART_URL}/${encodeURIComponent(stockCode)}?${query}`,
  )) as YahooChartResponse;
  const dividends = payload.chart?.result?.[0]?.events?.dividends;

  if (!dividends) {
    return [];
  }

  return Object.values(dividends).flatMap((event) => {
    const dividendPerShare = parsePositiveNumber(event.amount);
    const timestamp =
      typeof event.date === "number" && Number.isFinite(event.date)
        ? event.date
        : null;

    if (dividendPerShare === null || timestamp === null) {
      return [];
    }

    const sourceDate = new Date(timestamp * 1_000);
    const exDividendDate = new Date(
      Date.UTC(
        sourceDate.getUTCFullYear(),
        sourceDate.getUTCMonth(),
        sourceDate.getUTCDate(),
      ),
    );

    return [
      {
        stockCode,
        market: "us" as const,
        source: "yahooUs" as const,
        exDividendDate,
        recordDate: null,
        paymentDate: null,
        dividendPerShare,
      },
    ];
  });
}

export async function fetchUsDividendEventsForPositions(
  positions: UsStockPositionDocument[],
): Promise<ExternalDividendEvent[]> {
  const results = await Promise.allSettled(
    positions.map((position) => fetchUsDividendEvents(position.stockCode)),
  );
  const events = results.flatMap((result) =>
    result.status === "fulfilled" ? result.value : [],
  );

  if (
    positions.length > 0 &&
    results.length > 0 &&
    results.every((result) => result.status === "rejected")
  ) {
    throw new DividendSourceError("無法取得美股配息資料");
  }

  return deduplicateEvents(events).filter(
    (event) => event.exDividendDate.getUTCFullYear() >= DIVIDEND_START_YEAR,
  );
}
