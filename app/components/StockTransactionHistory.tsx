"use client";

import { useCallback, useEffect, useState } from "react";

import { readApiError } from "@/app/components/stock-ui";

type Market = "taiwan" | "us";
type Transaction = {
  id: string;
  stockCode: string;
  stockName: string;
  side: "buy" | "sell";
  shares: number;
  price: number;
  grossAmount: number;
  transactionFee: number;
  transactionTax?: number;
  secFee?: number;
  tafFee?: number;
  cashAmount: number;
  realizedProfitLoss: number;
  occurredAt: string;
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const dateKeyFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const shareFormatter = new Intl.NumberFormat("zh-TW", {
  maximumFractionDigits: 6,
});
const priceFormatters = {
  taiwan: new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 4,
  }),
  us: new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }),
};

function taipeiDateKey(value: string) {
  const parts = dateKeyFormatter.formatToParts(new Date(value));
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function StockTransactionHistory() {
  const [market, setMarket] = useState<Market>("taiwan");

  return (
    <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm sm:p-7">
      <div className="mb-6">
        <p className="text-xs font-bold tracking-[0.14em] text-emerald-700">TRADE HISTORY</p>
        <h2 className="mt-2 text-xl font-bold">交易紀錄</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          查看目前家庭成員的交易記錄時間、每股成交價與買賣明細。初始庫存沒有逐筆成交資料，因此不列在這裡。
        </p>
      </div>
      <fieldset className="mb-6">
        <legend className="mb-2 text-sm font-semibold">交易市場</legend>
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1.5">
          {(["taiwan", "us"] as const).map((value) => (
            <label key={value} className="cursor-pointer">
              <input
                type="radio"
                name="historyMarket"
                value={value}
                checked={market === value}
                onChange={() => setMarket(value)}
                className="peer sr-only"
              />
              <span className="block rounded-lg px-4 py-2.5 text-center text-sm font-bold text-slate-600 transition peer-checked:bg-white peer-checked:text-slate-950 peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-600">
                {value === "taiwan" ? "台股 · TWD" : "美股 · USD"}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <HistoryMarketRecords key={market} market={market} />
    </section>
  );
}

function HistoryMarketRecords({ market }: { market: Market }) {
  const [items, setItems] = useState<Transaction[] | null>(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [stockCode, setStockCode] = useState("");
  const [side, setSide] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(
      market === "taiwan" ? "/api/stock-transactions" : "/api/us-stock-transactions",
      { cache: "no-store", signal },
    );
    if (!response.ok) throw new Error(await readApiError(response));
    const body = (await response.json()) as { items?: Transaction[] };
    if (!Array.isArray(body.items)) throw new Error("交易紀錄資料格式不正確");
    setItems(body.items);
    setError("");
  }, [market]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      if (controller.signal.aborted) return;
      void load(controller.signal)
        .catch((reason: unknown) => {
          if (controller.signal.aborted) return;
          setItems(null);
          setError(reason instanceof Error ? reason.message : "讀取交易紀錄失敗");
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    });
    return () => controller.abort();
  }, [load]);

  async function refresh() {
    setIsLoading(true);
    try {
      await load();
    } catch (reason) {
      setItems(null);
      setError(reason instanceof Error ? reason.message : "讀取交易紀錄失敗");
    } finally {
      setIsLoading(false);
    }
  }

  const query = stockCode.trim().toUpperCase();
  const filtered = (items ?? []).filter((item) => {
    const date = taipeiDateKey(item.occurredAt);
    return (
      (!query || item.stockCode.toUpperCase().includes(query) || item.stockName.toUpperCase().includes(query)) &&
      (side === "all" || item.side === side) &&
      (!dateFrom || date >= dateFrom) &&
      (!dateTo || date <= dateTo)
    );
  });
  const money = priceFormatters[market];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          股票代號或名稱
          <input
            type="search"
            value={stockCode}
            onChange={(event) => setStockCode(event.target.value)}
            placeholder={market === "taiwan" ? "例如：2330" : "例如：AAPL"}
            className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
          />
        </label>
        <label className="text-sm font-semibold">
          買賣方向
          <select
            value={side}
            onChange={(event) => setSide(event.target.value)}
            className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 font-normal outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
          >
            <option value="all">全部</option>
            <option value="buy">買入</option>
            <option value="sell">賣出</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          開始日期
          <input type="date" value={dateFrom} max={dateTo || undefined} onChange={(event) => setDateFrom(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" />
        </label>
        <label className="text-sm font-semibold">
          結束日期
          <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(event) => setDateTo(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3 font-normal outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100" />
        </label>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 text-sm text-slate-600">
        <p aria-live="polite">
          {isLoading ? "讀取中…" : `顯示 ${filtered.length} 筆／已載入 ${items?.length ?? 0} 筆`}
          <span className="ml-2 text-xs text-slate-500">每個市場載入最近最多 200 筆</span>
        </p>
        <button type="button" disabled={isLoading} onClick={() => void refresh()} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold hover:bg-slate-50 disabled:opacity-50">
          重新整理
        </button>
      </div>
      {error ? <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p> : null}
      {!isLoading && !error && filtered.length === 0 ? (
        <p className="mt-5 rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-600">
          {items?.length ? "沒有符合條件的交易紀錄" : "目前沒有買賣交易紀錄"}
        </p>
      ) : null}
      {filtered.length > 0 ? (
        <ol className="mt-5 space-y-3">
          {filtered.map((item) => (
            <li key={item.id} className="rounded-xl border border-slate-200 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold text-slate-950">{item.stockCode} {item.stockName}</p>
                  <time dateTime={item.occurredAt} className="mt-1 block text-xs text-slate-500">
                    記錄時間：{dateTimeFormatter.format(new Date(item.occurredAt))}（台灣時間）
                  </time>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${item.side === "buy" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
                  {item.side === "buy" ? "買入" : "賣出"}
                </span>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-4">
                <div><dt className="text-xs text-slate-500">成交股數</dt><dd className="mt-1 font-semibold tabular-nums">{shareFormatter.format(item.shares)} 股</dd></div>
                <div><dt className="text-xs text-slate-500">每股成交價</dt><dd className="mt-1 font-semibold tabular-nums">{money.format(item.price)}</dd></div>
                <div><dt className="text-xs text-slate-500">成交金額</dt><dd className="mt-1 font-semibold tabular-nums">{money.format(item.grossAmount)}</dd></div>
                <div><dt className="text-xs text-slate-500">現金流金額</dt><dd className="mt-1 font-semibold tabular-nums">{money.format(item.cashAmount)}</dd></div>
                <div><dt className="text-xs text-slate-500">手續費</dt><dd className="mt-1 tabular-nums">{money.format(item.transactionFee)}</dd></div>
                {market === "taiwan" ? <div><dt className="text-xs text-slate-500">交易稅</dt><dd className="mt-1 tabular-nums">{money.format(item.transactionTax ?? 0)}</dd></div> : (
                  <><div><dt className="text-xs text-slate-500">SEC 費用</dt><dd className="mt-1 tabular-nums">{money.format(item.secFee ?? 0)}</dd></div><div><dt className="text-xs text-slate-500">TAF 費用</dt><dd className="mt-1 tabular-nums">{money.format(item.tafFee ?? 0)}</dd></div></>
                )}
                {item.side === "sell" ? <div><dt className="text-xs text-slate-500">已實現損益</dt><dd className={`mt-1 font-semibold tabular-nums ${item.realizedProfitLoss >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{money.format(item.realizedProfitLoss)}</dd></div> : null}
              </dl>
            </li>
          ))}
        </ol>
      ) : null}
    </>
  );
}
