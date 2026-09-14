import type { Metadata } from "next";

import { AuthForm } from "@/app/components/AuthForm";

export const metadata: Metadata = {
  title: "登入｜家庭資產簿",
  description: "登入家庭資產簿，管理自己與孩子的投資資料",
};

export default function LoginPage() {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#151515] px-4 py-12 text-white">
      <div aria-hidden="true" className="absolute -top-32 right-0 size-80 rounded-full bg-emerald-500/10 blur-3xl" />
      <section className="relative w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
        <span className="inline-flex rounded-full border border-emerald-400/25 bg-emerald-400/10 px-3 py-1 text-xs font-bold tracking-wide text-emerald-300">
          FAMILY PORTFOLIO
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">登入家庭資產簿</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          登入後即可查看你的台股、美股、交易與股息紀錄。
        </p>
        <AuthForm mode="login" />
      </section>
    </main>
  );
}
