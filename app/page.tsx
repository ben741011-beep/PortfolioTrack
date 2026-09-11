import type { Metadata } from "next";
import { connection } from "next/server";

import {
  type MarketComparison,
  monthlyStatistics,
} from "@/lib/monthly-statistics";

export const metadata: Metadata = {
  title: "台股 vs 美股 29年實測｜PortfolioTrack",
  description: "比較台股與美股各月份的 29 年平均報酬與勝率",
};

function formatAverageReturn(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function formatWinRate(value: number) {
  return `${value.toFixed(1)}%`;
}

function averageReturnColor(value: number) {
  return value >= 0 ? "text-emerald-300" : "text-rose-300";
}

function Comparison({ comparison }: { comparison: MarketComparison }) {
  const badgeColor = comparison.warning
    ? "border-amber-400/25 bg-amber-400/10 text-amber-200"
    : comparison.market === "TW"
      ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
      : comparison.market === "US"
        ? "border-sky-400/25 bg-sky-400/10 text-sky-200"
        : "border-white/10 bg-white/[0.04] text-neutral-300";

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${badgeColor}`}>
      {comparison.market ? (
        <span className="text-[9px] font-black tracking-[0.12em] opacity-70" aria-hidden="true">
          {comparison.market}
        </span>
      ) : null}
      {comparison.warning ? <span aria-hidden="true">⚠️</span> : null}
      <span>{comparison.label}</span>
    </span>
  );
}

export default async function Home() {
  await connection();

  const currentMonth = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Taipei",
      month: "numeric",
    }).format(new Date()),
  );

  return (
    <main className="relative flex-1 overflow-hidden bg-[#151515] px-4 py-8 text-neutral-100 sm:px-6 sm:py-10 lg:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute -top-40 right-0 size-80 rounded-full bg-emerald-500/[0.07] blur-3xl" />

      <section className="mx-auto max-w-6xl" aria-labelledby="market-comparison-title">
        <header className="relative mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] text-emerald-300">
              <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)]" />
              29 年歷史樣本
            </div>
            <h1 id="market-comparison-title" className="text-xl font-bold tracking-tight sm:text-2xl">
              台股 vs 美股 29年實測
            </h1>
            <p className="mt-2 text-sm text-neutral-400">
              快速比較每月平均報酬、勝率與相對強弱。
            </p>
          </div>

          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            本月：{currentMonth}月
          </div>
        </header>

        <div className="relative hidden overflow-x-auto rounded-2xl border border-white/10 bg-neutral-900/70 shadow-2xl shadow-black/20 md:block">
          <table className="w-full min-w-[720px] table-fixed text-left text-sm">
            <thead className="border-b border-white/10 bg-white/[0.025] text-xs tracking-wide text-neutral-400">
              <tr>
                <th className="w-[10%] py-3.5 pr-4 pl-3 font-semibold">月份</th>
                <th className="w-[16%] px-3 py-3.5 font-semibold">台股平均</th>
                <th className="w-[16%] px-3 py-3.5 font-semibold">台股勝率</th>
                <th className="w-[16%] px-3 py-3.5 font-semibold">美股平均</th>
                <th className="w-[16%] px-3 py-3.5 font-semibold">美股勝率</th>
                <th className="w-[26%] py-3.5 pr-3 pl-3 font-semibold">相對較強</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {monthlyStatistics.map((statistic) => {
                const isCurrentMonth = statistic.month === currentMonth;

                return (
                  <tr
                    key={statistic.month}
                    className={isCurrentMonth ? "bg-emerald-400/[0.08]" : "transition-colors hover:bg-white/[0.025]"}
                  >
                    <th
                      scope="row"
                      className={`border-l-2 py-3.5 pr-4 pl-3 font-semibold ${
                        isCurrentMonth ? "border-emerald-400 text-white" : "border-transparent text-neutral-300"
                      }`}
                    >
                      <span>{statistic.month}月</span>
                      {isCurrentMonth ? (
                        <span className="ml-2 rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold text-emerald-950">
                          本月
                        </span>
                      ) : null}
                    </th>
                    <td className={`px-3 py-3.5 font-bold tabular-nums ${averageReturnColor(statistic.taiwanAverageReturn)}`}>
                      {formatAverageReturn(statistic.taiwanAverageReturn)}
                    </td>
                    <td className="px-3 py-3.5 text-neutral-200 tabular-nums">
                      {formatWinRate(statistic.taiwanWinRate)}
                    </td>
                    <td className={`px-3 py-3.5 font-bold tabular-nums ${averageReturnColor(statistic.usAverageReturn)}`}>
                      {formatAverageReturn(statistic.usAverageReturn)}
                    </td>
                    <td className="px-3 py-3.5 text-neutral-200 tabular-nums">
                      {formatWinRate(statistic.usWinRate)}
                    </td>
                    <td className="py-3.5 pr-3 pl-3">
                      <Comparison comparison={statistic.comparison} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-3 md:hidden">
          {monthlyStatistics.map((statistic) => {
            const isCurrentMonth = statistic.month === currentMonth;

            return (
              <article
                key={statistic.month}
                className={`rounded-2xl border p-4 shadow-lg shadow-black/10 ${
                  isCurrentMonth
                    ? "border-emerald-400/45 bg-emerald-400/[0.08] ring-1 ring-emerald-400/10"
                    : "border-white/[0.08] bg-neutral-900/70"
                }`}
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold">{statistic.month}月</h2>
                    {isCurrentMonth ? (
                      <span className="rounded-full bg-emerald-400 px-2 py-0.5 text-[10px] font-bold text-emerald-950">
                        本月
                      </span>
                    ) : null}
                  </div>
                  <Comparison comparison={statistic.comparison} />
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-white/[0.06] pt-4 text-sm">
                  <div>
                    <dt className="text-xs text-neutral-500">台股平均</dt>
                    <dd className={`mt-1 font-bold tabular-nums ${averageReturnColor(statistic.taiwanAverageReturn)}`}>
                      {formatAverageReturn(statistic.taiwanAverageReturn)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-neutral-500">美股平均</dt>
                    <dd className={`mt-1 font-bold tabular-nums ${averageReturnColor(statistic.usAverageReturn)}`}>
                      {formatAverageReturn(statistic.usAverageReturn)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-neutral-500">台股勝率</dt>
                    <dd className="mt-1 tabular-nums">{formatWinRate(statistic.taiwanWinRate)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-neutral-500">美股勝率</dt>
                    <dd className="mt-1 tabular-nums">{formatWinRate(statistic.usWinRate)}</dd>
                  </div>
                </dl>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
