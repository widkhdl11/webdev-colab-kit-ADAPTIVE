import type { Metadata } from "next";
import { GiftBoxWorkbench } from "@/features/office-gift-box/ui/gift-box-workbench";
import a from "@/shared/ui/admin.module.css";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "선물함 입고·실측 · 팬꾹 운영자" };
}

// 선물함 입고·실측 (revgift-box INV-GB10·GB12·GB13·GB16). 운영자가 아니면 404.
export default async function Page() {
  await loadAdminSession();
  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1>선물함 입고·실측</h1>
          <p>크리에이터가 선물함 6자리로 보낸 큰 상자를 받고, 선물마다 바코드나 닉네임으로 팬을 찾아 실측해요. 모두 실측되면 명세서가 만들어져요.</p>
        </div>
      </div>
      <GiftBoxWorkbench />
    </>
  );
}
