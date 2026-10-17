import { redirect } from "next/navigation";
import { readMyAddressStatus } from "@/entities/address/api/my-address-status";
import { readCreatorActionItems } from "@/entities/action-item/api/read-action-items";
import { CREATOR_ACTION_CENTER_HREF } from "@/entities/action-item/model/creator-action-items";
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
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login");
  const [items, candidates, address] = await Promise.all([
    readCreatorActionItems(supabase),
    readSentBoxCandidates(supabase).catch(() => []),
    readMyAddressStatus(supabase).catch(() => null),
  ]);
  const header = await readSiteHeader(supabase, viewer, CREATOR_ACTION_CENTER_HREF, undefined, items);
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
        />
      </MyShell>
      <SiteFooter />
    </>
  );
}
