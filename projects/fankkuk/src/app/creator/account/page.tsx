import { redirect } from "next/navigation";
import { readApiCheckPlatforms, readMyVerifications, readMyVerificationState } from "@/entities/creator/api/creator-verification-reads";
import { readMyCreatorSettings } from "@/entities/creator/api/my-creator-settings";
import { CREATOR_ACCOUNT, FAN_HOME } from "@/entities/session/model/home-path";
import { CreatorAccountPage } from "@/widgets/creator-account/ui/creator-account-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 크리에이터 계정 설정(입력형 720, 2026-10-16 — 상세 설정의 「계정」 칸을 옮김). 모두 로그인한 크리에이터 본인 것만 읽는다:
// 휴대폰 번호(가린 값)·알림 두 칸(my_creator_settings — my-account INV-A11), 채널 본인 확인(creator-verification INV-V11).
// 연락처가 담긴 화면이라 요청마다 그린다(force-dynamic — 운영 모드에서 Cache-Control: private, no-store).
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect(`/login?next=${CREATOR_ACCOUNT}`);
  const [header, settings, state, rows, apiPlatforms] = await Promise.all([
    readSiteHeader(supabase, viewer, CREATOR_ACCOUNT),
    readMyCreatorSettings(supabase),
    readMyVerificationState(supabase),
    readMyVerifications(supabase),
    readApiCheckPlatforms(supabase),
  ]);
  // 크리에이터 역할인데 크리에이터 줄이 없으면 이 화면을 그릴 수 없다 — 숨기지 않고 오류로 드러낸다
  if (!settings || !state) throw new Error("크리에이터 줄을 찾지 못했다");
  return (
    <>
      <SiteHeader {...header} />
      <MyShell width="form">
        <CreatorAccountPage phoneMasked={settings.phoneMasked} notify={settings.notify} verification={{ state, rows, apiPlatforms: [...apiPlatforms] }} />
      </MyShell>
      <SiteFooter />
    </>
  );
}
