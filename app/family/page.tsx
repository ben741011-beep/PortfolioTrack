import type { Metadata } from "next";

import { FamilyMemberManager } from "@/app/components/FamilyMemberManager";

export const metadata: Metadata = {
  title: "家庭成員｜家庭資產簿",
  description: "管理自己與孩子的資產檔案",
};

export default function FamilyPage() {
  return <FamilyMemberManager />;
}
