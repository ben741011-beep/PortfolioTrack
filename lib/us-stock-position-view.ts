import {
  calculateUsStockValuation,
  getStoredUsMarketQuotes,
} from "@/lib/us-stock-valuation";
import {
  serializeUsStockPosition,
  type UsStockPositionDocument,
} from "@/models/UsStockPosition";
import type { WithId } from "mongodb";

export async function serializeUsStockPositionsWithValuations(
  documents: WithId<UsStockPositionDocument>[],
) {
  const quotes = await getStoredUsMarketQuotes(
    documents.map((document) => document.stockCode),
  );
  const items = documents.map((document) => {
    const quote = quotes.get(document.stockCode);

    return {
      ...serializeUsStockPosition(document),
      valuation: quote
        ? calculateUsStockValuation(
            quote,
            document.shares,
            document.principal,
          )
        : null,
    };
  });

  return {
    items,
    summary: {
      count: documents.length,
      totalPrincipal: documents.reduce(
        (total, document) => total + document.principal,
        0,
      ),
      totalHoldingMarketValue: items.reduce(
        (total, item) => total + (item.valuation?.holdingMarketValue ?? 0),
        0,
      ),
      totalUnrealizedProfitLoss: items.reduce(
        (total, item) => total + (item.valuation?.unrealizedProfitLoss ?? 0),
        0,
      ),
      stockCount: documents.filter(
        (document) => document.assetType === "stock",
      ).length,
      etfCount: documents.filter(
        (document) => document.assetType !== "stock",
      ).length,
    },
  };
}
