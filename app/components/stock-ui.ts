export type StockAssetType = "stock" | "stockEtf" | "bondEtf";

export type StockPosition = {
  id: string;
  stockCode: string;
  stockName: string;
  assetType: StockAssetType;
  shares: number;
  principal: number;
  valuation: {
    close: number;
    quoteDate: string;
    grossMarketValue: number;
    estimatedSellingFee: number;
    transactionTaxRate: number;
    estimatedTransactionTax: number;
    holdingMarketValue: number;
    unrealizedProfitLoss: number;
    unrealizedProfitLossRate: number;
  } | null;
};

export const assetTypeLabels: Record<StockAssetType, string> = {
  stock: "股票",
  stockEtf: "股票 ETF",
  bondEtf: "債券 ETF",
};

export const currencyFormatter = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

export const numberFormatter = new Intl.NumberFormat("zh-TW");

export const priceFormatter = new Intl.NumberFormat("zh-TW", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const percentageFormatter = new Intl.NumberFormat("zh-TW", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

export async function readApiError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error || `操作失敗（HTTP ${response.status}）`;
}
