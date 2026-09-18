import type { StockAssetType } from "@/lib/taiwan-stock";
import {
  fetchYahooMarketQuote,
  type MarketQuote,
} from "@/lib/yahoo-market-quote";
import {
  listStockClosingPrices,
  upsertStockClosingPrices,
} from "@/models/StockClosingPrice";

export const SELLING_FEE_RATE = 0.001425;

const TRANSACTION_TAX_RATES: Record<StockAssetType, number> = {
  stock: 0.003,
  stockEtf: 0.001,
  bondEtf: 0,
};

export type StockValuation = MarketQuote & {
  grossMarketValue: number;
  estimatedSellingFee: number;
  transactionTaxRate: number;
  estimatedTransactionTax: number;
  holdingMarketValue: number;
  unrealizedProfitLoss: number;
  unrealizedProfitLossRate: number;
};

async function fetchTaiwanMarketQuote(stockCode: string): Promise<MarketQuote | null> {
  const market = { currency: "TWD", timeZone: "Asia/Taipei" } as const;
  const listed = await fetchYahooMarketQuote(`${stockCode}.TW`, market);
  if (listed.status === "found") return listed.quote;

  // The position schema has no market field. A 404 identifies a different venue.
  const otc = await fetchYahooMarketQuote(`${stockCode}.TWO`, market);
  return otc.status === "found" ? otc.quote : null;
}

export function calculateStockValuation(
  quote: MarketQuote,
  assetType: StockAssetType,
  shares: number,
  principal: number,
): StockValuation {
  const grossMarketValue = shares * quote.price;
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

export async function getStoredTwMarketQuotes(
  stockCodes: string[],
): Promise<Map<string, MarketQuote>> {
  const uniqueStockCodes = [...new Set(stockCodes)];
  const storedDocuments = await listStockClosingPrices(uniqueStockCodes);

  return new Map(
    storedDocuments.map((document) => [
      document.stockCode,
      { price: document.close, quoteDate: document.quoteDate },
    ]),
  );
}

export async function refreshTwMarketQuotes(
  stockCodes: string[],
): Promise<Map<string, MarketQuote>> {
  const uniqueStockCodes = [...new Set(stockCodes)];
  const quoteEntries = await Promise.all(
    uniqueStockCodes.map(async (stockCode) => {
      try {
        const quote = await fetchTaiwanMarketQuote(stockCode);
        return quote ? ([stockCode, quote] as const) : null;
      } catch (error) {
        console.error(`Failed to fetch Taiwan market quote for ${stockCode}`, error);
        return null;
      }
    }),
  );
  const fetchedQuoteEntries = quoteEntries.filter(
    (entry): entry is readonly [string, MarketQuote] => entry !== null,
  );

  await upsertStockClosingPrices(
    fetchedQuoteEntries.map(([stockCode, quote]) => ({
      stockCode,
      close: quote.price,
      quoteDate: quote.quoteDate,
    })),
  );

  return new Map(fetchedQuoteEntries);
}
