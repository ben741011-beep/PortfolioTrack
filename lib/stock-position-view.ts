import type { WithId } from "mongodb";

import {
  calculateStockValuation,
  getStoredClosingQuotes,
} from "@/lib/stock-valuation";
import {
  serializeStockPosition,
  type StockPositionDocument,
} from "@/models/StockPosition";

export async function serializeStockPositionsWithValuations(
  documents: WithId<StockPositionDocument>[],
) {
  const quotes = await getStoredClosingQuotes(
    documents.map((document) => document.stockCode),
  );

  return documents.map((document) => {
    const quote = quotes.get(document.stockCode);

    return {
      ...serializeStockPosition(document),
      valuation: quote
        ? calculateStockValuation(
            quote,
            document.assetType,
            document.shares,
            document.principal,
          )
        : null,
    };
  });
}
