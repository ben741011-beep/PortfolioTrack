import type { Metadata } from "next";

import {
  InventoryTabs,
  type InventoryMarket,
} from "@/app/components/InventoryTabs";

export const metadata: Metadata = {
  title: "庫存管理｜PortfolioTrack",
  description: "集中檢視台股與美股的股數、投資金額與持股損益",
};

export default async function InventoryPage({
  searchParams,
}: PageProps<"/inventory">) {
  const params = await searchParams;
  const market: InventoryMarket = params.market === "us" ? "us" : "tw";

  return <InventoryTabs market={market} />;
}
