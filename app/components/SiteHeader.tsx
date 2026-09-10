"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  { href: "/", label: "市場統計", compactLabel: "統計" },
  { href: "/inventory", label: "庫存管理", compactLabel: "庫存" },
  { href: "/us-inventory", label: "美股庫存", compactLabel: "美股" },
  { href: "/transactions", label: "新增與買賣", compactLabel: "買賣" },
  { href: "/dividends", label: "股息紀錄", compactLabel: "股息" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 text-white shadow-sm backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-sm font-bold tracking-wide text-emerald-300">
            PT
          </span>
          <span className="hidden min-w-0 min-[430px]:block">
            <span className="block truncate text-base font-bold tracking-wide">
              PortfolioTrack
            </span>
            <span className="hidden text-xs text-slate-400 sm:block">
              股票統計與庫存管理
            </span>
          </span>
        </Link>

        <nav aria-label="主要導覽" className="flex shrink-0 items-center gap-0.5 text-xs sm:gap-1 sm:text-sm">
          {navigationItems.map((item) => {
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`rounded-lg px-2 py-2 font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 sm:px-3 ${
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`}
              >
                <span className="sm:hidden">{item.compactLabel}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
