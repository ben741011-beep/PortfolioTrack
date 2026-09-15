"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { readApiError } from "@/app/components/stock-ui";

type DividendStatusFilter = "all" | "paid" | "pending";
type DividendStatus = Exclude<DividendStatusFilter, "all">;
type DividendMarket = "tw" | "us";
type DividendCurrency = "TWD" | "USD";

type DividendRecord = {
  id: string;
  stockCode: string;
  stockName: string;
  market: DividendMarket;
  currency: DividendCurrency;
  dividendYear: number;
  exDividendDate: string;
  paymentDate: string | null;
  dividendPerShare: number;
  entitledShares: number;
  grossAmount: number;
  withholdingTaxRate: number;
  withholdingTax: number;
  netAmount: number;
  status: DividendStatus;
};

type DividendResponse = {
  items: DividendRecord[];
  positions: DividendPosition[];
};

type DividendPosition = {
  stockCode: string;
  stockName: string;
  principal: number;
  market: DividendMarket;
  currency: DividendCurrency;
};

type DividendSyncResponse = {
  positionCount: number;
  fetchedCount: number;
  insertedCount: number;
  modifiedCount: number;
  matchedCount: number;
  skippedCount: number;
  verifiedCount: number;
  syncedAt: string;
};

type RefreshStatus = {
  type: "success" | "error";
  message: string;
} | null;

const statusFilters: Array<{
  value: DividendStatusFilter;
  label: string;
}> = [
  { value: "all", label: "全部" },
  { value: "paid", label: "已入帳" },
  { value: "pending", label: "待發放" },
];

const currencyFormatters: Record<DividendCurrency, Intl.NumberFormat> = {
  TWD: new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }),
  USD: new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
};

const numberFormatter = new Intl.NumberFormat("zh-TW", {
  maximumFractionDigits: 6,
});

const percentageFormatter = new Intl.NumberFormat("zh-TW", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
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

function formatCurrency(value: number, currency: DividendCurrency) {
  return currencyFormatters[currency].format(value);
}

export function DividendOverview({ currentYear }: { currentYear: number }) {
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [statusFilter, setStatusFilter] =
    useState<DividendStatusFilter>("all");
  const [selectedMarket, setSelectedMarket] =
    useState<DividendMarket>("tw");
  const [records, setRecords] = useState<DividendRecord[]>([]);
  const [positions, setPositions] = useState<DividendPosition[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<RefreshStatus>(null);

  const loadDividendData = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/dividends", {
        cache: "no-store",
        signal,
      });
      const data = (await response.json()) as DividendResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error ?? "無法取得股息資料");
      }

      if (!Array.isArray(data.items) || !Array.isArray(data.positions)) {
        throw new Error("股息資料格式不正確");
      }

      if (signal?.aborted) {
        return;
      }

      setRecords(data.items);
      setPositions(data.positions);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setErrorMessage(
        error instanceof Error ? error.message : "無法取得股息資料",
      );
    } finally {
      if (!signal?.aborted) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    queueMicrotask(() => void loadDividendData(controller.signal));

    return () => controller.abort();
  }, [loadDividendData]);

  async function handleRefresh() {
    setIsRefreshing(true);
    setRefreshStatus(null);

    try {
      const response = await fetch("/api/dividends", { method: "POST" });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const result = (await response.json()) as DividendSyncResponse;

      if (
        typeof result.fetchedCount !== "number" ||
        typeof result.insertedCount !== "number" ||
        typeof result.modifiedCount !== "number" ||
        typeof result.verifiedCount !== "number"
      ) {
        throw new Error("股息更新結果格式不正確");
      }

      await loadDividendData();
      setRefreshStatus({
        type: "success",
        message:
          result.positionCount === 0
            ? "目前沒有台股或美股庫存可查詢股息"
            : `已查詢 ${result.fetchedCount} 筆；新增 ${result.insertedCount} 筆、修改 ${result.modifiedCount} 筆，依 ID 查回 ${result.verifiedCount} 筆`,
      });
    } catch (error) {
      setRefreshStatus({
        type: "error",
        message: error instanceof Error ? error.message : "手動更新股息失敗",
      });
    } finally {
      setIsRefreshing(false);
    }
  }

  const marketRecords = useMemo(
    () => records.filter((record) => record.market === selectedMarket),
    [records, selectedMarket],
  );

  const marketPositions = useMemo(
    () => positions.filter((position) => position.market === selectedMarket),
    [positions, selectedMarket],
  );

  const selectedCurrency: DividendCurrency =
    selectedMarket === "us" ? "USD" : "TWD";

  const years = useMemo(
    () =>
      Array.from(
        new Set([
          currentYear,
          ...marketRecords.map((record) => record.dividendYear),
        ]),
      ).sort((a, b) => b - a),
    [currentYear, marketRecords],
  );

  const yearRecords = useMemo(
    () =>
      marketRecords.filter((record) => record.dividendYear === selectedYear),
    [marketRecords, selectedYear],
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

  const totalPrincipal = useMemo(
    () =>
      marketPositions.reduce(
        (total, position) => total + position.principal,
        0,
      ),
    [marketPositions],
  );

  const annualSummaries = useMemo(
    () =>
      years.map((year) => {
        const annualRecords = marketRecords.filter(
          (record) => record.dividendYear === year,
        );
        const paid = annualRecords
          .filter((record) => record.status === "paid")
          .reduce((total, record) => total + record.netAmount, 0);
        const pending = annualRecords
          .filter((record) => record.status === "pending")
          .reduce((total, record) => total + record.netAmount, 0);
        const total = paid + pending;

        return {
          year,
          paid,
          pending,
          total,
          yieldOnCost: totalPrincipal > 0 ? total / totalPrincipal : null,
        };
      }),
    [marketRecords, totalPrincipal, years],
  );

  const paidAmount = paidRecords.reduce(
    (total, record) => total + record.netAmount,
    0,
  );
  const pendingAmount = pendingRecords.reduce(
    (total, record) => total + record.netAmount,
    0,
  );
  const annualAmount = paidAmount + pendingAmount;
  const annualYieldOnCost =
    totalPrincipal > 0 ? annualAmount / totalPrincipal : null;
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
        <header className="mb-8 flex flex-col gap-5 border-b border-slate-300 pb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="mb-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold tracking-[0.16em] text-emerald-800">
              股息配發
            </p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              年度股息一覽
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              頁面載入只讀取資料庫；按下按鈕才會查詢官方來源並更新股息。
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={isLoading || isRefreshing || positions.length === 0}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isRefreshing ? "查詢更新中…" : "手動更新股息"}
            </button>
            {refreshStatus ? (
              <p
                role={refreshStatus.type === "error" ? "alert" : "status"}
                className={`max-w-md text-xs leading-5 sm:text-right ${
                  refreshStatus.type === "success"
                    ? "text-emerald-700"
                    : "text-rose-700"
                }`}
              >
                {refreshStatus.message}
              </p>
            ) : null}
          </div>
        </header>

        <div
          className="mb-6 inline-grid grid-cols-2 gap-1 rounded-xl border border-slate-300 bg-white p-1 shadow-sm"
          role="group"
          aria-label="選擇股息市場"
        >
          {([
            { value: "tw" as const, label: "台股 TWD" },
            { value: "us" as const, label: "美股 USD" },
          ]).map((market) => (
            <button
              key={market.value}
              type="button"
              aria-pressed={selectedMarket === market.value}
              onClick={() => setSelectedMarket(market.value)}
              className={`min-h-10 rounded-lg px-4 py-2 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                selectedMarket === market.value
                  ? "bg-slate-950 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-950"
              }`}
            >
              {market.label}
            </button>
          ))}
        </div>

        <section
          aria-label={`${selectedYear} 年股息摘要`}
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <article className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-medium text-slate-500">
              {selectedYear} 年已入帳{selectedMarket === "us" ? "（稅後）" : ""}
            </p>
            <p className="mt-2 text-2xl font-bold text-emerald-700 tabular-nums">
              {formatCurrency(paidAmount, selectedCurrency)}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {paidRecords.length} 筆
            </p>
          </article>

          <article className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-medium text-slate-500">等待發放</p>
            <p className="mt-2 text-2xl font-bold text-amber-700 tabular-nums">
              {formatCurrency(pendingAmount, selectedCurrency)}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {pendingRecords.length} 筆
            </p>
          </article>

          <article className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm sm:p-6">
            <p className="text-xs font-medium text-slate-500">
              {selectedMarket === "us" ? "全年實收" : "全年合計"}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {formatCurrency(annualAmount, selectedCurrency)}
            </p>
            <p className="mt-2 text-sm text-slate-500">已入帳＋待發放</p>
          </article>

          <article className="rounded-xl border border-emerald-200 bg-emerald-950 p-5 text-white shadow-sm sm:p-6">
            <p className="text-xs font-medium text-emerald-200">
              {selectedYear} 年股息成本殖利率
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {annualYieldOnCost === null
                ? "—"
                : `${percentageFormatter.format(annualYieldOnCost * 100)}%`}
            </p>
            <p className="mt-2 text-sm text-emerald-200">
              以目前投入本金 {formatCurrency(totalPrincipal, selectedCurrency)} 計算
            </p>
          </article>
        </section>

        <section
          aria-labelledby="annual-dividend-analysis-title"
          className="mt-6 rounded-2xl border border-slate-300 bg-white p-5 shadow-sm sm:p-6"
        >
          <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-bold tracking-[0.14em] text-emerald-700">
                年度分析
              </p>
              <h2
                id="annual-dividend-analysis-title"
                className="mt-1 text-xl font-bold text-slate-950"
              >
                股息與成本殖利率
              </h2>
            </div>
            <p className="text-sm text-slate-500">
              投入本金 {formatCurrency(totalPrincipal, selectedCurrency)}
            </p>
          </div>

          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            {annualSummaries.map((summary) => (
              <button
                key={summary.year}
                type="button"
                onClick={() => setSelectedYear(summary.year)}
                aria-pressed={selectedYear === summary.year}
                className={`rounded-xl border p-4 text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 sm:p-5 ${
                  selectedYear === summary.year
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-200 bg-slate-50 hover:border-slate-300"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-bold text-slate-700">
                      {summary.year} 年度股息
                    </p>
                    <p className="mt-1 text-xl font-bold text-slate-950 tabular-nums">
                      {formatCurrency(summary.total, selectedCurrency)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-medium text-slate-500">
                      成本殖利率
                    </p>
                    <p className="mt-1 text-lg font-bold text-emerald-700 tabular-nums">
                      {summary.yieldOnCost === null
                        ? "—"
                        : `${percentageFormatter.format(summary.yieldOnCost * 100)}%`}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 text-sm">
                  <p className="text-slate-500">
                    已入帳
                    <span className="mt-1 block font-bold text-emerald-700 tabular-nums">
                      {formatCurrency(summary.paid, selectedCurrency)}
                    </span>
                  </p>
                  <p className="text-slate-500">
                    待發放
                    <span className="mt-1 block font-bold text-amber-700 tabular-nums">
                      {formatCurrency(summary.pending, selectedCurrency)}
                    </span>
                  </p>
                </div>
              </button>
            ))}
          </div>

          <p className="mt-4 text-xs leading-5 text-slate-500">
            成本殖利率＝該年度{selectedMarket === "us" ? "稅後實收" : "股息合計"} ÷ 目前持股投入本金；年度股息包含已入帳與待發放金額。
          </p>
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
                onClick={() => void loadDividendData()}
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
                手動更新完成後，這裡會依年份顯示目前庫存的股息紀錄。
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
                      每股 {numberFormatter.format(record.dividendPerShare)} {record.currency} ×{" "}
                      {numberFormatter.format(record.entitledShares)} 股
                    </p>
                    {record.market === "us" ? (
                      <p className="mt-1 text-sm text-slate-500">
                        現金股利 {formatCurrency(record.grossAmount, record.currency)}
                        <span className="mx-2 text-slate-300" aria-hidden="true">
                          ｜
                        </span>
                        預扣稅 {formatCurrency(record.withholdingTax, record.currency)}（{percentageFormatter.format(record.withholdingTaxRate * 100)}%）
                      </p>
                    ) : null}
                  </div>

                  <div className="sm:text-right">
                    {record.market === "us" ? (
                      <p className="text-xs font-medium text-slate-500">實收</p>
                    ) : null}
                    <p className="text-xl font-bold text-slate-950 tabular-nums">
                      {formatCurrency(record.netAmount, record.currency)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <p className="mt-3 text-xs leading-5 text-slate-500">
          預估金額以除息日鎖定的持有股數計算；美股預扣稅按現金股利 30% 並四捨五入到美分，實際入帳以券商紀錄為準。
        </p>
      </div>
    </main>
  );
}
