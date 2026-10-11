import type { Metadata } from "next";
import { InspectionCardSheet } from "@/features/office-inspect/ui/inspection-card-sheet";
import a from "@/shared/ui/admin.module.css";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "검수 완료 카드 · 팬꾹 관리자" };
}

// 상자 속 검수 완료 카드 인쇄 (추가분 F-8). 운영자가 아니면 404.
// 카드에 주문 정보가 없어 DB 를 읽지 않는다 — 날짜와 장수만 골라 인쇄한다.
export default async function Page() {
  await loadAdminSession();
  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1>검수 완료 카드</h1>
          <p>검수를 통과한 상자에 한 장씩 넣어요. 카드에는 로고와 검수일만 찍혀요.</p>
        </div>
      </div>
      <InspectionCardSheet />
    </>
  );
}
