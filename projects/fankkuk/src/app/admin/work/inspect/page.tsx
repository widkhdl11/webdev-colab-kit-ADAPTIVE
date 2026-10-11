import type { Metadata } from "next";
import Link from "next/link";
import { InspectWorkbench } from "@/features/office-inspect/ui/inspect-workbench";
import a from "@/shared/ui/admin.module.css";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "검수 · 팬꾹 관리자" };
}

// 검수 작업 화면 (office-workflow INV-W1·W4). 운영자가 아니면 404.
export default async function Page() {
  const { nickname } = await loadAdminSession();
  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1>검수</h1>
          <p>라벨 QR 로 상자를 불러와 검수 결과를 기록해요. 기록이 있어야만 다음 단계로 넘어가요.</p>
        </div>
        <Link className={`${a.btn} ${a.btnLine}`} href="/admin/work/inspection-card">
          검수 완료 카드 인쇄
        </Link>
      </div>
      <InspectWorkbench operatorNickname={nickname} />
    </>
  );
}
