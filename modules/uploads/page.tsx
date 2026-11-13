import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";

export default async function UploadsPage() {
  await requireAdmin("media:manage");
  redirect("/admin/modules/media?folder=Clients");
}
