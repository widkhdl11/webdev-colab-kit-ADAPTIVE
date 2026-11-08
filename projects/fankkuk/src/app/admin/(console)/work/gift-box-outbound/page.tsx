import type { Metadata } from "next";
import { GiftBoxOutbound } from "@/features/office-gift-box/ui/gift-box-outbound";
import a from "@/shared/ui/admin.module.css";
import { loadAdminSession } from "@/widgets/admin-shell/api/admin-session";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  await loadAdminSession(); // 운영자가 아니면 제목도 만들지 않고 404
  return { title: "선물함 출고·반송 · 팬꾹 운영자" };
}

// 선물함 출고·반송 (revgift-box INV-GB19·GB20). 운영자가 아니면 404. 송장 출력은 대표만.
export default async function Page() {
  await loadAdminSession();
  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1>선물함 출고·반송</h1>
          <p>결제가 끝난 선물함의 선물마다 바코드를 스캔해 송장을 출력하고 출고해요. 결제가 없어 돌려보내는 선물함은 아래에서 반송 송장번호를 넣어요.</p>
        </div>
      </div>
      <GiftBoxOutbound />
    </>
  );
}
