import type { Metadata } from "next";
import { readMyPendingLabel } from "@/entities/parcel/api/read-office-lists";
import { InboundWorkbench } from "@/features/office-inbound/ui/inbound-workbench";
import a from "@/shared/ui/admin.module.css";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "입고 · 팬꾹 운영자" };
}

// 입고 작업 화면 (office-workflow INV-W1·W2·W5). 이 작업자의 부착 대기 라벨을 먼저 읽어 맨 위 줄에 보인다(INV-W2).
export default async function Page() {
  const { supabase, nickname } = await loadAdminSession();
  const pending = await readMyPendingLabel(supabase);
  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1>입고</h1>
          <p>상자 겉면의 택배 송장 바코드를 스캔해요. 서버가 허용해야만 입고되고, 라벨은 1상자에 1장만 나가요.</p>
        </div>
      </div>
      <InboundWorkbench initialPending={pending} operatorNickname={nickname} />
    </>
  );
}
