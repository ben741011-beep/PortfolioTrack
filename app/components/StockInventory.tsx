"use client";

import { FormEvent, useEffect, useState } from "react";

type StockPosition = {
  id: string;
  stockCode: string;
  stockName: string;
  assetType: StockAssetType;
  shares: number;
  principal: number;
  valuation: {
    close: number;
    quoteDate: string;
    grossMarketValue: number;
    estimatedSellingFee: number;
    transactionTaxRate: number;
    estimatedTransactionTax: number;
    holdingMarketValue: number;
    unrealizedProfitLoss: number;
    unrealizedProfitLossRate: number;
  } | null;
};

type StockAssetType = "stock" | "stockEtf" | "bondEtf";

const assetTypeLabels: Record<StockAssetType, string> = {
  stock: "股票",
  stockEtf: "股票 ETF",
  bondEtf: "債券 ETF",
};

type ApiError = {
  error?: string;
};

const currencyFormatter = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("zh-TW");
const priceFormatter = new Intl.NumberFormat("zh-TW", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const percentageFormatter = new Intl.NumberFormat("zh-TW", {
  style: "percent",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as ApiError;
  return body.error || `操作失敗（HTTP ${response.status}）`;
}

export function StockInventory() {
  const [items, setItems] = useState<StockPosition[]>([]);
  const [stockCode, setStockCode] = useState("");
  const [stockName, setStockName] = useState("");
  const [stockMarket, setStockMarket] = useState<"TWSE" | "TPEx" | "">("");
  const [stockAssetType, setStockAssetType] = useState<StockAssetType | "">("");
  const [shares, setShares] = useState("");
  const [principal, setPrincipal] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editShares, setEditShares] = useState("");
  const [editPrincipal, setEditPrincipal] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">(
    "success",
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadPositions() {
      try {
        const response = await fetch("/api/stock-positions", {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(await readError(response));
        }

        const body = (await response.json()) as { items: StockPosition[] };
        setItems(body.items);
        setLoadError("");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setLoadError(error instanceof Error ? error.message : "讀取庫存失敗");
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    void loadPositions();
    return () => controller.abort();
  }, []);

  const totalPrincipal = items.reduce((total, item) => total + item.principal, 0);
  const totalHoldingMarketValue = items.reduce(
    (total, item) => total + (item.valuation?.holdingMarketValue ?? 0),
    0,
  );
  const totalUnrealizedProfitLoss = items.reduce(
    (total, item) => total + (item.valuation?.unrealizedProfitLoss ?? 0),
    0,
  );

  async function lookupStockName() {
    const normalizedCode = stockCode.trim().toUpperCase();

    if (!normalizedCode) {
      setMessageType("error");
      setMessage("請先輸入股票代號");
      return;
    }

    setIsLookingUp(true);
    setMessage("");

    try {
      const response = await fetch(
        `/api/stocks/name?code=${encodeURIComponent(normalizedCode)}`,
      );

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const body = (await response.json()) as {
        stockCode: string;
        stockName: string;
        market: "TWSE" | "TPEx";
        assetType: StockAssetType;
      };
      setStockCode(body.stockCode);
      setStockName(body.stockName);
      setStockMarket(body.market);
      setStockAssetType(body.assetType);
      setMessageType("success");
      setMessage(
        `已查到 ${body.stockCode} ${body.stockName}（${
          body.market === "TWSE" ? "上市" : "上櫃"
        }）`,
      );
    } catch (error) {
      setStockName("");
      setStockMarket("");
      setStockAssetType("");
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "查詢股票名稱失敗");
    } finally {
      setIsLookingUp(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    try {
      const response = await fetch("/api/stock-positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockCode, shares, principal }),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const created = (await response.json()) as StockPosition;
      setItems((currentItems) => [created, ...currentItems]);
      setStockCode("");
      setStockName("");
      setStockMarket("");
      setStockAssetType("");
      setShares("");
      setPrincipal("");
      setMessageType("success");
      setMessage(`已新增 ${created.stockCode} ${created.stockName}`);
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "新增股票庫存失敗");
    } finally {
      setIsSubmitting(false);
    }
  }

  function beginEdit(item: StockPosition) {
    setEditingId(item.id);
    setEditShares(String(item.shares));
    setEditPrincipal(String(item.principal));
    setMessage("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditShares("");
    setEditPrincipal("");
  }

  async function saveEdit(item: StockPosition) {
    setBusyId(item.id);
    setMessage("");

    try {
      const response = await fetch(`/api/stock-positions/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shares: editShares, principal: editPrincipal }),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const body = (await response.json()) as { item: StockPosition };
      setItems((currentItems) =>
        currentItems.map((currentItem) =>
          currentItem.id === body.item.id ? body.item : currentItem,
        ),
      );
      cancelEdit();
      setMessageType("success");
      setMessage(`已修改 ${body.item.stockCode} ${body.item.stockName}`);
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "修改股票庫存失敗");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(item: StockPosition) {
    const confirmed = window.confirm(
      `確定要刪除 ${item.stockCode} ${item.stockName}？此操作無法復原。`,
    );

    if (!confirmed) {
      return;
    }

    setBusyId(item.id);
    setMessage("");

    try {
      const response = await fetch(`/api/stock-positions/${item.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      setItems((currentItems) =>
        currentItems.filter((currentItem) => currentItem.id !== item.id),
      );
      if (editingId === item.id) {
        cancelEdit();
      }
      setMessageType("success");
      setMessage(`已刪除 ${item.stockCode} ${item.stockName}`);
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "刪除股票庫存失敗");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main id="top" className="flex-1 bg-slate-100 px-4 py-8 text-slate-950 sm:px-6 sm:py-12 lg:px-8">
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
              查詢上市與上櫃股票名稱，並將持股資料儲存到 MongoDB。
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:max-w-3xl lg:grid-cols-4">
            <div className="min-w-0 rounded-xl border border-slate-300 bg-white px-4 py-4 shadow-sm">
              <p className="text-xs text-slate-500">庫存筆數</p>
              <p className="mt-1 text-lg font-bold tabular-nums">{numberFormatter.format(items.length)}</p>
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
              <p className="text-xs text-slate-500">即時損益</p>
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

        <section id="add-position" className="mb-8 scroll-mt-24 rounded-2xl border border-slate-300 bg-white p-5 shadow-sm sm:p-7">
          <div className="mb-6">
            <h2 className="text-lg font-bold">新增股票</h2>
            <p className="mt-1 text-sm text-slate-500">
              股票名稱會由證交所與櫃買中心 OpenAPI 取得。
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-3">
              <div>
                <label htmlFor="stockCode" className="mb-2 block text-sm font-semibold">
                  股票代號
                </label>
                <div className="flex flex-col gap-2 min-[400px]:flex-row">
                  <input
                    id="stockCode"
                    name="stockCode"
                    value={stockCode}
                    onChange={(event) => {
                      setStockCode(event.target.value.toUpperCase());
                      setStockName("");
                      setStockMarket("");
                      setStockAssetType("");
                    }}
                    placeholder="例如：2330"
                    autoComplete="off"
                    required
                    className="min-w-0 flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                  />
                  <button
                    type="button"
                    onClick={lookupStockName}
                    disabled={isLookingUp}
                    className="w-full shrink-0 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 min-[400px]:w-auto"
                  >
                    {isLookingUp ? "查詢中…" : "查名稱"}
                  </button>
                </div>
                <p className="mt-2 min-h-5 text-sm font-medium text-emerald-700">
                  {stockName
                    ? `${stockName} · ${stockMarket === "TWSE" ? "上市" : "上櫃"} · ${
                        assetTypeLabels[stockAssetType as StockAssetType]
                      }`
                    : "尚未查詢"}
                </p>
              </div>

              <div>
                <label htmlFor="shares" className="mb-2 block text-sm font-semibold">
                  股票股數
                </label>
                <input
                  id="shares"
                  name="shares"
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  value={shares}
                  onChange={(event) => setShares(event.target.value)}
                  placeholder="例如：1000"
                  required
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                />
              </div>

              <div>
                <label htmlFor="principal" className="mb-2 block text-sm font-semibold">
                  投資金額（TWD）
                </label>
                <input
                  id="principal"
                  name="principal"
                  type="number"
                  min="1"
                  step="any"
                  inputMode="decimal"
                  value={principal}
                  onChange={(event) => setPrincipal(event.target.value)}
                  placeholder="例如：850000"
                  required
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                />
              </div>
            </div>

            <div className="flex flex-col gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p
                aria-live="polite"
                className={`min-h-5 text-sm ${
                  messageType === "error" ? "text-rose-700" : "text-emerald-700"
                }`}
              >
                {message}
              </p>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-xl bg-slate-950 px-6 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isSubmitting ? "儲存中…" : "儲存股票庫存"}
              </button>
            </div>
          </form>
        </section>

        <section id="inventory" className="scroll-mt-24 overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-5 sm:px-7">
            <h2 className="text-lg font-bold">目前庫存</h2>
            <div className="mt-3 space-y-1 text-xs leading-5 text-slate-500">
              <p>
                持股市值 ＝ 股數 × 最近收盤價 − 估算賣出手續費 − 交易稅
              </p>
              <p>即時損益 ＝ 持股市值 − 投資金額</p>
              <p>損益率 ＝ 即時損益 ÷ 投資金額</p>
              <p>
                手續費以 0.1425% 估算；交易稅：股票 0.3%、股票 ETF
                0.1%、債券 ETF 0%。
              </p>
            </div>
          </div>

          {loadError ? (
            <div
              role="alert"
              className="border-l-4 border-rose-500 bg-rose-50 px-7 py-6 text-sm font-medium text-rose-700"
            >
              {loadError}
            </div>
          ) : isLoading ? (
            <p className="px-7 py-12 text-center text-sm text-slate-500">讀取中…</p>
          ) : items.length === 0 ? (
            <div className="px-7 py-14 text-center">
              <p className="text-base font-semibold text-slate-700">目前還沒有股票庫存</p>
              <p className="mt-2 text-sm text-slate-500">可使用上方表單新增第一筆資料。</p>
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
                          {editingId === item.id ? (
                            <label className="block">
                              <span className="sr-only">股票股數</span>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                inputMode="numeric"
                                value={editShares}
                                onChange={(event) => setEditShares(event.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100"
                              />
                            </label>
                          ) : (
                            numberFormatter.format(item.shares)
                          )}
                        </dd>
                      </div>

                      <div className="text-right">
                        <dt className="text-xs font-medium text-slate-500">投資金額</dt>
                        <dd className="mt-1 break-words font-semibold tabular-nums text-slate-900">
                          {editingId === item.id ? (
                            <label className="block">
                              <span className="sr-only">投資金額</span>
                              <input
                                type="number"
                                min="1"
                                step="any"
                                inputMode="decimal"
                                value={editPrincipal}
                                onChange={(event) => setEditPrincipal(event.target.value)}
                                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-right outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100"
                              />
                            </label>
                          ) : (
                            currencyFormatter.format(item.principal)
                          )}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-xs font-medium text-slate-500">最近收盤價</dt>
                        <dd className="mt-1 font-semibold tabular-nums text-slate-900">
                          {item.valuation ? (
                            <>
                              <span>${priceFormatter.format(item.valuation.close)}</span>
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
                        <dt className="text-xs font-medium text-slate-500">持股市值</dt>
                        <dd className="mt-1 break-words font-bold tabular-nums text-slate-950">
                          {item.valuation
                            ? currencyFormatter.format(item.valuation.holdingMarketValue)
                            : "—"}
                        </dd>
                      </div>

                      <div>
                        <dt className="text-xs font-medium text-slate-500">即時損益</dt>
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
                            ? currencyFormatter.format(item.valuation.unrealizedProfitLoss)
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

                    <div className="mt-4 flex gap-3">
                      {editingId === item.id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void saveEdit(item)}
                            disabled={busyId === item.id}
                            className="flex-1 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-emerald-900 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {busyId === item.id ? "儲存中…" : "儲存"}
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            disabled={busyId === item.id}
                            className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => beginEdit(item)}
                            disabled={busyId !== null || editingId !== null}
                            className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            修改
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(item)}
                            disabled={busyId !== null || editingId !== null}
                            className="flex-1 rounded-lg border border-rose-200 px-4 py-2.5 text-sm font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {busyId === item.id ? "刪除中…" : "刪除"}
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1260px] text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-7 py-4 font-semibold">股票</th>
                    <th className="px-5 py-4 font-semibold">種類</th>
                    <th className="px-5 py-4 text-right font-semibold">股數</th>
                    <th className="px-5 py-4 text-right font-semibold">投資金額</th>
                    <th className="px-4 py-4 text-right font-semibold">最近收盤價</th>
                    <th className="px-4 py-4 text-right font-semibold">持股市值</th>
                    <th className="px-4 py-4 text-right font-semibold">即時損益</th>
                    <th className="w-28 px-3 py-4 text-right font-semibold">損益率</th>
                    <th className="w-32 px-4 py-4 text-right font-semibold">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50/70">
                      <td className="px-7 py-5">
                        <p className="font-bold text-slate-950">{item.stockName}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.stockCode}</p>
                      </td>
                      <td className="px-5 py-5 font-medium text-slate-700">
                        {assetTypeLabels[item.assetType]}
                      </td>
                      <td className="px-5 py-5 text-right font-medium">
                        {editingId === item.id ? (
                          <label className="block">
                            <span className="sr-only">股票股數</span>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              inputMode="numeric"
                              value={editShares}
                              onChange={(event) => setEditShares(event.target.value)}
                              className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-right outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                            />
                          </label>
                        ) : (
                          numberFormatter.format(item.shares)
                        )}
                      </td>
                      <td className="px-5 py-5 text-right font-medium">
                        {editingId === item.id ? (
                          <label className="block">
                            <span className="sr-only">投資金額</span>
                            <input
                              type="number"
                              min="1"
                              step="any"
                              inputMode="decimal"
                              value={editPrincipal}
                              onChange={(event) => setEditPrincipal(event.target.value)}
                              className="w-32 rounded-lg border border-slate-300 px-3 py-2 text-right outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
                            />
                          </label>
                        ) : (
                          currencyFormatter.format(item.principal)
                        )}
                      </td>
                      <td className="px-4 py-5 text-right font-medium">
                        {item.valuation ? (
                          <div>
                            <p>${priceFormatter.format(item.valuation.close)}</p>
                            <p className="mt-1 text-[11px] font-normal text-slate-500">
                              {item.valuation.quoteDate}
                            </p>
                          </div>
                        ) : (
                          <span className="text-slate-400">暫無行情</span>
                        )}
                      </td>
                      <td className="px-4 py-5 text-right font-bold">
                        {item.valuation
                          ? currencyFormatter.format(
                              item.valuation.holdingMarketValue,
                            )
                          : "—"}
                      </td>
                      <td
                        className={`px-4 py-5 text-right font-bold ${
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
                        className={`w-28 whitespace-nowrap px-3 py-5 text-right font-bold ${
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
                      <td className="w-32 px-4 py-5">
                        <div className="flex justify-end gap-2">
                          {editingId === item.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void saveEdit(item)}
                                disabled={busyId === item.id}
                                className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {busyId === item.id ? "儲存中…" : "儲存"}
                              </button>
                              <button
                                type="button"
                                onClick={cancelEdit}
                                disabled={busyId === item.id}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                取消
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => beginEdit(item)}
                                disabled={busyId !== null || editingId !== null}
                                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                修改
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDelete(item)}
                                disabled={busyId !== null || editingId !== null}
                                className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {busyId === item.id ? "刪除中…" : "刪除"}
                              </button>
                            </>
                          )}
                        </div>
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
