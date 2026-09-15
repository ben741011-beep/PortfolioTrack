"use client";

import { FormEvent, useEffect, useState } from "react";

import {
  assetTypeLabels,
  currencyFormatter,
  numberFormatter,
  readApiError,
  type StockAssetType,
  type StockPosition,
} from "@/app/components/stock-ui";
import { UsStockInitialPositionForm } from "@/app/components/UsStockInitialPositionForm";

type Message = {
  text: string;
  type: "success" | "error";
};

type StockLookup = {
  stockCode: string;
  stockName: string;
  market?: "TWSE" | "TPEx";
  assetType: StockAssetType;
};

type StockTransactionResponse = {
  item: Pick<StockPosition, "shares"> | null;
  transaction: {
    stockCode: string;
    side: "buy" | "sell";
    assetType: StockAssetType;
    shares: number;
    price: number;
    grossAmount: number;
    transactionFee: number;
    transactionTax?: number;
    secFee?: number;
    tafFee?: number;
    cashAmount: number;
    costBasisReduction: number;
    realizedProfitLoss: number;
  };
};

type CompletedStockTransaction = StockTransactionResponse & {
  market: "taiwan" | "us";
};

const inputClassName =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100";

const usdCurrencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const shareFormatter = new Intl.NumberFormat("zh-TW", {
  maximumFractionDigits: 6,
});

function formatTradeCurrency(value: number, market: "taiwan" | "us") {
  return market === "taiwan"
    ? currencyFormatter.format(value)
    : usdCurrencyFormatter.format(value);
}

function MessageText({ message }: { message: Message | null }) {
  return (
    <p
      aria-live="polite"
      className={`min-h-5 text-sm ${
        message?.type === "error" ? "text-rose-700" : "text-emerald-700"
      }`}
    >
      {message?.text}
    </p>
  );
}

export function StockOperations() {
  const [operationMode, setOperationMode] = useState<"trade" | "initial">(
    "trade",
  );
  const [initialMarket, setInitialMarket] = useState<"taiwan" | "us">(
    "taiwan",
  );
  const [initialStockCode, setInitialStockCode] = useState("");
  const [initialLookup, setInitialLookup] = useState<StockLookup | null>(null);
  const [initialShares, setInitialShares] = useState("");
  const [initialPrincipal, setInitialPrincipal] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [initialMessage, setInitialMessage] = useState<Message | null>(null);

  const [tradeMarket, setTradeMarket] = useState<"taiwan" | "us">("taiwan");
  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");
  const [tradeStockCode, setTradeStockCode] = useState("");
  const [tradeLookup, setTradeLookup] = useState<StockLookup | null>(null);
  const [tradeLookupError, setTradeLookupError] = useState("");
  const [isTradeLookingUp, setIsTradeLookingUp] = useState(false);
  const [tradeShares, setTradeShares] = useState("");
  const [tradePrice, setTradePrice] = useState("");
  const [isTrading, setIsTrading] = useState(false);
  const [tradeMessage, setTradeMessage] = useState<Message | null>(null);
  const [lastTransaction, setLastTransaction] =
    useState<CompletedStockTransaction | null>(null);

  useEffect(() => {
    const normalizedCode = tradeStockCode.trim().toUpperCase();

    const minimumCodeLength = tradeMarket === "taiwan" ? 4 : 1;

    if (normalizedCode.length < minimumCodeLength) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setIsTradeLookingUp(true);
      setTradeLookup(null);
      setTradeLookupError("");

      try {
        const endpoint =
          tradeMarket === "taiwan"
            ? "/api/stocks/name"
            : "/api/us-stocks/profile";
        const response = await fetch(
          `${endpoint}?code=${encodeURIComponent(normalizedCode)}`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error(await readApiError(response));
        }

        const body = (await response.json()) as StockLookup;
        setTradeLookup(body);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setTradeLookupError(
          error instanceof Error
            ? error.message
            : `查詢${tradeMarket === "taiwan" ? "台股" : "美股"}名稱失敗`,
        );
      } finally {
        if (!controller.signal.aborted) {
          setIsTradeLookingUp(false);
        }
      }
    }, 500);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [tradeMarket, tradeStockCode]);

  async function lookupInitialStock() {
    const normalizedCode = initialStockCode.trim().toUpperCase();

    if (!normalizedCode) {
      setInitialMessage({ text: "請先輸入股票代號", type: "error" });
      return;
    }

    setIsLookingUp(true);
    setInitialMessage(null);

    try {
      const response = await fetch(
        `/api/stocks/name?code=${encodeURIComponent(normalizedCode)}`,
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const body = (await response.json()) as StockLookup;
      setInitialStockCode(body.stockCode);
      setInitialLookup(body);
      setInitialMessage({
        text: `已查到 ${body.stockCode} ${body.stockName}`,
        type: "success",
      });
    } catch (error) {
      setInitialLookup(null);
      setInitialMessage({
        text: error instanceof Error ? error.message : "查詢股票名稱失敗",
        type: "error",
      });
    } finally {
      setIsLookingUp(false);
    }
  }

  async function createInitialPosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsCreating(true);
    setInitialMessage(null);

    try {
      const response = await fetch("/api/stock-positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockCode: initialStockCode,
          shares: initialShares,
          principal: initialPrincipal,
        }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const created = (await response.json()) as StockPosition;
      setInitialStockCode("");
      setInitialLookup(null);
      setInitialShares("");
      setInitialPrincipal("");
      setInitialMessage({
        text: `已建立 ${created.stockCode} ${created.stockName} 的初始庫存`,
        type: "success",
      });
    } catch (error) {
      setInitialMessage({
        text: error instanceof Error ? error.message : "新增股票庫存失敗",
        type: "error",
      });
    } finally {
      setIsCreating(false);
    }
  }

  async function submitTrade(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!tradeLookup) {
      setTradeMessage({ text: "請先確認股票代號與名稱", type: "error" });
      return;
    }

    setIsTrading(true);
    setTradeMessage(null);
    setLastTransaction(null);

    try {
      const response = await fetch(
        tradeMarket === "taiwan"
          ? "/api/stock-transactions"
          : "/api/us-stock-transactions",
        {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockCode: tradeStockCode,
          side: tradeSide,
          shares: tradeShares,
          price: tradePrice,
        }),
        },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const body = (await response.json()) as StockTransactionResponse;
      setLastTransaction({ ...body, market: tradeMarket });
      setTradeStockCode("");
      setTradeLookup(null);
      setTradeShares("");
      setTradePrice("");
      setTradeMessage({
        text: `${body.transaction.stockCode} 已完成${tradeSide === "buy" ? "買入" : "賣出"}`,
        type: "success",
      });
    } catch (error) {
      setTradeMessage({
        text:
          error instanceof Error
            ? error.message
            : `${tradeMarket === "taiwan" ? "台股" : "美股"}交易失敗`,
        type: "error",
      });
    } finally {
      setIsTrading(false);
    }
  }

  return (
    <main className="flex-1 bg-slate-100 px-4 py-8 text-slate-950 sm:px-6 sm:py-12 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 border-b border-slate-300 pb-8">
          <p className="mb-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold tracking-[0.16em] text-emerald-800">
            庫存異動
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            新增庫存與股票買賣
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            初始庫存用來建立目前持股；後續買入與賣出則會依成交價自動整合庫存成本。
          </p>
        </header>

        <fieldset className="mb-8">
          <legend className="mb-2 text-sm font-semibold">選擇操作</legend>
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-200/70 p-1.5">
            {(
              [
                { label: "買賣", value: "trade" },
                { label: "新增庫存", value: "initial" },
              ] as const
            ).map((mode) => (
              <label key={mode.value} className="cursor-pointer">
                <input
                  type="radio"
                  name="operationMode"
                  value={mode.value}
                  checked={operationMode === mode.value}
                  onChange={() => setOperationMode(mode.value)}
                  className="peer sr-only"
                />
                <span className="block rounded-lg px-4 py-3 text-center text-sm font-bold text-slate-600 transition peer-checked:bg-white peer-checked:text-slate-950 peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-600">
                  {mode.label}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div>
          {operationMode === "initial" ? (
          <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6">
              <p className="text-xs font-bold tracking-[0.14em] text-emerald-700">
                INITIAL POSITION
              </p>
              <h2 className="mt-2 text-xl font-bold">建立初始庫存</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                適合第一次匯入現有持股。相同股票代號不可重複建立。
              </p>
            </div>

            <fieldset className="mb-6">
              <legend className="mb-2 text-sm font-semibold">市場分類</legend>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1.5">
                {(
                  [
                    { label: "台股", value: "taiwan" },
                    { label: "美股", value: "us" },
                  ] as const
                ).map((market) => (
                  <label key={market.value} className="cursor-pointer">
                    <input
                      type="radio"
                      name="initialMarket"
                      value={market.value}
                      checked={initialMarket === market.value}
                      onChange={() => {
                        setInitialMarket(market.value);
                        setInitialMessage(null);
                      }}
                      className="peer sr-only"
                    />
                    <span className="block rounded-lg px-4 py-2.5 text-center text-sm font-bold text-slate-600 transition peer-checked:bg-white peer-checked:text-slate-950 peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-600">
                      {market.label}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            {initialMarket === "taiwan" ? (
            <form onSubmit={createInitialPosition} className="space-y-5">
              <div>
                <label
                  htmlFor="initialStockCode"
                  className="mb-2 block text-sm font-semibold"
                >
                  股票代號
                </label>
                <div className="flex flex-col gap-2 min-[400px]:flex-row">
                  <input
                    id="initialStockCode"
                    name="initialStockCode"
                    value={initialStockCode}
                    onChange={(event) => {
                      setInitialStockCode(event.target.value.toUpperCase());
                      setInitialLookup(null);
                    }}
                    placeholder="例如：2330"
                    autoComplete="off"
                    required
                    className={inputClassName}
                  />
                  <button
                    type="button"
                    onClick={() => void lookupInitialStock()}
                    disabled={isLookingUp}
                    className="w-full shrink-0 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 min-[400px]:w-auto"
                  >
                    {isLookingUp ? "查詢中…" : "查名稱"}
                  </button>
                </div>
                <p className="mt-2 min-h-5 text-sm font-medium text-emerald-700">
                  {initialLookup
                    ? `${initialLookup.stockName} · ${
                        initialLookup.market === "TWSE" ? "上市" : "上櫃"
                      } · ${assetTypeLabels[initialLookup.assetType]}`
                    : "股票名稱與類型由官方資料取得"}
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="initialShares"
                    className="mb-2 block text-sm font-semibold"
                  >
                    目前股數
                  </label>
                  <input
                    id="initialShares"
                    name="initialShares"
                    type="number"
                    min="1"
                    step="1"
                    inputMode="numeric"
                    value={initialShares}
                    onChange={(event) => setInitialShares(event.target.value)}
                    placeholder="例如：1000"
                    required
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label
                    htmlFor="initialPrincipal"
                    className="mb-2 block text-sm font-semibold"
                  >
                    目前投入成本（TWD）
                  </label>
                  <input
                    id="initialPrincipal"
                    name="initialPrincipal"
                    type="number"
                    min="0.01"
                    step="any"
                    inputMode="decimal"
                    value={initialPrincipal}
                    onChange={(event) => setInitialPrincipal(event.target.value)}
                    placeholder="例如：850000"
                    required
                    className={inputClassName}
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <MessageText message={initialMessage} />
                <button
                  type="submit"
                  disabled={isCreating}
                  className="mt-3 w-full rounded-xl bg-slate-950 px-6 py-3 text-sm font-bold text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isCreating ? "建立中…" : "建立初始庫存"}
                </button>
              </div>
            </form>
            ) : (
              <UsStockInitialPositionForm />
            )}
          </section>
          ) : (
          <section className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6">
              <p className="text-xs font-bold tracking-[0.14em] text-emerald-700">
                STOCK TRADE
              </p>
              <h2 className="mt-2 text-xl font-bold">買入／賣出</h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                {tradeMarket === "taiwan"
                  ? "手續費與交易稅由伺服器自動計算，成交後直接更新目前庫存。"
                  : "買進與賣出皆只計 0.2% 手續費，成交後直接更新美元庫存成本。"}
              </p>
            </div>

            <form onSubmit={submitTrade} className="space-y-5">
              <fieldset>
                <legend className="mb-2 text-sm font-semibold">交易市場</legend>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1.5">
                  {(
                    [
                      { label: "台股", value: "taiwan" },
                      { label: "美股", value: "us" },
                    ] as const
                  ).map((market) => (
                    <label key={market.value} className="cursor-pointer">
                      <input
                        type="radio"
                        name="tradeMarket"
                        value={market.value}
                        checked={tradeMarket === market.value}
                        onChange={() => {
                          setTradeMarket(market.value);
                          setTradeStockCode("");
                          setTradeLookup(null);
                          setTradeLookupError("");
                          setIsTradeLookingUp(false);
                          setTradeShares("");
                          setTradePrice("");
                          setTradeMessage(null);
                          setLastTransaction(null);
                        }}
                        className="peer sr-only"
                      />
                      <span className="block rounded-lg px-4 py-2.5 text-center text-sm font-bold text-slate-600 transition peer-checked:bg-white peer-checked:text-slate-950 peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-600">
                        {market.label}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="mb-2 text-sm font-semibold">交易方向</legend>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1.5">
                  {(["buy", "sell"] as const).map((side) => (
                    <label key={side} className="cursor-pointer">
                      <input
                        type="radio"
                        name="tradeSide"
                        value={side}
                        checked={tradeSide === side}
                        onChange={() => {
                          setTradeSide(side);
                          setTradeMessage(null);
                          setLastTransaction(null);
                        }}
                        className="peer sr-only"
                      />
                      <span className="block rounded-lg px-4 py-2.5 text-center text-sm font-bold text-slate-600 transition peer-checked:bg-white peer-checked:text-slate-950 peer-checked:shadow-sm peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-emerald-600">
                        {side === "buy" ? "買入" : "賣出"}
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <div>
                <label
                  htmlFor="tradeStockCode"
                  className="mb-2 block text-sm font-semibold"
                >
                  股票代號
                </label>
                <input
                  id="tradeStockCode"
                  name="tradeStockCode"
                  value={tradeStockCode}
                  onChange={(event) => {
                    setTradeStockCode(event.target.value.toUpperCase());
                    setTradeLookup(null);
                    setTradeLookupError("");
                    setIsTradeLookingUp(false);
                    setTradeMessage(null);
                    setLastTransaction(null);
                  }}
                  placeholder={tradeMarket === "taiwan" ? "例如：2330" : "例如：AAPL"}
                  autoComplete="off"
                  required
                  className={inputClassName}
                />
                <p
                  aria-live="polite"
                  className={`mt-2 min-h-5 text-sm font-medium ${
                    tradeLookupError ? "text-rose-700" : "text-emerald-700"
                  }`}
                >
                  {isTradeLookingUp
                    ? "正在查詢股票名稱…"
                    : tradeLookup
                      ? `${tradeLookup.stockCode} ${tradeLookup.stockName}${
                          tradeMarket === "taiwan"
                            ? ` · ${tradeLookup.market === "TWSE" ? "上市" : "上櫃"} · ${assetTypeLabels[tradeLookup.assetType]}`
                            : ""
                        }`
                      : tradeLookupError ||
                        `輸入完成後會自動顯示${tradeMarket === "taiwan" ? "台股" : "美股"}名稱`}
                </p>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="tradeShares"
                    className="mb-2 block text-sm font-semibold"
                  >
                    交易股數
                  </label>
                  <input
                    id="tradeShares"
                    name="tradeShares"
                    type="number"
                    min={tradeMarket === "taiwan" ? "1" : "0.000001"}
                    step={tradeMarket === "taiwan" ? "1" : "any"}
                    inputMode={tradeMarket === "taiwan" ? "numeric" : "decimal"}
                    value={tradeShares}
                    onChange={(event) => setTradeShares(event.target.value)}
                    placeholder={tradeMarket === "taiwan" ? "例如：100" : "例如：1.5"}
                    required
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label
                    htmlFor="tradePrice"
                    className="mb-2 block text-sm font-semibold"
                  >
                    每股成交價（{tradeMarket === "taiwan" ? "TWD" : "USD"}）
                  </label>
                  <input
                    id="tradePrice"
                    name="tradePrice"
                    type="number"
                    min="0.01"
                    step="any"
                    inputMode="decimal"
                    value={tradePrice}
                    onChange={(event) => setTradePrice(event.target.value)}
                    placeholder={tradeMarket === "taiwan" ? "例如：1200" : "例如：230.50"}
                    required
                    className={inputClassName}
                  />
                </div>
              </div>

              <div className="border-t border-slate-100 pt-5">
                <MessageText message={tradeMessage} />
                <button
                  type="submit"
                  disabled={isTrading || isTradeLookingUp || !tradeLookup}
                  className={`mt-3 w-full rounded-xl px-6 py-3 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    tradeSide === "buy"
                      ? "bg-emerald-700 hover:bg-emerald-800"
                      : "bg-rose-700 hover:bg-rose-800"
                  }`}
                >
                  {isTrading
                    ? "處理中…"
                    : tradeSide === "buy"
                      ? "確認買入"
                      : "確認賣出"}
                </button>
              </div>
            </form>

            {lastTransaction ? (
              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <h3 className="text-sm font-bold text-emerald-900">交易結果</h3>
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-emerald-800/70">成交金額</dt>
                    <dd className="mt-1 font-bold tabular-nums text-emerald-950">
                      {formatTradeCurrency(
                        lastTransaction.transaction.grossAmount,
                        lastTransaction.market,
                      )}
                    </dd>
                  </div>
                  <div className="text-right">
                    <dt className="text-xs text-emerald-800/70">交易手續費</dt>
                    <dd className="mt-1 font-bold tabular-nums text-emerald-950">
                      {formatTradeCurrency(
                        lastTransaction.transaction.transactionFee,
                        lastTransaction.market,
                      )}
                    </dd>
                  </div>
                  {lastTransaction.market === "taiwan" ? (
                    <div>
                      <dt className="text-xs text-emerald-800/70">交易稅</dt>
                      <dd className="mt-1 font-bold tabular-nums text-emerald-950">
                        {formatTradeCurrency(
                          lastTransaction.transaction.transactionTax ?? 0,
                          lastTransaction.market,
                        )}
                      </dd>
                    </div>
                  ) : null}
                  <div className="text-right">
                    <dt className="text-xs text-emerald-800/70">現金流金額</dt>
                    <dd className="mt-1 font-bold tabular-nums text-emerald-950">
                      {formatTradeCurrency(
                        lastTransaction.transaction.cashAmount,
                        lastTransaction.market,
                      )}
                    </dd>
                  </div>
                  {lastTransaction.transaction.side === "sell" ? (
                    <div>
                      <dt className="text-xs text-emerald-800/70">已實現損益</dt>
                      <dd className="mt-1 font-bold tabular-nums text-emerald-950">
                        {formatTradeCurrency(
                          lastTransaction.transaction.realizedProfitLoss,
                          lastTransaction.market,
                        )}
                      </dd>
                    </div>
                  ) : null}
                  <div className="text-right">
                    <dt className="text-xs text-emerald-800/70">交易後庫存</dt>
                    <dd className="mt-1 font-bold tabular-nums text-emerald-950">
                      {lastTransaction.item
                        ? `${
                            lastTransaction.market === "taiwan"
                              ? numberFormatter.format(lastTransaction.item.shares)
                              : shareFormatter.format(lastTransaction.item.shares)
                          } 股`
                        : "已全部售出"}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </section>
          )}
        </div>
      </div>
    </main>
  );
}
