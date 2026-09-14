"use client";

import { useState } from "react";

import { readApiError } from "@/app/components/stock-ui";

type InventoryMarket = "tw" | "us";

type RefreshResponse = {
  requestedCount: number;
  updatedCount: number;
  failedStockCodes: string[];
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
  const updateHint =
    market === "tw"
      ? "建議台股交易日 15:30 後更新"
      : "建議台灣時間於美股交易日隔天 06:00 後更新；週末與休市日不會有新收盤價";

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
        !Array.isArray(body.failedStockCodes)
      ) {
        throw new Error("更新結果格式不正確");
      }

      await onUpdated();

      if (body.failedStockCodes.length > 0) {
        setStatus({
          type: "warning",
          message: `已更新 ${body.updatedCount} 筆；未取得：${body.failedStockCodes.join("、")}`,
        });
      } else {
        setStatus({
          type: "success",
          message:
            body.requestedCount === 0
              ? `目前沒有${marketLabel}庫存可更新`
              : `已將 ${body.updatedCount} 筆最新收盤價寫入資料庫`,
        });
      }
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "更新收盤價失敗",
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
        {isRefreshing ? "更新中…" : `手動更新${marketLabel}收盤價`}
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
