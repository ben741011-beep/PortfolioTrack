"use client";

import { useCallback, useEffect, useState } from "react";

import { ClosingPriceRefreshButton } from "@/app/components/ClosingPriceRefreshButton";
import {
  assetTypeLabels,
  currencyFormatter,
  numberFormatter,
  percentageFormatter,
  priceFormatter,
  readApiError,
  type StockPosition,
} from "@/app/components/stock-ui";

export function StockInventory({
  onClosingPricesUpdated,
}: {
  onClosingPricesUpdated?: () => void;
}) {
  const [items, setItems] = useState<StockPosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadPositions = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/stock-positions", {
      cache: "no-store",
      signal,
    });

    if (!response.ok) {
      throw new Error(await readApiError(response));
    }

    const body = (await response.json()) as { items: StockPosition[] };

    if (!Array.isArray(body.items)) {
      throw new Error("台股庫存資料格式不正確");
    }

    setItems(body.items);
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
            error instanceof Error ? error.message : "讀取庫存失敗",
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

  const totalPrincipal = items.reduce((total, item) => total + item.principal, 0);
  const totalHoldingMarketValue = items.reduce(
    (total, item) => total + (item.valuation?.holdingMarketValue ?? 0),
    0,
  );
  const totalUnrealizedProfitLoss = items.reduce(
    (total, item) => total + (item.valuation?.unrealizedProfitLoss ?? 0),
    0,
  );

  return (
    <main
      id="top"
      className="flex-1 bg-slate-100 px-4 py-8 text-slate-950 sm:px-6 sm:py-12 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col gap-6 border-b border-slate-300 pb-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="mb-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold tracking-[0.16em] text-emerald-800">
              投資組合總覽
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              股票庫存管理
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              檢視目前股數、投入成本、上次手動更新的報價與未實現損益。
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:max-w-3xl lg:grid-cols-4">
            <div className="min-w-0 rounded-xl border border-slate-300 bg-white px-4 py-4 shadow-sm">
              <p className="text-xs text-slate-500">庫存筆數</p>
              <p className="mt-1 text-lg font-bold tabular-nums">
                {numberFormatter.format(items.length)}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-slate-300 bg-white px-4 py-4 shadow-sm">
              <p className="text-xs text-slate-500">總投資金額</p>
              <p className="mt-1 break-words text-lg font-bold tracking-tight tabular-nums">
                {currencyFormatter.format(totalPrincipal)}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-slate-300 bg-white px-4 py-4 shadow-sm">
              <p className="text-xs text-slate-500">持股市值</p>
              <p className="mt-1 break-words text-lg font-bold tracking-tight tabular-nums">
                {currencyFormatter.format(totalHoldingMarketValue)}
              </p>
            </div>
            <div className="min-w-0 rounded-xl border border-slate-300 bg-white px-4 py-4 shadow-sm">
              <p className="text-xs text-slate-500">未實現損益</p>
              <p
                className={`mt-1 break-words text-lg font-bold tracking-tight tabular-nums ${
                  totalUnrealizedProfitLoss >= 0
                    ? "text-emerald-700"
                    : "text-rose-700"
                }`}
              >
                {currencyFormatter.format(totalUnrealizedProfitLoss)}
              </p>
            </div>
          </div>
        </header>

        <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
          <div className="flex flex-col gap-5 border-b border-slate-200 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-7">
            <div>
              <h2 className="text-lg font-bold">目前庫存</h2>
              <div className="mt-3 space-y-1 text-xs leading-5 text-slate-500">
                <p>頁面載入只讀取資料庫；按下更新按鈕才會抓取並寫入最新報價。</p>
                <p>持股市值 ＝ 股數 × 最新報價 − 估算賣出手續費 − 交易稅</p>
                <p>未實現損益 ＝ 持股市值 − 投資金額</p>
                <p>損益率 ＝ 未實現損益 ÷ 投資金額</p>
                <p>
                  手續費以 0.1425% 估算；交易稅：股票 0.3%、股票 ETF
                  0.1%、債券 ETF 0%。
                </p>
              </div>
            </div>
            <ClosingPriceRefreshButton
              market="tw"
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
                目前還沒有股票庫存
              </p>
              <p className="mt-2 text-sm text-slate-500">
                請前往「新增與買賣」分頁建立第一筆庫存。
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
                        {assetTypeLabels[item.assetType]}
                      </span>
                    </div>

                    <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 border-y border-slate-200 py-5">
                      <div>
                        <dt className="text-xs font-medium text-slate-500">股數</dt>
                        <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                          {numberFormatter.format(item.shares)}
                        </dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-xs font-medium text-slate-500">
                          投資金額
                        </dt>
                        <dd className="mt-1 break-words font-semibold tabular-nums text-slate-900">
                          {currencyFormatter.format(item.principal)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-slate-500">
                          最新報價
                        </dt>
                        <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                          {item.valuation ? (
                            <>
                              <span>${priceFormatter.format(item.valuation.price)}</span>
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
                          持股市值
                        </dt>
                        <dd className="mt-1 break-words font-bold tabular-nums text-slate-950">
                          {item.valuation
                            ? currencyFormatter.format(
                                item.valuation.holdingMarketValue,
                              )
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs font-medium text-slate-500">
                          未實現損益
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
                            ? currencyFormatter.format(
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
                      <th className="px-5 py-4 text-right font-semibold">投資金額</th>
                      <th className="px-4 py-4 text-right font-semibold">
                        最新報價
                      </th>
                      <th className="px-4 py-4 text-right font-semibold">持股市值</th>
                      <th className="px-4 py-4 text-right font-semibold">未實現損益</th>
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
                          {assetTypeLabels[item.assetType]}
                        </td>
                        <td className="px-5 py-5 text-right font-medium tabular-nums">
                          {numberFormatter.format(item.shares)}
                        </td>
                        <td className="px-5 py-5 text-right font-medium tabular-nums">
                          {currencyFormatter.format(item.principal)}
                        </td>
                        <td className="px-4 py-5 text-right font-medium tabular-nums">
                          {item.valuation ? (
                            <div>
                              <p>${priceFormatter.format(item.valuation.price)}</p>
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
                            ? currencyFormatter.format(
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
                            ? currencyFormatter.format(
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
    </main>
  );
}
