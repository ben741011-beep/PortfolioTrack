import Link from "next/link";

export function SiteHeader() {
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

        <nav aria-label="主要導覽" className="flex shrink-0 items-center gap-1 text-sm">
          <Link
            href="/"
            className="rounded-lg px-3 py-2 font-medium text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            市場統計
          </Link>
          <Link
            href="/inventory"
            className="rounded-lg px-3 py-2 font-medium text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400"
          >
            庫存管理
          </Link>
        </nav>
      </div>
    </header>
  );
}
