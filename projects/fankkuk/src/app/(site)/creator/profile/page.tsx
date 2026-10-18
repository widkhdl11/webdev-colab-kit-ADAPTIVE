import { redirect } from "next/navigation";
import { readMyCreatorLink, readMyCreatorLook } from "@/entities/creator/api/creator-link-reads";
import { readTagOptions } from "@/entities/creator/api/creator-tag-reads";
import { readMyCreatorSettings } from "@/entities/creator/api/my-creator-settings";
import { creatorSymbolUrl } from "@/entities/creator/model/link-images";
import { CREATOR_PROFILE_EDIT, FAN_HOME } from "@/entities/session/model/home-path";
import { readPublicStorageBase } from "@/shared/api/supabase/detached";
import { CreatorProfileEditPage } from "@/widgets/creator-profile-edit/ui/creator-profile-edit-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 크리에이터 프로필 수정 (design-rules 12절, 입력형 720). 로그인한 크리에이터 본인 것만 읽는다 —
// 공개 이름·소개·찾기 노출·태그·팬덤 이름·두 색(my_creator_settings), 프로필 사진(my_creator_link), 배경사진·심볼(my_creator_look).
// 태그 선택지는 고를 수 있는 것(숨기지 않은 것)만 — creator-tags INV-T3.
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect(`/login?next=${CREATOR_PROFILE_EDIT}`);
  const [header, settings, tagOptions, link, look] = await Promise.all([
    readSiteHeader(supabase, viewer, CREATOR_PROFILE_EDIT),
    readMyCreatorSettings(supabase),
    readTagOptions(supabase),
    readMyCreatorLink(supabase),
    readMyCreatorLook(supabase),
  ]);
  // 크리에이터 역할인데 크리에이터 줄이 없으면 이 화면을 그릴 수 없다 — 숨기지 않고 오류로 드러낸다
  if (!settings || !link || !look) throw new Error("크리에이터 줄을 찾지 못했다");
  const photoBase = readPublicStorageBase();
  return (
    <>
      <SiteHeader {...header} />
      <MyShell width="form">
        <CreatorProfileEditPage
          name={settings.publicName}
          intro={settings.intro}
          fanName={settings.fanName}
          colors={settings.colors}
          photoPath={link.photoPath}
          bgPath={look.bgPath}
          symbolUrl={creatorSymbolUrl(photoBase, look.symbolPath)}
          visibleInSearch={settings.visibleInSearch}
          tagIds={settings.tagIds}
          customTag={settings.customTag}
          tagOptions={tagOptions}
          photoBase={photoBase}
        />
      </MyShell>
      <SiteFooter />
    </>
  );
}
