"use client";

import { useState } from "react";

type DividendStatusFilter = "all" | "paid" | "pending";

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

export function DividendOverview({ currentYear }: { currentYear: number }) {
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [statusFilter, setStatusFilter] =
    useState<DividendStatusFilter>("all");
  const years = [currentYear, currentYear - 1, currentYear - 2];
  const recordCount = 0;

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

        <section aria-label={`${selectedYear} 年股息摘要`} className="grid gap-3 md:grid-cols-3">
          <article className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-medium text-slate-500">
              {selectedYear} 年已入帳
            </p>
            <p className="mt-2 text-2xl font-bold text-emerald-700 tabular-nums">
              {currencyFormatter.format(0)}
            </p>
            <p className="mt-2 text-sm text-slate-500">0 筆</p>
          </article>

          <article className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-medium text-slate-500">等待發放</p>
            <p className="mt-2 text-2xl font-bold text-amber-700 tabular-nums">
              {currencyFormatter.format(0)}
            </p>
            <p className="mt-2 text-sm text-slate-500">0 筆</p>
          </article>

          <article className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-medium text-slate-500">全年合計</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {currencyFormatter.format(0)}
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
                    {filter.label} {recordCount}
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

          <div className="px-5 py-14 text-center sm:px-7 sm:py-16">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-slate-100 text-lg font-bold text-slate-400" aria-hidden="true">
              $
            </div>
            <h2 className="mt-4 text-base font-bold text-slate-800">
              {emptyStateText}
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-slate-500">
              建立股息資料格式後，這裡會依月份顯示股票、發放日、每股股息、持有股數、股息金額與入帳狀態。
            </p>
          </div>
        </section>

        <p className="mt-3 text-xs leading-5 text-slate-500">
          預估金額將以除息基準日持有股數計算；實際入帳以券商紀錄為準。
        </p>
      </div>
    </main>
  );
}
