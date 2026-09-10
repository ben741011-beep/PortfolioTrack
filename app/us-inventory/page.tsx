import type { Metadata } from "next";

import { UsStockInventory } from "@/app/components/UsStockInventory";

export const metadata: Metadata = {
  title: "美股庫存｜PortfolioTrack",
  description: "以美元記錄美股與 ETF 的持有股數及投入成本",
};

export default function UsInventoryPage() {
  return <UsStockInventory />;
}
