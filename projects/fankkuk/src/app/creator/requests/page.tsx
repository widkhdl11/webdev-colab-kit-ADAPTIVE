import { redirect } from "next/navigation";
import { readMyAddressStatus } from "@/entities/address/api/my-address-status";
import { readMyApprovalRequests, readMyDecidedRequests } from "@/entities/order/api/creator-request-rows";
import { readMyCreatorChecks } from "@/entities/parcel/api/read-creator-checks";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { ApprovalRequestsPage } from "@/widgets/approval-requests/ui/approval-requests-page";
import { readSealingPublicKeyPem } from "@/shared/lib/envelope/sealing-key-config";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 크리에이터 — 승인 요청(DB 읽기 함수 — 그 크리에이터의 것만, 결제가 끝난 주문만, 크리에이터가 봐도 되는 칸만). 인자 없이 로그인 토큰의 크리에이터 것만 돌려준다.
// 받은 선물(상자·받았어요·답장)은 v18 시안대로 /creator/boxes 로 나눴다 — 옛 주소 ?tab=received 는 그 화면으로 보낸다.
// 승인 버튼은 아직 서명 대기 표시까지다 — 카카오 인증서 서명은 딜러사 연결 뒤에 붙는다(INV-S7: 승인 입구는 서명 검증 하나).
// ?tab=checks 로 확인할 선물 탭을 먼저 연다. 주소에 탭이 없고 답을 기다리는 확인할 선물이 있으면
// 그 탭을 먼저 연다 — 「확인할 선물」 알림 링크는 물음표 없는 고정 경로(notifications INV-N9)라 이 화면 자체로 온다(2026-10-12 (2) D3 ②).
export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login");
  const { tab } = await searchParams;
  if (tab === "received") redirect("/creator/boxes");
  // 주소 상태는 승인 창의 주소 단계(INV-S13)에 쓴다 — 등록 여부·이름표·바꾼 날만 온다(INV-P16)
  const [requests, decided, checks, address] = await Promise.all([
    readMyApprovalRequests(supabase),
    readMyDecidedRequests(supabase),
    readMyCreatorChecks(supabase),
    // 읽기 실패로 승인 목록 전체가 멈추지 않게 — 실패하면 승인 창의 주소 단계만 「다시 해 주세요」 안내가 된다
    readMyAddressStatus(supabase).catch(() => null),
  ]);
  const initialTab = tab === "checks" || (tab === undefined && checks.length > 0) ? "checks" : "requests";
  return (
    <>
      <SiteHeader role="creator" current="/creator/requests" nickname={viewer.nickname ?? ""} pendingCount={requests.length} />
      <MyShell width="list">
        <ApprovalRequestsPage
          requests={requests}
          decided={decided}
          now={new Date().toISOString()}
          checks={checks}
          initialTab={initialTab}
          address={address}
          sealingKeyPem={readSealingPublicKeyPem(process.env)}
        />
      </MyShell>
      <SiteFooter />
    </>
  );
}
