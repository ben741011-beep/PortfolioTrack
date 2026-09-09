const TWSE_STOCK_URL =
  "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL";
const TWSE_FUND_URL =
  "https://openapi.twse.com.tw/v1/opendata/t187ap47_L";
const TPEX_STOCK_URL =
  "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes";
const TPEX_ETF_PRODUCT_URL = "https://info.tpex.org.tw/api/etfProduct";

type TwseStockRecord = {
  Code?: unknown;
  Name?: unknown;
};

type TwseFundRecord = {
  基金代號?: unknown;
  基金類型?: unknown;
  "標的指數/追蹤指數名稱"?: unknown;
};

type TpexStockRecord = {
  SecuritiesCompanyCode?: unknown;
  CompanyName?: unknown;
};

type TpexEtfProduct = {
  stockNo?: unknown;
  etfCate?: unknown;
};

export type StockAssetType = "stock" | "stockEtf" | "bondEtf";

export type TaiwanStock = {
  stockCode: string;
  stockName: string;
  market: "TWSE" | "TPEx";
  assetType: StockAssetType;
};

export class StockMarketServiceError extends Error {}

export function normalizeStockCode(value: unknown): string {
  if (typeof value !== "string") {
    throw new TypeError("股票代號必須是字串");
  }

  const stockCode = value.trim().toUpperCase();

  if (!/^[0-9A-Z]{1,20}$/.test(stockCode)) {
    throw new TypeError("股票代號格式不正確");
  }

  return stockCode;
}

async function fetchStockRecords<T>(
  url: string,
  serviceName: string,
): Promise<T[]> {
  let response: Response;

  try {
    response = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new StockMarketServiceError(`目前無法連線至${serviceName}`);
  }

  if (!response.ok) {
    throw new StockMarketServiceError(
      `${serviceName}回應異常（HTTP ${response.status}）`,
    );
  }

  try {
    const records: unknown = await response.json();

    if (!Array.isArray(records)) {
      throw new Error("Response is not an array");
    }

    return records as T[];
  } catch {
    throw new StockMarketServiceError(`${serviceName}回傳格式不正確`);
  }
}

async function fetchTpexEtfProduct(stockCode: string): Promise<TpexEtfProduct> {
  let response: Response;

  try {
    response = await fetch(
      `${TPEX_ETF_PRODUCT_URL}?lang=zh-tw&query=${encodeURIComponent(stockCode)}`,
      {
        method: "POST",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    throw new StockMarketServiceError("目前無法連線至櫃買中心 ETF 商品資料");
  }

  if (!response.ok) {
    throw new StockMarketServiceError(
      `櫃買中心 ETF 商品資料回應異常（HTTP ${response.status}）`,
    );
  }

  try {
    const product: unknown = await response.json();

    if (!product || typeof product !== "object" || Array.isArray(product)) {
      throw new Error("Response is not an object");
    }

    return product as TpexEtfProduct;
  } catch {
    throw new StockMarketServiceError("櫃買中心 ETF 商品資料回傳格式不正確");
  }
}

function classifyTwseAsset(
  stockCode: string,
  funds: TwseFundRecord[],
): StockAssetType {
  const fund = funds.find((record) => record.基金代號 === stockCode);

  if (!fund) {
    return "stock";
  }

  const description = [fund.基金類型, fund["標的指數/追蹤指數名稱"]]
    .filter((value): value is string => typeof value === "string")
    .join(" ");

  if (/債券|固定收益/.test(description) || /[BCD]$/.test(stockCode)) {
    return "bondEtf";
  }

  return "stockEtf";
}

function classifyTpexAsset(
  stockCode: string,
  product: TpexEtfProduct,
): StockAssetType {
  if (product.stockNo !== stockCode) {
    return "stock";
  }

  if (typeof product.etfCate !== "string" || !product.etfCate.trim()) {
    throw new StockMarketServiceError("櫃買中心 ETF 商品缺少證券類別");
  }

  return /債券|固定收益/.test(product.etfCate) || /[BCD]$/.test(stockCode)
    ? "bondEtf"
    : "stockEtf";
}

async function findTwseStock(stockCode: string): Promise<TaiwanStock | null> {
  const [records, funds] = await Promise.all([
    fetchStockRecords<TwseStockRecord>(TWSE_STOCK_URL, "臺灣證券交易所"),
    fetchStockRecords<TwseFundRecord>(
      TWSE_FUND_URL,
      "臺灣證券交易所基金基本資料",
    ),
  ]);
  const matched = records.find((record) => record.Code === stockCode);

  if (!matched || typeof matched.Name !== "string" || !matched.Name.trim()) {
    return null;
  }

  return {
    stockCode,
    stockName: matched.Name.trim(),
    market: "TWSE",
    assetType: classifyTwseAsset(stockCode, funds),
  };
}

async function findTpexStock(stockCode: string): Promise<TaiwanStock | null> {
  const [records, product] = await Promise.all([
    fetchStockRecords<TpexStockRecord>(TPEX_STOCK_URL, "證券櫃檯買賣中心"),
    fetchTpexEtfProduct(stockCode),
  ]);
  const matched = records.find(
    (record) => record.SecuritiesCompanyCode === stockCode,
  );

  if (
    !matched ||
    typeof matched.CompanyName !== "string" ||
    !matched.CompanyName.trim()
  ) {
    return null;
  }

  return {
    stockCode,
    stockName: matched.CompanyName.trim(),
    market: "TPEx",
    assetType: classifyTpexAsset(stockCode, product),
  };
}

export async function findTaiwanStock(
  value: unknown,
): Promise<TaiwanStock | null> {
  const stockCode = normalizeStockCode(value);
  const [twseResult, tpexResult] = await Promise.allSettled([
    findTwseStock(stockCode),
    findTpexStock(stockCode),
  ]);

  if (twseResult.status === "fulfilled" && twseResult.value) {
    return twseResult.value;
  }

  if (tpexResult.status === "fulfilled" && tpexResult.value) {
    return tpexResult.value;
  }

  if (twseResult.status === "rejected" || tpexResult.status === "rejected") {
    throw new StockMarketServiceError("股票資料來源暫時無法完整查詢");
  }

  return null;
}
