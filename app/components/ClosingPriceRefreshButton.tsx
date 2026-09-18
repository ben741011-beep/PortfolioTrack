"use client";

import { useState } from "react";

import { readApiError } from "@/app/components/stock-ui";

type InventoryMarket = "tw" | "us";

type RefreshResponse = {
  requestedCount: number;
  updatedCount: number;
  failedStockCodes: string[];
  items: { stockCode: string; quoteDate: string }[];
};

type RefreshStatus = {
  type: "success" | "warning" | "error";
  message: string;
} | null;

export function ClosingPriceRefreshButton({
  market,
  disabled,
  onUpdated,
}: {
  market: InventoryMarket;
  disabled: boolean;
  onUpdated: () => Promise<void>;
}) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [status, setStatus] = useState<RefreshStatus>(null);
  const marketLabel = market === "tw" ? "台股" : "美股";
  const priceLabel = "最新報價";
  const updateHint = "交易時段可手動更新；收盤後顯示最近一次一般交易時段報價";

  async function handleRefresh() {
    setIsRefreshing(true);
    setStatus(null);

    try {
      const response = await fetch("/api/closing-prices/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ market }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const body = (await response.json()) as RefreshResponse;

      if (
        typeof body.updatedCount !== "number" ||
        typeof body.requestedCount !== "number" ||
        !Array.isArray(body.failedStockCodes) ||
        !Array.isArray(body.items) ||
        body.items.some((item) => typeof item.quoteDate !== "string")
      ) {
        throw new Error("更新結果格式不正確");
      }

      await onUpdated();
      const quoteDates = [...new Set(body.items.map((item) => item.quoteDate))];
      const dateSummary = quoteDates.length
        ? `（交易日期：${quoteDates.join("、")}）`
        : "";

      if (body.failedStockCodes.length > 0) {
        setStatus({
          type: "warning",
          message: `已更新 ${body.updatedCount} 筆${dateSummary}；未取得：${body.failedStockCodes.join("、")}`,
        });
      } else {
        setStatus({
          type: "success",
          message:
            body.requestedCount === 0
              ? `目前沒有${marketLabel}庫存可更新`
              : `已將 ${body.updatedCount} 筆${priceLabel}寫入資料庫${dateSummary}`,
        });
      }
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : `更新${priceLabel}失敗`,
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        onClick={() => void handleRefresh()}
        disabled={disabled || isRefreshing}
        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {isRefreshing ? "更新中…" : `手動更新${marketLabel}${priceLabel}`}
      </button>
      <p className="max-w-sm text-xs leading-5 text-slate-500 sm:text-right">
        {updateHint}
      </p>
      {status ? (
        <p
          role={status.type === "error" ? "alert" : "status"}
          className={`max-w-sm text-xs leading-5 sm:text-right ${
            status.type === "success"
              ? "text-emerald-700"
              : status.type === "warning"
                ? "text-amber-700"
                : "text-rose-700"
          }`}
        >
          {status.message}
        </p>
      ) : null}
    </div>
  );
}
