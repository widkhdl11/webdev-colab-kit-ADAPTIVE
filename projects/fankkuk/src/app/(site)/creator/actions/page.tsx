import { redirect } from "next/navigation";
import { readMyAddressStatus } from "@/entities/address/api/my-address-status";
import { readCreatorActionItems } from "@/entities/action-item/api/read-action-items";
import { CREATOR_ACTION_CENTER_HREF } from "@/entities/action-item/model/creator-action-items";
import { isOrderNo } from "@/entities/order/model/order-no";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { readSentBoxCandidates } from "@/features/box-waybill/api/read-sent-box-candidates";
import { readSealingPublicKeyPem } from "@/shared/lib/envelope/sealing-key-config";
import { CreatorActionCenterPage } from "@/widgets/creator-action-center/ui/creator-action-center-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 크리에이터 처리할 일(action-center INV-J5~J8). DB 읽기 함수 한 번의 결과를 사이드바 숫자와 줄 목록에 함께 넘긴다(J6).
// 누구 것인지는 DB 가 로그인 토큰으로 정한다(J7). 승인 요청·확인할 선물 알림 링크가 이곳으로 온다(notifications INV-N9).
// 주소 상태는 승인 창의 주소 단계(approval-signature INV-S13)에, 후보는 미확인 상자 창(INV-J7)에 쓴다 — 그 읽기가 실패해도 목록은 그린다.
// 알림톡 [승인 화면 열기]는 ?order=<주문번호> 로 온다 — 그 주문이 이 크리에이터의 승인 요청 줄이면 그 승인 창을 연다(아니면 목록만, notifications INV-N9).
// 로그인 전이면 로그인 뒤 같은 주소로 돌아온다. 주문번호 꼴이 아니면 버린다.
export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { order } = await searchParams;
  const orderNo = typeof order === "string" && isOrderNo(order) ? order : null;
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect(orderNo ? `/login?next=${encodeURIComponent(`/creator/actions?order=${orderNo}`)}` : "/login");
  const [items, candidates, address] = await Promise.all([
    readCreatorActionItems(supabase),
    readSentBoxCandidates(supabase).catch(() => []),
    readMyAddressStatus(supabase).catch(() => null),
  ]);
  const header = await readSiteHeader(supabase, viewer, CREATOR_ACTION_CENTER_HREF, items);
  return (
    <>
      <SiteHeader {...header} />
      <MyShell width="list">
        <CreatorActionCenterPage
          items={items}
          now={new Date().toISOString()}
          candidates={candidates}
          address={address}
          sealingKeyPem={readSealingPublicKeyPem(process.env)}
          openOrderNo={orderNo}
        />
      </MyShell>
      <SiteFooter />
    </>
  );
}
