import type { Metadata } from "next";

import { AuthForm } from "@/app/components/AuthForm";

export const metadata: Metadata = {
  title: "建立帳號｜家庭資產簿",
  description: "建立家庭資產簿帳號，管理自己與孩子的投資資料",
};

export default function RegisterPage() {
  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-[#151515] px-4 py-12 text-white">
      <div aria-hidden="true" className="absolute -top-32 left-0 size-80 rounded-full bg-sky-500/10 blur-3xl" />
      <section className="relative w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/80 p-6 shadow-2xl shadow-black/30 backdrop-blur sm:p-8">
        <span className="inline-flex rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 text-xs font-bold tracking-wide text-sky-300">
          CREATE ACCOUNT
        </span>
        <h1 className="mt-5 text-2xl font-bold tracking-tight">建立你的投資帳號</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          每個帳號的庫存、交易與股息資料都會分開保存。
        </p>
        <AuthForm mode="register" />
      </section>
    </main>
  );
}
