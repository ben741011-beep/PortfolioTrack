import type { DividendSource } from "@/models/DividendRecord";
import type { StockPositionDocument } from "@/models/StockPosition";

const TWSE_STOCK_DIVIDEND_URL =
  "https://openapi.twse.com.tw/v1/exchangeReport/TWT48U_ALL";
const TPEX_STOCK_DIVIDEND_URL =
  "https://www.tpex.org.tw/openapi/v1/tpex_exright_prepost";
const TWSE_ETF_DIVIDEND_URL =
  "https://www.twse.com.tw/zh/ETFortune/dividendList";
const TPEX_ETF_DIVIDEND_URL = "https://info.tpex.org.tw/api/etfExDiv";
const SOURCE_TIMEOUT_MS = 12_000;
const FIRST_SUPPORTED_YEAR = 2005;

type JsonObject = Record<string, unknown>;

export interface ExternalDividendEvent {
  stockCode: string;
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
        source: "twseStock",
        exDividendDate,
        recordDate: null,
        paymentDate: null,
        dividendPerShare,
      },
    ];
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
    startDate: String(FIRST_SUPPORTED_YEAR),
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
    startDate: `${FIRST_SUPPORTED_YEAR}0101`,
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
  const [twseStocks, tpexStocks, ...etfResults] = await Promise.all([
    fetchTwseStockDividends(stockCodes),
    fetchTpexStockDividends(stockCodes),
    ...etfCodes.map((stockCode) =>
      fetchEtfDividends(stockCode, currentYear),
    ),
  ]);

  return deduplicateEvents([
    ...twseStocks,
    ...tpexStocks,
    ...etfResults.flat(),
  ]);
}
