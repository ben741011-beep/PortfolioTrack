"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";
import { FamilyMemberSwitcher } from "@/app/components/FamilyMemberSwitcher";

const navigationItems = [
  { href: "/", label: "市場統計", compactLabel: "統計" },
  { href: "/inventory", label: "庫存管理", compactLabel: "庫存" },
  { href: "/transactions", label: "交易管理", compactLabel: "交易" },
  { href: "/dividends", label: "股息紀錄", compactLabel: "股息" },
  { href: "/family", label: "家庭成員", compactLabel: "家庭" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session, isPending } = authClient.useSession();

  async function handleLogout() {
    await authClient.signOut();
    router.push("/");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 text-white shadow-sm backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex min-h-16 items-center justify-between gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-sm font-bold tracking-wide text-emerald-300">
            PT
          </span>
          <span className="hidden min-w-0 min-[430px]:block">
            <span className="block truncate text-base font-bold tracking-wide">
              家庭資產簿
            </span>
            <span className="hidden text-xs text-slate-400 sm:block">
              親子投資資產管理
            </span>
          </span>
          </Link>

          <div className="flex shrink-0 items-center gap-2">
            {!isPending && session ? (
              <>
                <FamilyMemberSwitcher />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="rounded-lg border border-white/10 px-2 py-2 text-xs font-semibold text-slate-300 transition hover:border-rose-300/30 hover:bg-rose-400/10 hover:text-rose-200 sm:px-3 sm:text-sm"
                >
                  登出
                </button>
              </>
            ) : !isPending ? (
              <Link href="/login" className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-emerald-950 transition hover:bg-emerald-300 sm:text-sm">
                登入
              </Link>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <nav
            aria-label="主要導覽"
            className="flex min-w-max items-center gap-1 pb-2 text-xs sm:text-sm"
          >
            {navigationItems
              .filter((item) => item.href === "/" || Boolean(session))
              .map((item) => {
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
      </div>
    </header>
  );
}
