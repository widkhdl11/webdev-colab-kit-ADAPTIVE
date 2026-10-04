import type { Metadata } from "next";
import { OutboundWorkbench } from "@/features/office-outbound/ui/outbound-workbench";
import a from "@/shared/ui/admin.module.css";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "출고 · 팬꾹 관리자" };
}

// 출고 작업 화면 (office-workflow INV-W1·W3·W8). 송장 출력 버튼은 대표에게만 보인다 — 판정은 서버·DB 가 다시 한다.
export default async function Page() {
  const { nickname, access } = await loadAdminSession();
  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1>출고</h1>
          <p>라벨 QR 을 스캔하면 그 상자가 지금 할 수 있는 일만 나와요. 송장을 출력하고 그 바코드를 스캔해야 출고가 확정돼요.</p>
        </div>
      </div>
      <OutboundWorkbench access={access} operatorNickname={nickname} />
    </>
  );
}
