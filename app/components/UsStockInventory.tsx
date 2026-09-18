"use client";

import { useCallback, useEffect, useState } from "react";

import { ClosingPriceRefreshButton } from "@/app/components/ClosingPriceRefreshButton";
import {
  currencyFormatter,
  numberFormatter,
  percentageFormatter,
  readApiError,
} from "@/app/components/stock-ui";
import type { DisplayExchangeRate } from "@/app/components/PortfolioTotalSummary";

type UsStockAssetType = "stock" | "stockEtf" | "bondEtf";

type UsStockPosition = {
  id: string;
  stockCode: string;
  stockName: string;
  assetType: UsStockAssetType;
  shares: number;
  principal: number;
  valuation: {
    price: number;
    quoteDate: string;
    holdingMarketValue: number;
    unrealizedProfitLoss: number;
    unrealizedProfitLossRate: number;
  } | null;
  createdAt: string;
  updatedAt: string;
};

type UsStockSummary = {
  count: number;
  totalPrincipal: number;
  totalHoldingMarketValue: number;
  totalUnrealizedProfitLoss: number;
  stockCount: number;
  etfCount: number;
};

type ListResponse = {
  items: UsStockPosition[];
  summary: UsStockSummary;
};

const EMPTY_SUMMARY: UsStockSummary = {
  count: 0,
  totalPrincipal: 0,
  totalHoldingMarketValue: 0,
  totalUnrealizedProfitLoss: 0,
  stockCount: 0,
  etfCount: 0,
};

const shareFormatter = new Intl.NumberFormat("zh-TW", {
  maximumFractionDigits: 6,
});

const usdPriceFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const usStockAssetTypeLabels: Record<UsStockAssetType, string> = {
  stock: "股票",
  stockEtf: "股票 ETF",
  bondEtf: "債券 ETF",
};

export function UsStockInventory({
  exchangeRate,
  onClosingPricesUpdated,
}: {
  exchangeRate: DisplayExchangeRate | null;
  onClosingPricesUpdated?: () => void;
}) {
  const [items, setItems] = useState<UsStockPosition[]>([]);
  const [summary, setSummary] = useState<UsStockSummary>(EMPTY_SUMMARY);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadPositions = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/us-stock-positions", {
      cache: "no-store",
      signal,
    });

    if (!response.ok) {
      throw new Error(await readApiError(response));
    }

    const body = (await response.json()) as ListResponse;

    if (
      !Array.isArray(body.items) ||
      !body.summary
    ) {
      throw new Error("美股庫存資料格式不正確");
    }

    setItems(body.items);
    setSummary(body.summary);
    setLoadError("");
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    queueMicrotask(() => {
      if (controller.signal.aborted) {
        return;
      }

      void loadPositions(controller.signal)
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }

          setLoadError(
            error instanceof Error ? error.message : "讀取美股庫存失敗",
          );
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsLoading(false);
          }
        });
    });

    return () => controller.abort();
  }, [loadPositions]);

  const formatTwd = (value: number) =>
    exchangeRate ? currencyFormatter.format(value * exchangeRate.rate) : "—";

  return (
    <main
      id="top"
      className="flex-1 bg-slate-100 px-4 py-8 text-slate-950 sm:px-6 sm:py-12 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-6 border-b border-slate-300 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-3 inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-bold tracking-[0.16em] text-sky-800">
              US PORTFOLIO
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              美股庫存管理
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              每檔美股與 ETF 的投入成本、市值及損益以美元顯示；頂部合計金額換算為新台幣。
            </p>
            {exchangeRate ? (
              <p className="mt-2 text-xs text-slate-500">
                {exchangeRate.quoteDate} {exchangeRate.source}收盤匯率：1 USD ＝ {exchangeRate.rate} TWD
              </p>
            ) : null}
          </div>

          <div className="grid w-full grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:max-w-3xl lg:grid-cols-4">
            <SummaryCard label="庫存筆數" value={numberFormatter.format(summary.count)} />
            <SummaryCard label="總投資金額（TWD）" value={formatTwd(summary.totalPrincipal)} />
            <SummaryCard
              label="持股市值（TWD）"
              value={formatTwd(summary.totalHoldingMarketValue)}
            />
            <SummaryCard
              label="未實現損益（TWD）"
              value={formatTwd(summary.totalUnrealizedProfitLoss)}
              valueClassName={
                summary.totalUnrealizedProfitLoss >= 0
                  ? "text-emerald-700"
                  : "text-rose-700"
              }
            />
          </div>
        </header>

        <div>
          <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
            <div className="flex flex-col gap-5 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-7">
              <div>
                <h2 className="text-lg font-bold">目前庫存</h2>
                <div className="mt-2 space-y-1 text-xs leading-5 text-slate-500">
                  <p>頁面載入只讀取資料庫；按下更新按鈕才會抓取並寫入最新報價。</p>
                  <p>每檔持股市值（USD）＝ 股數 × 最新報價（USD）</p>
                  <p>每檔未實現損益（USD）＝ 持股市值 − 投資金額</p>
                  <p>損益率 ＝ 未實現損益 ÷ 投資金額</p>
                  <p>頂部合計金額依顯示的美元匯率換算為台幣。</p>
                </div>
              </div>
              <ClosingPriceRefreshButton
                market="us"
                disabled={isLoading || items.length === 0}
                onUpdated={async () => {
                  await loadPositions();
                  onClosingPricesUpdated?.();
                }}
              />
            </div>

            {loadError ? (
              <div
                role="alert"
                className="border-l-4 border-rose-500 bg-rose-50 px-7 py-6 text-sm font-medium text-rose-700"
              >
                {loadError}
              </div>
            ) : isLoading ? (
              <p className="px-7 py-12 text-center text-sm text-slate-500">
                讀取中…
              </p>
            ) : items.length === 0 ? (
              <div className="px-7 py-14 text-center">
                <p className="text-base font-semibold text-slate-700">
                  目前還沒有美股庫存
                </p>
                <p className="mt-2 text-sm text-slate-500">
                  請前往「新增與買賣」的新增庫存建立第一筆美股或 ETF。
                </p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-200 lg:hidden">
                  {items.map((item) => (
                    <article key={item.id} className="p-5 sm:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="break-words text-lg font-bold text-slate-950">
                            {item.stockName}
                          </h3>
                          <p className="mt-1 text-sm font-medium tracking-wide text-slate-500">
                            {item.stockCode}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">
                          {usStockAssetTypeLabels[item.assetType]}
                        </span>
                      </div>
                      <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 border-y border-slate-200 py-5">
                        <div>
                          <dt className="text-xs font-medium text-slate-500">股數</dt>
                          <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                            {shareFormatter.format(item.shares)}
                          </dd>
                        </div>
                        <div className="text-right">
                          <dt className="text-xs font-medium text-slate-500">
                            投資金額（USD）
                          </dt>
                          <dd className="mt-1 break-words font-semibold tabular-nums text-slate-900">
                            {usdPriceFormatter.format(item.principal)}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">
                            最新報價（USD）
                          </dt>
                          <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                            {item.valuation ? (
                              <>
                                <span>
                                  {usdPriceFormatter.format(
                                    item.valuation.price,
                                  )}
                                </span>
                                <span className="mt-0.5 block text-[11px] font-normal text-slate-500">
                                  {item.valuation.quoteDate}
                                </span>
                              </>
                            ) : (
                              <span className="text-slate-400">暫無行情</span>
                            )}
                          </dd>
                        </div>
                        <div className="text-right">
                          <dt className="text-xs font-medium text-slate-500">
                            持股市值（USD）
                          </dt>
                          <dd className="mt-1 break-words font-bold tabular-nums text-slate-950">
                            {item.valuation
                              ? usdPriceFormatter.format(
                                  item.valuation.holdingMarketValue,
                                )
                              : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium text-slate-500">
                            未實現損益（USD）
                          </dt>
                          <dd
                            className={`mt-1 break-words font-bold tabular-nums ${
                              !item.valuation
                                ? "text-slate-400"
                                : item.valuation.unrealizedProfitLoss >= 0
                                  ? "text-emerald-700"
                                  : "text-rose-700"
                            }`}
                          >
                            {item.valuation
                              ? usdPriceFormatter.format(
                                  item.valuation.unrealizedProfitLoss,
                                )
                              : "—"}
                          </dd>
                        </div>
                        <div className="text-right">
                          <dt className="text-xs font-medium text-slate-500">損益率</dt>
                          <dd
                            className={`mt-1 font-bold tabular-nums ${
                              !item.valuation
                                ? "text-slate-400"
                                : item.valuation.unrealizedProfitLossRate >= 0
                                  ? "text-emerald-700"
                                  : "text-rose-700"
                            }`}
                          >
                            {item.valuation
                              ? percentageFormatter.format(
                                  item.valuation.unrealizedProfitLossRate,
                                )
                              : "—"}
                          </dd>
                        </div>
                      </dl>
                    </article>
                  ))}
                </div>

                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[1020px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-7 py-4 font-semibold">股票</th>
                        <th className="px-5 py-4 font-semibold">種類</th>
                        <th className="px-5 py-4 text-right font-semibold">股數</th>
                        <th className="px-5 py-4 text-right font-semibold">投資金額（USD）</th>
                        <th className="px-4 py-4 text-right font-semibold">
                          最新報價（USD）
                        </th>
                        <th className="px-4 py-4 text-right font-semibold">持股市值（USD）</th>
                        <th className="px-4 py-4 text-right font-semibold">未實現損益（USD）</th>
                        <th className="w-28 px-4 py-4 text-right font-semibold">損益率</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/70">
                          <td className="px-7 py-5">
                            <p className="font-bold text-slate-950">{item.stockName}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {item.stockCode}
                            </p>
                          </td>
                          <td className="px-5 py-5 font-medium text-slate-700">
                            {usStockAssetTypeLabels[item.assetType]}
                          </td>
                          <td className="px-5 py-5 text-right font-medium tabular-nums">
                            {shareFormatter.format(item.shares)}
                          </td>
                          <td className="px-5 py-5 text-right font-medium tabular-nums">
                            {usdPriceFormatter.format(item.principal)}
                          </td>
                          <td className="px-4 py-5 text-right font-medium tabular-nums">
                            {item.valuation ? (
                              <div>
                                <p>
                                  {usdPriceFormatter.format(
                                    item.valuation.price,
                                  )}
                                </p>
                                <p className="mt-1 text-[11px] font-normal text-slate-500">
                                  {item.valuation.quoteDate}
                                </p>
                              </div>
                            ) : (
                              <span className="text-slate-400">暫無行情</span>
                            )}
                          </td>
                          <td className="px-4 py-5 text-right font-bold tabular-nums">
                            {item.valuation
                              ? usdPriceFormatter.format(
                                  item.valuation.holdingMarketValue,
                                )
                              : "—"}
                          </td>
                          <td
                            className={`px-4 py-5 text-right font-bold tabular-nums ${
                              !item.valuation
                                ? "text-slate-400"
                                : item.valuation.unrealizedProfitLoss >= 0
                                  ? "text-emerald-700"
                                  : "text-rose-700"
                            }`}
                          >
                            {item.valuation
                              ? usdPriceFormatter.format(
                                  item.valuation.unrealizedProfitLoss,
                                )
                              : "—"}
                          </td>
                          <td
                            className={`w-28 whitespace-nowrap px-4 py-5 text-right font-bold tabular-nums ${
                              !item.valuation
                                ? "text-slate-400"
                                : item.valuation.unrealizedProfitLossRate >= 0
                                  ? "text-emerald-700"
                                  : "text-rose-700"
                            }`}
                          >
                            {item.valuation
                              ? percentageFormatter.format(
                                  item.valuation.unrealizedProfitLossRate,
                                )
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

function SummaryCard({
  label,
  value,
  valueClassName = "",
}: {
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-300 bg-white px-4 py-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`mt-1 break-words text-lg font-bold tracking-tight tabular-nums ${valueClassName}`}
      >
        {value}
      </p>
    </div>
  );
}
