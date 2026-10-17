import { redirect } from "next/navigation";
import { readMyFanAddressStatus } from "@/entities/address/api/my-fan-address-status";
import { readActionItems } from "@/entities/action-item/api/read-action-items";
import { ACTION_CENTER_HREF } from "@/entities/action-item/model/action-items";
import { CREATOR_HOME } from "@/entities/session/model/home-path";
import { readSealingPublicKeyPem } from "@/shared/lib/envelope/sealing-key-config";
import { ActionCenterPage } from "@/widgets/action-center/ui/action-center-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 처리할 일(팬 — action-center INV-J1~J4). DB 읽기 함수 한 번의 결과를 사이드바 숫자와 카드 목록에 함께 넘긴다(J2).
// 누구 것인지는 DB 가 로그인 토큰으로 정한다(J3). 크리에이터는 크리에이터 메인으로.
// 반송 주소 확인 카드(office-workflow INV-W15)의 창에 받을 주소 상태(이름표·바꾼 날만 — address-protection INV-P16)와 봉인 공개키를 넘긴다.
// 주소 상태를 읽지 못해도 목록은 그린다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "creator") redirect(CREATOR_HOME);
  if (viewer?.role !== "fan") redirect("/login");
  const [items, addressStatus] = await Promise.all([readActionItems(supabase), readMyFanAddressStatus(supabase).catch(() => null)]);
  const sealingKeyPem = readSealingPublicKeyPem(process.env);
  const header = await readSiteHeader(supabase, viewer, ACTION_CENTER_HREF, undefined, items);
  return (
    <>
      <SiteHeader {...header} />
      <MyShell width="list">
        <ActionCenterPage items={items} clientKey={process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? ""} now={new Date().toISOString()}
          address={{ accountId: viewer.userId, status: addressStatus, sealingKeyPem }}
        />
      </MyShell>
      <SiteFooter />
    </>
  );
}
