import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { readAdminAccess } from "@/entities/session/api/read-admin-access";
import { adminNextPath } from "@/entities/session/model/admin-next-path";
import { readViewer } from "@/entities/session/model/viewer";
import { createRequestSupabase } from "@/shared/api/supabase/server";
import { AdminLoginPage } from "@/widgets/admin-login/ui/admin-login-page";

export const dynamic = "force-dynamic";

// 운영자 로그인 (admin-console INV-K13). 관리자 틀(운영자 판정 레이아웃) 밖에 있다 — 로그인하지 않은 사람이 보는 화면이라서.
// 이미 운영자로 로그인했으면 화면을 보이지 않고 돌아갈 관리자 주소로 보낸다. 팬·크리에이터로 로그인했으면 그대로 보인다(운영자로 다시 로그인할 수 있게).
// 검색엔진에 싣지 않는다.
export const metadata: Metadata = { title: "팬꾹 운영자 로그인", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const raw = (await searchParams).next;
  const next = typeof raw === "string" ? raw : undefined;
  const supabase = await createRequestSupabase();
  if ((await readViewer(supabase)) && (await readAdminAccess(supabase)) !== "not_found") redirect(adminNextPath(next));
  return <AdminLoginPage next={next} />;
}
