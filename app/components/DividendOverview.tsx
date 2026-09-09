"use client";

import { useEffect, useMemo, useState } from "react";

type DividendStatusFilter = "all" | "paid" | "pending";
type DividendStatus = Exclude<DividendStatusFilter, "all">;

type DividendRecord = {
  id: string;
  stockCode: string;
  stockName: string;
  dividendYear: number;
  exDividendDate: string;
  paymentDate: string | null;
  dividendPerShare: number;
  entitledShares: number;
  grossAmount: number;
  status: DividendStatus;
};

type DividendResponse = {
  items: DividendRecord[];
};

const statusFilters: Array<{
  value: DividendStatusFilter;
  label: string;
}> = [
  { value: "all", label: "全部" },
  { value: "paid", label: "已入帳" },
  { value: "pending", label: "待發放" },
];

const currencyFormatter = new Intl.NumberFormat("zh-TW", {
  style: "currency",
  currency: "TWD",
  maximumFractionDigits: 0,
});

const numberFormatter = new Intl.NumberFormat("zh-TW", {
  maximumFractionDigits: 6,
});

const dateFormatter = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function formatDate(value: string) {
  return dateFormatter.format(new Date(value));
}

export function DividendOverview({ currentYear }: { currentYear: number }) {
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [statusFilter, setStatusFilter] =
    useState<DividendStatusFilter>("all");
  const [records, setRecords] = useState<DividendRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/dividends", {
        cache: "no-store",
        signal: controller.signal,
      })
      .then(async (response) => {
        const data = (await response.json()) as DividendResponse & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error ?? "無法取得股息資料");
        }

        if (!Array.isArray(data.items)) {
          throw new Error("股息資料格式不正確");
        }

        return data.items;
      })
      .then((items) => setRecords(items))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setErrorMessage(
          error instanceof Error ? error.message : "無法取得股息資料",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      });

    return () => controller.abort();
  }, [reloadKey]);

  const years = useMemo(
    () =>
      Array.from(
        new Set([currentYear, ...records.map((record) => record.dividendYear)]),
      ).sort((a, b) => b - a),
    [currentYear, records],
  );

  const yearRecords = useMemo(
    () => records.filter((record) => record.dividendYear === selectedYear),
    [records, selectedYear],
  );

  const paidRecords = useMemo(
    () => yearRecords.filter((record) => record.status === "paid"),
    [yearRecords],
  );

  const pendingRecords = useMemo(
    () => yearRecords.filter((record) => record.status === "pending"),
    [yearRecords],
  );

  const visibleRecords = useMemo(
    () =>
      statusFilter === "all"
        ? yearRecords
        : yearRecords.filter((record) => record.status === statusFilter),
    [statusFilter, yearRecords],
  );

  const paidAmount = paidRecords.reduce(
    (total, record) => total + record.grossAmount,
    0,
  );
  const pendingAmount = pendingRecords.reduce(
    (total, record) => total + record.grossAmount,
    0,
  );
  const recordCounts: Record<DividendStatusFilter, number> = {
    all: yearRecords.length,
    paid: paidRecords.length,
    pending: pendingRecords.length,
  };

  const emptyStateText =
    statusFilter === "paid"
      ? `${selectedYear} 年目前沒有已入帳的股息`
      : statusFilter === "pending"
        ? `${selectedYear} 年目前沒有待發放的股息`
        : `${selectedYear} 年目前還沒有股息紀錄`;

  return (
    <main className="flex-1 bg-slate-100 px-4 py-8 text-slate-950 sm:px-6 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 border-b border-slate-300 pb-8">
          <p className="mb-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold tracking-[0.16em] text-emerald-800">
            股息配發
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            年度股息一覽
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            集中查看已入帳與等待發放的現金股息。
          </p>
        </header>

        <section
          aria-label={`${selectedYear} 年股息摘要`}
          className="grid gap-3 md:grid-cols-3"
        >
          <article className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-medium text-slate-500">
              {selectedYear} 年已入帳
            </p>
            <p className="mt-2 text-2xl font-bold text-emerald-700 tabular-nums">
              {currencyFormatter.format(paidAmount)}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {paidRecords.length} 筆
            </p>
          </article>

          <article className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-medium text-slate-500">等待發放</p>
            <p className="mt-2 text-2xl font-bold text-amber-700 tabular-nums">
              {currencyFormatter.format(pendingAmount)}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {pendingRecords.length} 筆
            </p>
          </article>

          <article className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-medium text-slate-500">全年合計</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {currencyFormatter.format(paidAmount + pendingAmount)}
            </p>
            <p className="mt-2 text-sm text-slate-500">已入帳＋待發放</p>
          </article>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div
              role="group"
              aria-label="依股息狀態篩選"
              className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1"
            >
              {statusFilters.map((filter) => {
                const isSelected = statusFilter === filter.value;

                return (
                  <button
                    key={filter.value}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setStatusFilter(filter.value)}
                    className={`min-h-10 rounded-lg px-3 py-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                      isSelected
                        ? "bg-white text-slate-950 shadow-sm"
                        : "text-slate-600 hover:text-slate-950"
                    }`}
                  >
                    {filter.label} {recordCounts[filter.value]}
                  </button>
                );
              })}
            </div>

            <label className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-600 sm:justify-start">
              年度
              <select
                value={selectedYear}
                onChange={(event) => setSelectedYear(Number(event.target.value))}
                className="min-h-10 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
              >
                {years.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isLoading ? (
            <div
              className="px-5 py-14 text-center text-sm font-medium text-slate-500 sm:px-7 sm:py-16"
              role="status"
            >
              正在載入股息資料…
            </div>
          ) : errorMessage ? (
            <div className="px-5 py-14 text-center sm:px-7 sm:py-16" role="alert">
              <h2 className="text-base font-bold text-rose-700">
                股息資料載入失敗
              </h2>
              <p className="mt-2 text-sm text-slate-600">{errorMessage}</p>
              <button
                type="button"
                onClick={() => {
                  setIsLoading(true);
                  setErrorMessage(null);
                  setReloadKey((value) => value + 1);
                }}
                className="mt-5 min-h-10 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                重新載入
              </button>
            </div>
          ) : visibleRecords.length === 0 ? (
            <div className="px-5 py-14 text-center sm:px-7 sm:py-16">
              <div
                className="mx-auto flex size-12 items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-slate-400"
                aria-hidden="true"
              >
                $
              </div>
              <h2 className="mt-4 text-base font-bold text-slate-800">
                {emptyStateText}
              </h2>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
                每日同步完成後，這裡會依年份顯示目前庫存的股息紀錄。
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {visibleRecords.map((record) => (
                <article
                  key={record.id}
                  className="grid gap-4 px-5 py-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-7"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold text-slate-950">
                        {record.stockCode} {record.stockName}
                      </h2>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                          record.status === "paid"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-amber-50 text-amber-700"
                        }`}
                      >
                        {record.status === "paid" ? "已入帳" : "待發放"}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                      除息日 {formatDate(record.exDividendDate)}
                      <span className="mx-2 text-slate-300" aria-hidden="true">
                        ｜
                      </span>
                      {record.paymentDate
                        ? `發放日 ${formatDate(record.paymentDate)}`
                        : "發放日待公告"}
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      每股 {numberFormatter.format(record.dividendPerShare)} 元 ×{" "}
                      {numberFormatter.format(record.entitledShares)} 股
                    </p>
                  </div>

                  <p className="text-xl font-bold text-slate-950 tabular-nums sm:text-right">
                    {currencyFormatter.format(record.grossAmount)}
                  </p>
                </article>
              ))}
            </div>
          )}
        </section>

        <p className="mt-3 text-xs leading-5 text-slate-500">
          預估金額以除息日鎖定的持有股數計算；實際入帳以券商紀錄為準。
        </p>
      </div>
    </main>
  );
}
