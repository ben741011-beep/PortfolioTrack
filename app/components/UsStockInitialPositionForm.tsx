"use client";

import { FormEvent, useState } from "react";

import {
  assetTypeLabels,
  readApiError,
  type StockAssetType,
} from "@/app/components/stock-ui";

type Message = {
  text: string;
  type: "success" | "error";
};

type UsStockProfile = {
  stockCode: string;
  stockName: string;
  assetType: StockAssetType;
};

type CreateUsStockPositionResponse = {
  item: UsStockProfile;
  insertedCount: number;
};

const inputClassName =
  "w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-sky-600 focus:ring-4 focus:ring-sky-100";

export function UsStockInitialPositionForm() {
  const [stockCode, setStockCode] = useState("");
  const [profile, setProfile] = useState<UsStockProfile | null>(null);
  const [shares, setShares] = useState("");
  const [principal, setPrincipal] = useState("");
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function lookupStock() {
    const normalizedCode = stockCode.trim().toUpperCase();

    if (!normalizedCode) {
      setMessage({ text: "請先輸入美股代號", type: "error" });
      return;
    }

    setIsLookingUp(true);
    setMessage(null);

    try {
      const response = await fetch(
        `/api/us-stocks/profile?code=${encodeURIComponent(normalizedCode)}`,
        { cache: "no-store" },
      );

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const body = (await response.json()) as UsStockProfile;
      setStockCode(body.stockCode);
      setProfile(body);
      setMessage({
        text: `已查到 ${body.stockCode} ${body.stockName}`,
        type: "success",
      });
    } catch (error) {
      setProfile(null);
      setMessage({
        text: error instanceof Error ? error.message : "查詢美股名稱失敗",
        type: "error",
      });
    } finally {
      setIsLookingUp(false);
    }
  }

  async function createPosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!profile || profile.stockCode !== stockCode.trim().toUpperCase()) {
      setMessage({ text: "請先確認美股代號與名稱", type: "error" });
      return;
    }

    setIsCreating(true);
    setMessage(null);

    try {
      const response = await fetch("/api/us-stock-positions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockCode, shares, principal }),
      });

      if (!response.ok) {
        throw new Error(await readApiError(response));
      }

      const body = (await response.json()) as CreateUsStockPositionResponse;
      setStockCode("");
      setProfile(null);
      setShares("");
      setPrincipal("");
      setMessage({
        text: `已建立 ${body.item.stockCode} ${body.item.stockName} 的初始庫存`,
        type: "success",
      });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "新增美股庫存失敗",
        type: "error",
      });
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <form onSubmit={createPosition} className="space-y-5">
      <div>
        <label
          htmlFor="initialUsStockCode"
          className="mb-2 block text-sm font-semibold"
        >
          美股代號
        </label>
        <div className="flex flex-col gap-2 min-[400px]:flex-row">
          <input
            id="initialUsStockCode"
            name="initialUsStockCode"
            value={stockCode}
            onChange={(event) => {
              setStockCode(event.target.value.toUpperCase().trim());
              setProfile(null);
              setMessage(null);
            }}
            placeholder="例如：AAPL"
            autoComplete="off"
            required
            className={inputClassName}
          />
          <button
            type="button"
            onClick={() => void lookupStock()}
            disabled={isLookingUp}
            className="w-full shrink-0 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 min-[400px]:w-auto"
          >
            {isLookingUp ? "查詢中…" : "查名稱"}
          </button>
        </div>
        <p className="mt-2 min-h-5 text-sm font-medium text-sky-700">
          {profile
            ? `${profile.stockName} · ${assetTypeLabels[profile.assetType]}`
            : "股票名稱與類型由 Yahoo Finance 資料取得"}
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label
            htmlFor="initialUsShares"
            className="mb-2 block text-sm font-semibold"
          >
            目前股數
          </label>
          <input
            id="initialUsShares"
            name="initialUsShares"
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
          <label
            htmlFor="initialUsPrincipal"
            className="mb-2 block text-sm font-semibold"
          >
            目前投入成本（USD）
          </label>
          <input
            id="initialUsPrincipal"
            name="initialUsPrincipal"
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
          className={`min-h-5 text-sm ${
            message?.type === "error" ? "text-rose-700" : "text-emerald-700"
          }`}
        >
          {message?.text}
        </p>
        <button
          type="submit"
          disabled={isCreating || isLookingUp || !profile}
          className="mt-3 w-full rounded-xl bg-slate-950 px-6 py-3 text-sm font-bold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreating ? "建立中…" : "建立美股初始庫存"}
        </button>
      </div>
    </form>
  );
}
