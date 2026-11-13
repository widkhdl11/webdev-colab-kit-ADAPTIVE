import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { readMyCreatorLink, readMyCreatorLook } from "@/entities/creator/api/creator-link-reads";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { readTagOptions } from "@/entities/creator/api/creator-tag-reads";
import { readApiCheckPlatforms, readMyVerifications, readMyVerificationState } from "@/entities/creator/api/creator-verification-reads";
import { readMyCreatorSettings } from "@/entities/creator/api/my-creator-settings";
import { creatorBackgroundUrl, creatorPhotoUrl, creatorSymbolUrl } from "@/entities/creator/model/link-images";
import { CREATOR_PROFILE_EDIT, creatorProfileTabHref, FAN_HOME, parseCreatorProfileTab } from "@/entities/session/model/home-path";
import { readPublicStorageBase } from "@/shared/api/supabase/detached";
import { CreatorChannelOwnerRow, CreatorLeaveRow, CreatorSecurityGroup } from "@/widgets/creator-account/ui/creator-account-page";
import { showsLinkSection } from "@/widgets/creator-profile-edit/model/channel-tab";
import { CreatorProfileEditPage } from "@/widgets/creator-profile-edit/ui/creator-profile-edit-page";
import { FandomDraftProvider, FandomForm, FandomPreview } from "@/widgets/creator-settings/ui/fandom-section";
import { LinkSection } from "@/widgets/creator-settings/ui/link-section";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 크리에이터 프로필 수정 — 세 탭(?tab=profile|channel|account, 없으면 프로필. 2026-11-13 재분류 — UX 명세 creator-profile).
// 로그인·역할 확인은 옮기기 전과 같은 함수(loadSession)와 같은 갈래다. 모두 로그인한 크리에이터 본인 것만 읽는다:
// - 모든 탭: 공개 이름·소개·찾기 노출·태그·팬덤 이름·두 색·휴대폰 번호(가린 값)(my_creator_settings), 프로필 사진·링크용 아이디(my_creator_link), 배경사진·심볼(my_creator_look).
//   태그 선택지는 고를 수 있는 것(숨기지 않은 것)만 — creator-tags INV-T3.
// - 채널 탭만(옛 상세 설정·계정 설정에서 옮김): 채널 본인 확인(creator-verification INV-V11 — 링크 칸이 확인 여부를 쓰고 채널 소유자 확인 줄이 그린다),
//   팬덤 카드 미리보기의 공개 카드 값(creator_by_id — 본인 확인 전이라 공개 카드가 없으면 설정 값으로 채운다).
// 채널 탭 미리보기는 팬덤 카드 하나(오른쪽 열) — 팬덤 입력 판과 카드가 입력 중 값을 같이 보도록 FandomDraftProvider 로 감싼다.
// 연락처(가린 휴대폰 번호)가 담긴 화면이라 요청마다 그린다(force-dynamic).
export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const tab = parseCreatorProfileTab((await searchParams).tab);
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  // 로그인 뒤 같은 탭으로 돌아온다(주소 끝 #앵커는 서버가 받지 못해 탭까지만)
  if (viewer?.role !== "creator") redirect(`/login?next=${encodeURIComponent(creatorProfileTabHref(tab))}`);
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

  let channel: { sections: ReactNode; preview: ReactNode } | null = null;
  if (tab === "channel") {
    const [state, rows, apiPlatforms] = await Promise.all([readMyVerificationState(supabase), readMyVerifications(supabase), readApiCheckPlatforms(supabase)]);
    if (!state) throw new Error("크리에이터 줄을 찾지 못했다");
    // 카드 미리보기 — 찾기 화면과 같은 카드 값(채널 이름·태그·평균 승인 시간)
    const [ownCard] = await readCreatorCards(supabase, { signedIn: false, followedIds: [], onlyId: state.creatorId });
    channel = {
      sections: (
        <>
          {/* 확인 판이 ① 팬꾹 링크 만들기를 그리는 동안에는 링크 칸이 둘이 되지 않게 빼 둔다 */}
          {showsLinkSection(state, rows) ? <LinkSection initial={link} verified={state.verified} /> : null}
          <FandomForm fanName={settings.fanName} colors={settings.colors} photoBase={photoBase} />
          <CreatorChannelOwnerRow verification={{ state, rows, apiPlatforms: [...apiPlatforms], loginId: viewer.loginId ?? null }} />
        </>
      ),
      preview: (
        <FandomPreview
          publicName={settings.publicName}
          photoUrl={creatorPhotoUrl(photoBase, link.photoPath)}
          backgroundUrl={creatorBackgroundUrl(photoBase, look.bgPath)}
          card={{
            creatorId: state.creatorId,
            channelTitle: ownCard?.channelTitle ?? "",
            intro: ownCard?.intro ?? settings.intro,
            tags: ownCard?.tags ?? [],
            approvalMinutes: ownCard?.approvalMinutes ?? null,
            faceTone: ownCard?.faceTone ?? "",
          }}
        />
      ),
    };
  }

  return (
    <>
      <SiteHeader {...header} />
      <MyShell width="broad">
        <FandomDraftProvider key={tab} fanName={settings.fanName} colors={settings.colors} symbolUrl={creatorSymbolUrl(photoBase, look.symbolPath)}>
        <CreatorProfileEditPage
          // 탭마다 입력 상태를 새로 — 다른 탭에서 저장한 값을 서버에서 다시 받는다
          key={tab}
          tab={tab}
          channelSections={channel?.sections}
          channelPreview={channel?.preview}
          accountSections={
            tab === "account" ? (
              <>
                <CreatorSecurityGroup phoneMasked={settings.phoneMasked} />
                <CreatorLeaveRow />
              </>
            ) : null
          }
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
        </FandomDraftProvider>
      </MyShell>
      <SiteFooter />
    </>
  );
}
