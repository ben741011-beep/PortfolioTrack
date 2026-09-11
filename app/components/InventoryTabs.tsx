"use client";

import Link from "next/link";
import { useCallback, useState } from "react";

import {
  type DisplayExchangeRate,
  PortfolioTotalSummary,
} from "@/app/components/PortfolioTotalSummary";
import { StockInventory } from "@/app/components/StockInventory";
import { UsStockInventory } from "@/app/components/UsStockInventory";

export type InventoryMarket = "tw" | "us";

export function InventoryTabs({ market }: { market: InventoryMarket }) {
  const [exchangeRate, setExchangeRate] = useState<DisplayExchangeRate | null>(
    null,
  );
  const [closingPriceVersion, setClosingPriceVersion] = useState(0);
  const handleExchangeRateChange = useCallback(
    (nextExchangeRate: DisplayExchangeRate) => {
      setExchangeRate(nextExchangeRate);
    },
    [],
  );
  const handleClosingPricesUpdated = useCallback(() => {
    setClosingPriceVersion((version) => version + 1);
  }, []);
  const tabs = [
    { market: "tw", href: "/inventory", label: "台股庫存" },
    { market: "us", href: "/inventory?market=us", label: "美股庫存" },
  ] as const;

  return (
    <>
      <PortfolioTotalSummary
        onExchangeRateChange={handleExchangeRateChange}
        refreshToken={closingPriceVersion}
      />
      <div className="border-b border-slate-300 bg-slate-100 px-4 pt-6 sm:px-6 lg:px-8">
        <nav
          aria-label="庫存市場切換"
          className="mx-auto flex max-w-7xl gap-2"
        >
          {tabs.map((tab) => {
            const isActive = market === tab.market;

            return (
              <Link
                key={tab.market}
                href={tab.href}
                aria-current={isActive ? "page" : undefined}
                className={`rounded-t-xl border border-b-0 px-5 py-3 text-sm font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
                  isActive
                    ? "border-slate-300 bg-white text-slate-950"
                    : "border-transparent bg-slate-200/70 text-slate-600 hover:bg-slate-200 hover:text-slate-950"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
      </div>
      {market === "us" ? (
        <UsStockInventory
          exchangeRate={exchangeRate}
          onClosingPricesUpdated={handleClosingPricesUpdated}
        />
      ) : (
        <StockInventory
          onClosingPricesUpdated={handleClosingPricesUpdated}
        />
      )}
    </>
  );
}
