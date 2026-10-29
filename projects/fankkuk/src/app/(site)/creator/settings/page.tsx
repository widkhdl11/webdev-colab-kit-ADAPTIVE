import { redirect } from "next/navigation";
import { readMyBlockedSenders } from "@/entities/creator/api/blocked-senders";
import { readApiCheckPlatforms, readMyVerifications, readMyVerificationState } from "@/entities/creator/api/creator-verification-reads";
import { readMyAddressStatus } from "@/entities/address/api/my-address-status";
import { readCreatorCards } from "@/entities/creator/api/creator-reads";
import { readMyCreatorSettings } from "@/entities/creator/api/my-creator-settings";
import { readMyCreatorReceiving } from "@/entities/creator/api/receiving-reads";
import { readMySignatureLink } from "@/entities/creator/api/signature-link-reads";
import { kstToday } from "@/entities/creator/model/receiving";
import { creatorBackgroundUrl, creatorPhotoUrl, creatorSymbolUrl, nameInitial } from "@/entities/creator/model/link-images";
import { readMyHardItems } from "@/entities/gift-item/api/hard-items-reads";
import { readMyCreatorLink, readMyCreatorLook } from "@/entities/creator/api/creator-link-reads";
import { readMyReplySettings } from "@/entities/gift-reply/api/gift-reply-reads";
import { CREATOR_SETTINGS, FAN_HOME } from "@/entities/session/model/home-path";
import { readPublicStorageBase } from "@/shared/api/supabase/detached";
import { readSealingPublicKeyPem } from "@/shared/lib/envelope/sealing-key-config";
import { CreatorSettingsPage } from "@/widgets/creator-settings/ui/creator-settings-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 크리에이터 상세 설정 (design-rules 12절 · 27절, 틀 폭 1200 — 「팬덤」 입력 + 미리보기 두 단). 모두 로그인한 크리에이터 본인 것만 읽는다:
// 팬덤 이름·테마 색(my_creator_settings — creator-link INV-E13)과 카드 미리보기에 쓰는 사진·배경·심볼(my_creator_link · my_creator_look)·공개 카드 값(creator_by_id),
// 차단 목록(INV-D9)·주소 등록 여부(INV-P13 — 주소는 값이 아니라 등록 여부와 봉인에 넣을 크리에이터 ID 만), 채널 본인 확인(creator-verification INV-V11),
// 알림 두 칸(my_account — INV-A11), 받는 상태·팬당 한도·생일·기념일(creator-receiving INV-B1·B6), 받기 어려운 품목(hard-items INV-H3·H6),
// 링크용 아이디(creator-link INV-E1·E4), 답장 모음 설정(gift-reply INV-G8), 승인 서명 연결 여부와 연결한 때(approval-signature INV-S16).
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect(`/login?next=${CREATOR_SETTINGS}`);
  const [header, blockedFans, address, state, rows, apiPlatforms, settings, receiving, hardItems, link, look, replySettings, signatureLink] = await Promise.all([
    readSiteHeader(supabase, viewer, "/creator/settings"),
    readMyBlockedSenders(supabase),
    readMyAddressStatus(supabase),
    readMyVerificationState(supabase),
    readMyVerifications(supabase),
    readApiCheckPlatforms(supabase),
    readMyCreatorSettings(supabase),
    readMyCreatorReceiving(supabase),
    readMyHardItems(supabase),
    readMyCreatorLink(supabase),
    readMyCreatorLook(supabase),
    readMyReplySettings(supabase),
    readMySignatureLink(supabase),
  ]);
  // 크리에이터 역할인데 크리에이터 줄이 없으면 이 화면을 그릴 수 없다 — 숨기지 않고 오류로 드러낸다
  if (!address || !state || !settings || !receiving || !link || !look || !replySettings) throw new Error("크리에이터 줄을 찾지 못했다");
  const photoBase = readPublicStorageBase();
  // 카드 미리보기 — 찾기 화면과 같은 카드 값(채널 이름·태그·평균 승인 시간). 본인 확인 전이라 공개 카드가 없으면 설정 값으로 채운다
  const [ownCard] = await readCreatorCards(supabase, { signedIn: false, followedIds: [], onlyId: address.creatorId });
  return (
    <>
      <SiteHeader {...header} />
      <MyShell width="broad">
        <CreatorSettingsPage
          settings={settings}
          fandom={{
            fanName: settings.fanName,
            colors: settings.colors,
            publicName: settings.publicName,
            initial: nameInitial(settings.publicName) || "?",
            photoUrl: creatorPhotoUrl(photoBase, link.photoPath),
            backgroundUrl: creatorBackgroundUrl(photoBase, look.bgPath),
            symbolUrl: creatorSymbolUrl(photoBase, look.symbolPath),
            photoBase,
            card: {
              creatorId: address.creatorId,
              channelTitle: ownCard?.channelTitle ?? "",
              intro: ownCard?.intro ?? settings.intro,
              tags: ownCard?.tags ?? [],
              approvalMinutes: ownCard?.approvalMinutes ?? null,
              faceTone: ownCard?.faceTone ?? "",
            },
          }}
          address={address}
          sealingKeyPem={readSealingPublicKeyPem(process.env)}
          blockedFans={blockedFans}
          verification={{ state, rows, apiPlatforms: [...apiPlatforms] }}
          receiving={receiving}
          hardItems={hardItems}
          today={kstToday(new Date())}
          link={link}
          replySettings={replySettings}
          signatureLink={signatureLink}
        />
      </MyShell>
      <SiteFooter />
    </>
  );
}
