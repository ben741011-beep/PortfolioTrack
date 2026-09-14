import type { Metadata } from "next";

import { StockOperations } from "@/app/components/StockOperations";

export const metadata: Metadata = {
  title: "新增與買賣｜家庭資產簿",
  description: "建立初始股票庫存並記錄買入與賣出交易",
};

export default function TransactionsPage() {
  return <StockOperations />;
}
