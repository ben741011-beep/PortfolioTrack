"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { numberFormatter, readApiError } from "@/app/components/stock-ui";

type UsStockAssetType = "stock" | "stockEtf" | "bondEtf";

type UsStockPosition = {
  id: string;
  stockCode: string;
  stockName: string;
  assetType: UsStockAssetType;
  shares: number;
  principal: number;
  createdAt: string;
  updatedAt: string;
};

type UsStockSummary = {
  count: number;
  totalPrincipal: number;
  stockCount: number;
  etfCount: number;
};

type ListResponse = {
  items: UsStockPosition[];
  summary: UsStockSummary;
};

type ProfileResponse = Pick<
  UsStockPosition,
  "stockCode" | "stockName" | "assetType"
>;

type LookupStatus = "idle" | "loading" | "success" | "error";

type Message = {
  text: string;
  type: "success" | "error";
};

const EMPTY_SUMMARY: UsStockSummary = {
  count: 0,
  totalPrincipal: 0,
  stockCount: 0,
  etfCount: 0,
};

const usStockAssetTypes: readonly UsStockAssetType[] = [
  "stock",
  "stockEtf",
  "bondEtf",
];

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const shareFormatter = new Intl.NumberFormat("zh-TW", {
  maximumFractionDigits: 6,
});

const inputClassName =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";

export function UsStockInventory() {
  const [items, setItems] = useState<UsStockPosition[]>([]);
  const [summary, setSummary] = useState<UsStockSummary>(EMPTY_SUMMARY);
  const [stockCode, setStockCode] = useState("");
  const [stockName, setStockName] = useState("");
  const [shares, setShares] = useState("");
  const [principal, setPrincipal] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [lookupStatus, setLookupStatus] = useState<LookupStatus>("idle");
  const [lookupError, setLookupError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [message, setMessage] = useState<Message | null>(null);

  const loadPositions = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/us-stock-positions", {
      cache: "no-store",
      signal,
    });

    if (!response.ok) {
      throw new Error(await readApiError(response));
    }

    const body = (await response.json()) as ListResponse;

    if (!Array.isArray(body.items) || !body.summary) {
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

  useEffect(() => {
    if (editingId || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(stockCode)) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLookupStatus("loading");

      void fetch(
        `/api/us-stocks/profile?code=${encodeURIComponent(stockCode)}`,
        { cache: "no-store", signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(await readApiError(response));
          }

          const profile = (await response.json()) as ProfileResponse;

          if (
            profile.stockCode !== stockCode ||
            !profile.stockName ||
            !usStockAssetTypes.includes(profile.assetType)
          ) {
            throw new Error("美股資料格式不正確");
          }

          setStockName(profile.stockName);
          setLookupError("");
          setLookupStatus("success");
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }

          setLookupError(
            error instanceof Error ? error.message : "美股資料查詢失敗",
          );
          setLookupStatus("error");
        });
    }, 400);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [editingId, stockCode]);

  function resetForm() {
    setStockCode("");
    setStockName("");
    setShares("");
    setPrincipal("");
    setEditingId(null);
    setLookupStatus("idle");
    setLookupError("");
  }

  async function submitPosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingId && lookupStatus !== "success") {
      setMessage({ text: "請先輸入可查詢到的美股代號", type: "error" });
      return;
    }

    setIsSaving(true);
    setMessage(null);

    const endpoint = editingId
      ? `/api/us-stock-positions/${editingId}`
      : "/api/us-stock-positions";
    const body = editingId
      ? { shares, principal }
      : { stockCode, shares, principal };

    try {
      const response = await fetch(endpoint, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const successText = editingId ? "美股庫存已更新" : "美股庫存已新增";
      resetForm();
      await loadPositions();
      setMessage({ text: successText, type: "success" });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "儲存美股庫存失敗",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  }

  function beginEdit(item: UsStockPosition) {
    setEditingId(item.id);
    setStockCode(item.stockCode);
    setStockName(item.stockName);
    setShares(String(item.shares));
    setPrincipal(String(item.principal));
    setLookupStatus("success");
    setLookupError("");
    setMessage(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function deletePosition(item: UsStockPosition) {
    const confirmed = window.confirm(
      `確定要刪除 ${item.stockCode} ${item.stockName} 的美股庫存嗎？`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingId(item.id);
    setMessage(null);

    try {
      const response = await fetch(`/api/us-stock-positions/${item.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      if (editingId === item.id) {
        resetForm();
      }

      await loadPositions();
      setMessage({ text: `${item.stockCode} 已刪除`, type: "success" });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "刪除美股庫存失敗",
        type: "error",
      });
    } finally {
      setDeletingId(null);
    }
  }

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
              以美元記錄美股與 ETF 的持有股數及投入成本，支援小數股。
            </p>
          </div>

          <div className="grid w-full grid-cols-2 gap-3 lg:max-w-lg">
            <SummaryCard label="庫存筆數" value={numberFormatter.format(summary.count)} />
            <SummaryCard label="總投資金額" value={usdFormatter.format(summary.totalPrincipal)} />
          </div>
        </header>

        <div className="grid gap-6 xl:grid-cols-[minmax(300px,380px)_minmax(0,1fr)] xl:items-start">
          <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm sm:p-7 xl:sticky xl:top-24">
            <p className="text-xs font-bold tracking-[0.14em] text-sky-700">
              {editingId ? "EDIT POSITION" : "INITIAL POSITION"}
            </p>
            <h2 className="mt-2 text-xl font-bold">
              {editingId ? `修改 ${stockCode}` : "建立初始庫存"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              適合第一次匯入現有持股，股票名稱由外部資料取得。
            </p>

            <form onSubmit={submitPosition} className="mt-6 space-y-5">
              <div>
                <label htmlFor="usStockCode" className="mb-2 block text-sm font-semibold">
                  股票代號
                </label>
                <input
                  id="usStockCode"
                  value={stockCode}
                  onChange={(event) => {
                    setStockCode(event.target.value.toUpperCase().trim());
                    setStockName("");
                    setLookupStatus("idle");
                    setLookupError("");
                    setMessage(null);
                  }}
                  placeholder="例如：AAPL"
                  autoComplete="off"
                  disabled={editingId !== null}
                  required
                  className={`${inputClassName} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500`}
                />
                <p
                  aria-live="polite"
                  className={`mt-2 min-h-5 text-sm font-medium ${
                    lookupStatus === "error"
                      ? "text-rose-700"
                      : lookupStatus === "success"
                        ? "text-emerald-700"
                        : "text-slate-500"
                  }`}
                >
                  {editingId
                    ? stockName
                    : lookupStatus === "loading"
                      ? "正在查詢股票名稱…"
                      : lookupStatus === "success"
                        ? stockName
                        : lookupError || "股票名稱由外部資料取得"}
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-1">
                <div>
                  <label htmlFor="usShares" className="mb-2 block text-sm font-semibold">
                    目前股數
                  </label>
                  <input
                    id="usShares"
                    type="number"
                    min="0.000001"
                    step="any"
                    inputMode="decimal"
                    value={shares}
                    onChange={(event) => setShares(event.target.value)}
                    placeholder="例如：10.5"
                    required
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label htmlFor="usPrincipal" className="mb-2 block text-sm font-semibold">
                    目前投入成本（USD）
                  </label>
                  <input
                    id="usPrincipal"
                    type="number"
                    min="0.01"
                    step="any"
                    inputMode="decimal"
                    value={principal}
                    onChange={(event) => setPrincipal(event.target.value)}
                    placeholder="例如：1850.50"
                    required
                    className={inputClassName}
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <p
                  aria-live="polite"
                  className={`min-h-5 text-sm font-medium ${
                    message?.type === "error"
                      ? "text-rose-700"
                      : "text-emerald-700"
                  }`}
                >
                  {message?.text}
                </p>
                <div className="mt-3 flex gap-2">
                  {editingId ? (
                    <button
                      type="button"
                      onClick={() => {
                        resetForm();
                        setMessage(null);
                      }}
                      className="min-h-11 flex-1 rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
                    >
                      取消
                    </button>
                  ) : null}
                  <button
                    type="submit"
                    disabled={
                      isSaving || (!editingId && lookupStatus !== "success")
                    }
                    className="min-h-11 flex-1 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSaving
                      ? "儲存中…"
                      : editingId
                        ? "儲存修改"
                        : "建立初始庫存"}
                  </button>
                </div>
              </div>
            </form>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-5 sm:px-7">
              <h2 className="text-lg font-bold">目前美股庫存</h2>
              <p className="mt-2 text-sm text-slate-500">
                投入成本以美元記錄；即時市值與損益尚未納入本版本。
              </p>
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
                  使用左側表單建立第一筆美股或 ETF 庫存。
                </p>
              </div>
            ) : (
              <>
                <div className="divide-y divide-slate-200 lg:hidden">
                  {items.map((item) => (
                    <article key={item.id} className="p-5 sm:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-bold tracking-wide text-sky-700">
                            {item.stockCode}
                          </p>
                          <h3 className="mt-1 break-words text-lg font-bold">
                            {item.stockName}
                          </h3>
                        </div>
                      </div>
                      <dl className="mt-5 grid grid-cols-2 gap-4 border-y border-slate-200 py-5">
                        <div>
                          <dt className="text-xs text-slate-500">持有股數</dt>
                          <dd className="mt-1 font-bold tabular-nums">
                            {shareFormatter.format(item.shares)}
                          </dd>
                        </div>
                        <div className="text-right">
                          <dt className="text-xs text-slate-500">投入成本</dt>
                          <dd className="mt-1 font-bold tabular-nums">
                            {usdFormatter.format(item.principal)}
                          </dd>
                        </div>
                      </dl>
                      <PositionActions
                        item={item}
                        deletingId={deletingId}
                        onEdit={beginEdit}
                        onDelete={deletePosition}
                      />
                    </article>
                  ))}
                </div>

                <div className="hidden overflow-x-auto lg:block">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-7 py-4 font-semibold">美股</th>
                        <th className="px-5 py-4 text-right font-semibold">持有股數</th>
                        <th className="px-5 py-4 text-right font-semibold">投入成本</th>
                        <th className="px-7 py-4 text-right font-semibold">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {items.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50/70">
                          <td className="px-7 py-5">
                            <p className="font-bold text-slate-950">{item.stockName}</p>
                            <p className="mt-1 text-xs font-bold tracking-wide text-sky-700">
                              {item.stockCode}
                            </p>
                          </td>
                          <td className="px-5 py-5 text-right font-medium tabular-nums">
                            {shareFormatter.format(item.shares)}
                          </td>
                          <td className="px-5 py-5 text-right font-bold tabular-nums">
                            {usdFormatter.format(item.principal)}
                          </td>
                          <td className="px-7 py-5">
                            <PositionActions
                              item={item}
                              deletingId={deletingId}
                              onEdit={beginEdit}
                              onDelete={deletePosition}
                              compact
                            />
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

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-300 bg-white px-4 py-4 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 break-words text-lg font-bold tracking-tight tabular-nums">
        {value}
      </p>
    </div>
  );
}

function PositionActions({
  item,
  deletingId,
  onEdit,
  onDelete,
  compact = false,
}: {
  item: UsStockPosition;
  deletingId: string | null;
  onEdit: (item: UsStockPosition) => void;
  onDelete: (item: UsStockPosition) => Promise<void>;
  compact?: boolean;
}) {
  return (
    <div className={`flex gap-2 ${compact ? "justify-end" : "mt-4"}`}>
      <button
        type="button"
        onClick={() => onEdit(item)}
        className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-700 transition hover:bg-slate-100"
      >
        修改
      </button>
      <button
        type="button"
        disabled={deletingId === item.id}
        onClick={() => void onDelete(item)}
        className="min-h-10 rounded-lg border border-rose-200 px-3 py-2 text-sm font-bold text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {deletingId === item.id ? "刪除中…" : "刪除"}
      </button>
    </div>
  );
}
