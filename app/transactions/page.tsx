import type { Metadata } from "next";

import { StockOperations } from "@/app/components/StockOperations";

export const metadata: Metadata = {
  title: "交易管理｜家庭資產簿",
  description: "建立初始股票庫存、記錄買賣並查詢交易紀錄",
};

export default function TransactionsPage() {
  return <StockOperations />;
}
