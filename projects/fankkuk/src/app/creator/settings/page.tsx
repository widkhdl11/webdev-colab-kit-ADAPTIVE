import { redirect } from "next/navigation";
import { readMyBlockedSenders } from "@/entities/creator/api/blocked-senders";
import { readMyAddressStatus } from "@/entities/creator/api/my-address-status";
import { SAMPLE_CREATOR_SETTINGS } from "@/entities/creator/api/sample-creator-settings";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { readSealingPublicKeyPem } from "@/shared/lib/envelope/sealing-key-config";
import { CreatorSettingsPage } from "@/widgets/creator-settings/ui/creator-settings-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 차단 목록(INV-D9)과 주소 등록 여부(INV-P13)는 DB 에서 — 로그인한 크리에이터의 것만. 주소는 값이 아니라 등록 여부와
// 봉인에 넣을 크리에이터 ID 만 넘긴다. 프로필·알림은 아직 예시 데이터다.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login");
  const [header, blockedFans, address] = await Promise.all([
    readSiteHeader(supabase, viewer, "/creator/settings"),
    readMyBlockedSenders(supabase),
    readMyAddressStatus(supabase),
  ]);
  // 크리에이터 역할인데 크리에이터 줄이 없으면 이 화면을 그릴 수 없다 — 숨기지 않고 오류로 드러낸다
  if (!address) throw new Error("크리에이터 줄을 찾지 못했다");
  return (
    <>
      <SiteHeader {...header} />
      <MyShell role="creator" current="/creator/settings">
        <CreatorSettingsPage
          settings={SAMPLE_CREATOR_SETTINGS}
          address={address}
          sealingKeyPem={readSealingPublicKeyPem(process.env)}
          blockedFans={blockedFans}
        />
      </MyShell>
      <SiteFooter />
    </>
  );
}
