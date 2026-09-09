import type { Metadata } from "next";

import { monthlyStatistics } from "@/lib/monthly-statistics";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "市場統計｜PortfolioTrack",
  description: "依月份檢視歷史樣本的上漲率與期望值",
};

function formatPercent(value: number, showPositiveSign = false) {
  const sign = showPositiveSign && value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

function valueColor(value: number) {
  return value >= 0 ? "text-emerald-700" : "text-rose-700";
}

export default function Home() {
  const currentMonth = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Taipei",
      month: "numeric",
    }).format(new Date()),
  );
  const highestRiseRate = monthlyStatistics.reduce((highest, statistic) =>
    statistic.riseRate > highest.riseRate ? statistic : highest,
  );
  const highestExpectedReturn = monthlyStatistics.reduce((highest, statistic) =>
    statistic.expectedReturn > highest.expectedReturn ? statistic : highest,
  );
  const lowestExpectedReturn = monthlyStatistics.reduce((lowest, statistic) =>
    statistic.expectedReturn < lowest.expectedReturn ? statistic : lowest,
  );

  return (
    <main className="flex-1 bg-slate-100 px-4 py-8 text-slate-950 sm:px-6 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 border-b border-slate-300 pb-8">
          <p className="mb-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold tracking-[0.16em] text-emerald-800">
            市場歷史表現
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            月份表現統計
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            依月份整理歷史樣本的期望值、上漲機率與平均漲跌表現。
          </p>
        </header>

        <section aria-label="統計摘要" className="grid gap-3 md:grid-cols-3">
          <article className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-medium text-slate-500">上漲機率最高</p>
            <p className="mt-2 text-2xl font-bold">{highestRiseRate.month}月</p>
            <p className="mt-2 text-sm text-slate-600">
              {formatPercent(highestRiseRate.riseRate)}・{highestRiseRate.riseCount} 漲 / {highestRiseRate.fallCount} 跌
            </p>
          </article>

          <article className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-medium text-slate-500">期望值最高</p>
            <p className="mt-2 text-2xl font-bold text-emerald-700">{highestExpectedReturn.month}月</p>
            <p className="mt-2 text-sm font-semibold text-emerald-700">
              {formatPercent(highestExpectedReturn.expectedReturn, true)}
            </p>
          </article>

          <article className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-medium text-slate-500">期望值最低</p>
            <p className="mt-2 text-2xl font-bold text-rose-700">{lowestExpectedReturn.month}月</p>
            <p className="mt-2 text-sm font-semibold text-rose-700">
              {formatPercent(lowestExpectedReturn.expectedReturn)}
            </p>
          </article>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
          <h2 className="sr-only">各月份統計明細</h2>

          <div className="divide-y divide-slate-200 lg:hidden">
            {monthlyStatistics.map((statistic) => {
              const isCurrentMonth = statistic.month === currentMonth;

              return (
                <article
                  key={statistic.month}
                  className={isCurrentMonth ? "border-l-4 border-emerald-700 bg-emerald-50 p-5" : "border-l-4 border-transparent p-5"}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-bold">{statistic.month}月</h3>
                      {isCurrentMonth ? (
                        <span className="rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] font-bold text-white">
                          本月
                        </span>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-500">期望值</p>
                      <p className={`mt-1 font-bold ${valueColor(statistic.expectedReturn)}`}>
                        {formatPercent(statistic.expectedReturn, true)}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">上漲率</span>
                      <span className="font-semibold text-slate-900">{formatPercent(statistic.riseRate)}</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-emerald-600" style={{ width: `${statistic.riseRate}%` }} />
                    </div>
                  </div>

                  <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 text-sm min-[440px]:grid-cols-3">
                    <div>
                      <dt className="text-xs text-slate-500">上漲時平均</dt>
                      <dd className="mt-1 font-semibold">{formatPercent(statistic.averageRise)}</dd>
                    </div>
                    <div className="text-right min-[440px]:text-left">
                      <dt className="text-xs text-slate-500">下跌時平均</dt>
                      <dd className="mt-1 font-semibold text-slate-600">{formatPercent(statistic.averageFall)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500">漲 / 跌</dt>
                      <dd className="mt-1 font-semibold">
                        <span className="text-emerald-700">{statistic.riseCount}</span>
                        <span className="text-slate-400"> / </span>
                        <span className="text-rose-700">{statistic.fallCount}</span>
                      </dd>
                    </div>
                    <div className="text-right min-[440px]:text-left">
                      <dt className="text-xs text-slate-500">樣本</dt>
                      <dd className="mt-1 font-semibold">{statistic.sampleCount}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>

          <div className="hidden overflow-x-auto lg:block">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-semibold">月份</th>
                  <th className="px-5 py-4 font-semibold">期望值</th>
                  <th className="px-5 py-4 font-semibold">上漲率</th>
                  <th className="px-5 py-4 text-right font-semibold">上漲時平均</th>
                  <th className="px-5 py-4 text-right font-semibold">下跌時平均</th>
                  <th className="px-5 py-4 text-right font-semibold">上漲</th>
                  <th className="px-5 py-4 text-right font-semibold">下跌</th>
                  <th className="px-5 py-4 text-right font-semibold">樣本</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthlyStatistics.map((statistic) => {
                  const isCurrentMonth = statistic.month === currentMonth;

                  return (
                    <tr key={statistic.month} className={isCurrentMonth ? "bg-emerald-50" : "hover:bg-slate-50/70"}>
                      <td className={`border-l-4 px-5 py-4 font-bold ${isCurrentMonth ? "border-emerald-700" : "border-transparent"}`}>
                        <span>{statistic.month}月</span>
                        {isCurrentMonth ? (
                          <span className="ml-2 rounded-full bg-emerald-700 px-2 py-0.5 text-[11px] text-white">本月</span>
                        ) : null}
                      </td>
                      <td className={`px-5 py-4 font-bold ${valueColor(statistic.expectedReturn)}`}>
                        {formatPercent(statistic.expectedReturn, true)}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${statistic.riseRate}%` }} />
                          </div>
                          <span className="font-medium tabular-nums">{formatPercent(statistic.riseRate)}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right font-medium tabular-nums">{formatPercent(statistic.averageRise)}</td>
                      <td className="px-5 py-4 text-right text-slate-600 tabular-nums">{formatPercent(statistic.averageFall)}</td>
                      <td className="px-5 py-4 text-right font-medium text-emerald-700 tabular-nums">{statistic.riseCount}</td>
                      <td className="px-5 py-4 text-right font-medium text-rose-700 tabular-nums">{statistic.fallCount}</td>
                      <td className="px-5 py-4 text-right text-slate-500 tabular-nums">{statistic.sampleCount}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="border-t border-slate-200 px-5 py-4 text-xs leading-5 text-slate-500">
            期望值為依上漲率、上漲時平均與下跌時平均計算的統計結果；歷史統計不代表未來報酬。
          </p>
        </section>
      </div>
    </main>
  );
}
