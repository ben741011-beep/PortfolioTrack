"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";

import { readApiError } from "@/app/components/stock-ui";

type FamilyMember = {
  id: string;
  name: string;
  relationship: "self" | "child";
  birthDate: string | null;
};

export function FamilyMemberManager() {
  const [items, setItems] = useState<FamilyMember[]>([]);
  const [name, setName] = useState("");
  const [relationship, setRelationship] = useState<"self" | "child">("child");
  const [birthDate, setBirthDate] = useState("");
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch("/api/family-members", { cache: "no-store", signal });
    if (!response.ok) throw new Error(await readApiError(response));
    const body = (await response.json()) as { items: FamilyMember[] };
    setItems(body.items);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => {
      void load(controller.signal).catch((error) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setMessage(error instanceof Error ? error.message : "讀取家庭成員失敗");
        }
      });
    });
    return () => controller.abort();
  }, [load]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/family-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, relationship, birthDate: birthDate || null }),
      });
      if (!response.ok) throw new Error(await readApiError(response));
      const created = (await response.json()) as FamilyMember;
      await fetch("/api/family-members/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyMemberId: created.id }),
      });
      setName("");
      setBirthDate("");
      setRelationship("child");
      setMessage("家庭成員已建立");
      await load();
      window.location.reload();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "新增家庭成員失敗");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <main className="flex-1 bg-slate-100 px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1fr_360px]">
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-bold tracking-[0.16em] text-emerald-700">家庭資產</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">家庭成員</h1>
          <p className="mt-2 text-sm text-slate-600">每位成員的台股、美股、交易與股息皆分開計算。</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {items.map((member) => (
              <article key={member.id} className="rounded-xl border border-slate-200 p-4">
                <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-700">
                  {member.relationship === "self" ? "本人" : "孩子"}
                </span>
                <h2 className="mt-3 text-lg font-bold text-slate-950">{member.name}</h2>
                <p className="mt-1 text-sm text-slate-500">{member.birthDate ? `出生日期 ${member.birthDate}` : "未設定出生日期"}</p>
              </article>
            ))}
            {items.length === 0 ? <p className="text-sm text-slate-500">尚未建立資產檔案。</p> : null}
          </div>
        </section>

        <form onSubmit={handleSubmit} className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">新增家庭成員</h2>
          <label className="mt-5 block text-sm font-semibold text-slate-700">姓名
            <input value={name} onChange={(event) => setName(event.target.value)} required maxLength={40} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="mt-4 block text-sm font-semibold text-slate-700">身分
            <select value={relationship} onChange={(event) => setRelationship(event.target.value as "self" | "child")} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2">
              {!items.some((item) => item.relationship === "self") ? <option value="self">本人</option> : null}
              <option value="child">孩子</option>
            </select>
          </label>
          <label className="mt-4 block text-sm font-semibold text-slate-700">出生日期（選填）
            <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <button disabled={isSaving} className="mt-5 w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-bold text-white hover:bg-emerald-500 disabled:opacity-60">
            {isSaving ? "建立中…" : "建立資產檔案"}
          </button>
          {message ? <p className="mt-3 text-sm text-slate-600">{message}</p> : null}
        </form>
      </div>
    </main>
  );
}
