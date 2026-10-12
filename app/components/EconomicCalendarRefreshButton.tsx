"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { readApiError } from "@/app/components/stock-ui";
import { authClient } from "@/lib/auth-client";

type RefreshResponse = {
  requestedCount: number;
  insertedCount: number;
  modifiedCount: number;
  skippedCount: number;
  verifiedCount: number;
  afterCount: number;
};

export function EconomicCalendarRefreshButton() {
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [status, setStatus] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);

  async function handleRefresh() {
    setIsRefreshing(true);
    setStatus(null);

    try {
      const response = await fetch("/api/us-economic-events/refresh", {
        method: "POST",
      });
      if (!response.ok) throw new Error(await readApiError(response));

      const body = (await response.json()) as RefreshResponse;
      const counts = [
        body.requestedCount,
        body.insertedCount,
        body.modifiedCount,
        body.skippedCount,
        body.verifiedCount,
        body.afterCount,
      ];
      if (counts.some((value) => !Number.isInteger(value) || value < 0)) {
        throw new Error("更新結果格式不正確");
      }

      router.refresh();
      setStatus({
        type: "success",
        message: `官方時程檢查完成：新增 ${body.insertedCount}、更新 ${body.modifiedCount}、無變更 ${body.skippedCount}；MongoDB 共 ${body.afterCount} 筆。`,
      });
    } catch (error) {
      setStatus({
        type: "error",
        message: error instanceof Error ? error.message : "手動更新失敗",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  if (isPending) {
    return <div className="h-10 w-32 animate-pulse rounded-xl bg-white/[0.06]" />;
  }

  if (!session) {
    return (
      <p className="text-xs leading-5 text-neutral-500">
        登入後可手動同步 Fed、BLS 與 BEA 官方時程。
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-2 lg:items-end">
      <button
        type="button"
        onClick={() => void handleRefresh()}
        disabled={isRefreshing}
        className="inline-flex min-h-10 items-center justify-center rounded-xl bg-emerald-400 px-4 py-2 text-sm font-black text-emerald-950 transition hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-wait disabled:bg-emerald-400/50"
      >
        {isRefreshing ? "同步官方時程中…" : "手動更新官方時程"}
      </button>
      {status ? (
        <p
          role={status.type === "error" ? "alert" : "status"}
          className={`max-w-md text-xs leading-5 lg:text-right ${
            status.type === "success" ? "text-emerald-300" : "text-rose-300"
          }`}
        >
          {status.message}
        </p>
      ) : (
        <p className="text-xs text-neutral-500">只有按下按鈕才會連線官方來源並寫入 MongoDB</p>
      )}
    </div>
  );
}
