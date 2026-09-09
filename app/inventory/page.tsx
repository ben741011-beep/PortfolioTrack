import type { Metadata } from "next";

import { StockInventory } from "@/app/components/StockInventory";

export const metadata: Metadata = {
  title: "庫存管理｜PortfolioTrack",
  description: "檢視股票股數、投資金額與持股損益",
};

export default function InventoryPage() {
  return <StockInventory />;
}
