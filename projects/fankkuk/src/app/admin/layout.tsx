import type { Metadata } from "next";
import type { ReactNode } from "react";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";
import { AdminShell } from "@/widgets/admin-shell/ui/admin-shell";

export const dynamic = "force-dynamic";

// 제목은 판정을 통과한 뒤에만 만든다 — 고정 metadata 는 404 응답에도 실려 관리자 화면이 있다는 것이 드러났다.
export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession();
  return { title: "팬꾹 관리자", robots: { index: false, follow: false } };
}

// 관리자 틀. 운영자가 아니면(손님 포함) 404 — 판정은 서버에서 DB 함수로 한다(admin-console INV-K1 S1c).
// 각 화면도 같은 판정을 다시 부른다(레이아웃과 화면은 따로 그려진다). 한 요청 안에서는 한 번만 묻는다.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const { nickname, access } = await loadAdminSession();
  return (
    <AdminShell nickname={nickname} access={access}>
      {children}
    </AdminShell>
  );
}
