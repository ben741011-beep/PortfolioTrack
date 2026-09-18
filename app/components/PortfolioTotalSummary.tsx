"use client";

import { useCallback, useEffect, useState } from "react";

import {
  currencyFormatter,
  numberFormatter,
  readApiError,
} from "@/app/components/stock-ui";

export type DisplayExchangeRate = {
  rate: number;
  quoteDate: string;
  source: string;
};

type PortfolioSummaryResponse = {
  summary: {
    count: number;
    totalPrincipal: number;
    totalHoldingMarketValue: number;
    totalUnrealizedProfitLoss: number;
  };
  exchangeRate: DisplayExchangeRate;
};

export function PortfolioTotalSummary({
  onExchangeRateChange,
  refreshToken = 0,
}: {
  onExchangeRateChange?: (exchangeRate: DisplayExchangeRate) => void;
  refreshToken?: number;
}) {
  const [data, setData] = useState<PortfolioSummaryResponse | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  const loadSummary = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setError("");

    try {
      const response = await fetch("/api/portfolio-summary", {
        cache: "no-store",
        signal,
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const body = (await response.json()) as PortfolioSummaryResponse;

      if (signal?.aborted) {
        return;
      }

      setData(body);
      onExchangeRateChange?.(body.exchangeRate);
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") {
        return;
      }

      setError(
        loadError instanceof Error
          ? loadError.message
          : "讀取投資組合總覽失敗",
      );
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, [onExchangeRateChange]);

  useEffect(() => {
    const controller = new AbortController();

    queueMicrotask(() => void loadSummary(controller.signal));

    return () => controller.abort();
  }, [loadSummary, refreshToken]);

  const summaryCards = data
    ? [
        { label: "庫存筆數", value: numberFormatter.format(data.summary.count) },
        {
          label: "總投資金額",
          value: currencyFormatter.format(data.summary.totalPrincipal),
        },
        {
          label: "持股市值",
          value: currencyFormatter.format(data.summary.totalHoldingMarketValue),
        },
        {
          label: "未實現損益",
          value: currencyFormatter.format(data.summary.totalUnrealizedProfitLoss),
          valueClassName:
            data.summary.totalUnrealizedProfitLoss >= 0
              ? "text-emerald-700"
              : "text-rose-700",
        },
      ]
    : [];

  return (
    <section className="bg-slate-950 px-4 py-7 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold tracking-[0.16em] text-emerald-300">
              台股＋美股
            </p>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
              投資組合總計
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              美股換算為新台幣後，與台股合併計算。
            </p>
          </div>

          {isLoading ? (
            <div className="grid w-full grid-cols-2 gap-3 lg:max-w-3xl lg:grid-cols-4">
              {["count", "principal", "market-value", "profit-loss"].map(
                (key) => (
                  <div
                    key={key}
                    className="h-[74px] animate-pulse rounded-xl bg-white/10"
                  />
                ),
              )}
            </div>
          ) : error ? (
            <div className="w-full rounded-xl border border-rose-400/40 bg-rose-400/10 p-4 text-sm text-rose-100 lg:max-w-3xl">
              <p>{error}</p>
              <button
                type="button"
                onClick={() => void loadSummary()}
                className="mt-3 rounded-lg border border-rose-200/50 px-3 py-2 font-bold transition hover:bg-white/10"
              >
                重新讀取
              </button>
            </div>
          ) : data ? (
            <div className="grid w-full grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:max-w-3xl lg:grid-cols-4">
              {summaryCards.map((card) => (
                <div
                  key={card.label}
                  className="min-w-0 rounded-xl border border-white/15 bg-white px-4 py-4 text-slate-950 shadow-sm"
                >
                  <p className="text-xs text-slate-500">{card.label}</p>
                  <p
                    className={`mt-1 break-words text-lg font-bold tracking-tight tabular-nums ${card.valueClassName ?? ""}`}
                  >
                    {card.value}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {data ? (
          <p className="mt-4 text-xs text-slate-400">
            美股依 {data.exchangeRate.quoteDate} {data.exchangeRate.source}
            收盤匯率 1 USD ＝ {data.exchangeRate.rate} TWD 換算；合計金額皆為新台幣。
          </p>
        ) : null}
      </div>
    </section>
  );
}
