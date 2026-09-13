"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import { authClient } from "@/lib/auth-client";

type AuthFormProps = {
  mode: "login" | "register";
};

function translateAuthError(message?: string) {
  if (!message) return "操作失敗，請稍後再試";

  const normalized = message.toLowerCase();
  if (normalized.includes("invalid email or password")) {
    return "Email 或密碼不正確";
  }
  if (normalized.includes("already exists")) {
    return "此 Email 已經註冊";
  }
  if (normalized.includes("password")) {
    return "密碼需為 12 至 128 個字元";
  }
  if (normalized.includes("email")) {
    return "請輸入有效的 Email";
  }
  return message;
}

export function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const isRegister = mode === "register";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPending(true);

    const formData = new FormData(event.currentTarget);
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");

    try {
      const result = isRegister
        ? await authClient.signUp.email({
            name: String(formData.get("name") ?? "").trim(),
            email,
            password,
          })
        : await authClient.signIn.email({ email, password });

      if (result.error) {
        setError(translateAuthError(result.error.message));
        return;
      }

      router.push("/inventory");
      router.refresh();
    } catch {
      setError("目前無法連線登入系統，請稍後再試");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      {isRegister ? (
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-slate-200">
            顯示名稱
          </label>
          <input
            id="name"
            name="name"
            type="text"
            autoComplete="name"
            required
            maxLength={200}
            className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/15"
            placeholder="你的名稱"
          />
        </div>
      ) : null}

      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-200">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={320}
          className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/15"
          placeholder="name@example.com"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-200">
          密碼
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={isRegister ? "new-password" : "current-password"}
          required
          minLength={12}
          maxLength={128}
          className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-emerald-400/70 focus:ring-2 focus:ring-emerald-400/15"
          placeholder={isRegister ? "至少 12 個字元" : "輸入密碼"}
        />
        {isRegister ? (
          <p className="mt-2 text-xs text-slate-500">密碼長度需為 12 至 128 個字元。</p>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-rose-400/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-emerald-400 px-4 py-3 font-bold text-emerald-950 transition hover:bg-emerald-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "處理中…" : isRegister ? "建立帳號" : "登入"}
      </button>

      <p className="text-center text-sm text-slate-400">
        {isRegister ? "已經有帳號？" : "還沒有帳號？"}{" "}
        <Link
          href={isRegister ? "/login" : "/register"}
          className="font-semibold text-emerald-300 hover:text-emerald-200"
        >
          {isRegister ? "前往登入" : "立即註冊"}
        </Link>
      </p>
    </form>
  );
}
