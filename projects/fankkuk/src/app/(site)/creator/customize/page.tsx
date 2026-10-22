import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { readMyCreatorLink, readMyCreatorLook } from "@/entities/creator/api/creator-link-reads";
import { readOwnCreatorId } from "@/entities/creator/api/creator-reads";
import { readMyVerificationState } from "@/entities/creator/api/creator-verification-reads";
import { readMyCreatorSettings } from "@/entities/creator/api/my-creator-settings";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { readPublicStorageBase } from "@/shared/api/supabase/detached";
import { CreatorCustomizePage } from "@/widgets/creator-customize/ui/creator-customize-page";
import { requestOrigin } from "@/widgets/creator-profile/model/link-metadata";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 내 팬꾹 꾸미기 (design-rules 27절, 스펙 creator-link). 틀은 목록형 880(4 + 8 묶음). 로그인한 크리에이터 본인 것만 읽는다 —
// 공개 이름(my_creator_settings — 공유 카드 제목), 링크용 아이디·프로필 사진(my_creator_link),
// 심볼·미리보기 고르기(my_creator_look), 본인 확인 여부(my_creator_verification_state), 크리에이터 ID(공지 이미지 주소).
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login?next=/creator/customize");
  const [header, settings, link, look, state, creatorId] = await Promise.all([
    readSiteHeader(supabase, viewer, "/creator/customize"),
    readMyCreatorSettings(supabase),
    readMyCreatorLink(supabase),
    readMyCreatorLook(supabase),
    readMyVerificationState(supabase),
    readOwnCreatorId(supabase),
  ]);
  // 크리에이터 역할인데 크리에이터 줄이 없으면 이 화면을 그릴 수 없다 — 숨기지 않고 오류로 드러낸다
  if (!settings || !link || !look || !state || !creatorId) throw new Error("크리에이터 줄을 찾지 못했다");
  return (
    <>
      <SiteHeader {...header} />
      <MyShell width="list">
        <CreatorCustomizePage
          creatorId={creatorId}
          verified={state.verified}
          handle={link.handle}
          name={settings.publicName}
          photoPath={link.photoPath}
          look={look}
          photoBase={readPublicStorageBase()}
          siteOrigin={requestOrigin(await headers())}
        />
      </MyShell>
      <SiteFooter />
    </>
  );
}
