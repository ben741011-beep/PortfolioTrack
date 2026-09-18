import "server-only";

import {
  listStockClosingPrices,
  upsertStockClosingPrices,
} from "@/models/StockClosingPrice";
import {
  fetchYahooMarketQuote,
  type MarketQuote,
} from "@/lib/yahoo-market-quote";

export type UsStockValuation = MarketQuote & {
  holdingMarketValue: number;
  unrealizedProfitLoss: number;
  unrealizedProfitLossRate: number;
};

export function calculateUsStockValuation(
  quote: MarketQuote,
  shares: number,
  principal: number,
): UsStockValuation {
  const holdingMarketValue = shares * quote.price;
  const unrealizedProfitLoss = holdingMarketValue - principal;

  return {
    ...quote,
    holdingMarketValue,
    unrealizedProfitLoss,
    unrealizedProfitLossRate: unrealizedProfitLoss / principal,
  };
}

export async function getStoredUsMarketQuotes(
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

export async function refreshUsMarketQuotes(
  stockCodes: string[],
): Promise<Map<string, MarketQuote>> {
  const uniqueStockCodes = [...new Set(stockCodes)];

  const quoteEntries = await Promise.all(
    uniqueStockCodes.map(async (stockCode) => {
      try {
        const result = await fetchYahooMarketQuote(stockCode, {
          currency: "USD",
          timeZone: "America/New_York",
        });
        return result.status === "found" && result.quote
          ? ([stockCode, result.quote] as const)
          : null;
      } catch (error) {
        console.error(`Failed to fetch US market quote for ${stockCode}`, error);
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
