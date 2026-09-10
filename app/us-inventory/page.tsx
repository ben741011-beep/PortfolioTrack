import { redirect } from "next/navigation";

export default function UsInventoryPage() {
  redirect("/inventory?market=us");
}
