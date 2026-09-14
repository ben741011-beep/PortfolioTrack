"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type FamilyMember = {
  id: string;
  name: string;
  relationship: "self" | "child";
};

type FamilyMembersResponse = {
  items: FamilyMember[];
  activeFamilyMemberId: string | null;
};

export function FamilyMemberSwitcher() {
  const router = useRouter();
  const [data, setData] = useState<FamilyMembersResponse | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/family-members", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (body && !controller.signal.aborted) setData(body as FamilyMembersResponse);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  async function handleChange(familyMemberId: string) {
    setIsSwitching(true);
    try {
      const response = await fetch("/api/family-members/active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ familyMemberId }),
      });
      if (response.ok) {
        setData((current) => current ? { ...current, activeFamilyMemberId: familyMemberId } : current);
        router.refresh();
        window.location.reload();
      }
    } finally {
      setIsSwitching(false);
    }
  }

  if (!data) return null;
  if (data.items.length === 0) {
    return (
      <Link href="/family" className="rounded-lg bg-amber-300 px-3 py-2 text-xs font-bold text-amber-950">
        建立資產檔案
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <label className="sr-only" htmlFor="family-member-switcher">目前家庭成員</label>
      <select
        id="family-member-switcher"
        value={data.activeFamilyMemberId ?? data.items[0]?.id}
        disabled={isSwitching}
        onChange={(event) => void handleChange(event.target.value)}
        className="max-w-32 rounded-lg border border-white/15 bg-slate-900 px-2 py-2 text-xs font-semibold text-white sm:max-w-44"
      >
        {data.items.map((member) => (
          <option key={member.id} value={member.id}>
            {member.relationship === "self" ? "本人｜" : "孩子｜"}{member.name}
          </option>
        ))}
      </select>
      <Link href="/family" className="hidden text-xs font-semibold text-emerald-300 hover:text-emerald-200 sm:inline">
        管理
      </Link>
    </div>
  );
}
