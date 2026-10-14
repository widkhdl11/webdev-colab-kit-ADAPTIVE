import { redirect } from "next/navigation";
import { readMyBlockedSenders } from "@/entities/creator/api/blocked-senders";
import { readApiCheckPlatforms, readMyVerifications, readMyVerificationState } from "@/entities/creator/api/creator-verification-reads";
import { readMyAddressStatus } from "@/entities/address/api/my-address-status";
import { readMyCreatorSettings } from "@/entities/creator/api/my-creator-settings";
import { readTagOptions } from "@/entities/creator/api/creator-tag-reads";
import { readMyCreatorReceiving } from "@/entities/creator/api/receiving-reads";
import { kstToday } from "@/entities/creator/model/receiving";
import { readMyHardItems } from "@/entities/gift-item/api/hard-items-reads";
import { readMyCreatorLink } from "@/entities/creator/api/creator-link-reads";
import { readMyReplySettings } from "@/entities/gift-reply/api/gift-reply-reads";
import { FAN_HOME } from "@/entities/session/model/home-path";
import { readSealingPublicKeyPem } from "@/shared/lib/envelope/sealing-key-config";
import { CreatorSettingsPage } from "@/widgets/creator-settings/ui/creator-settings-page";
import { MyShell } from "@/widgets/my-nav/ui/my-shell";
import { SiteFooter } from "@/widgets/site-footer/ui/site-footer";
import { loadSession, readSiteHeader } from "@/widgets/site-header/api/session-header";
import { SiteHeader } from "@/widgets/site-header/ui/site-header";

export const dynamic = "force-dynamic";

// 차단 목록(INV-D9)과 주소 등록 여부(INV-P13)는 DB 에서 — 로그인한 크리에이터의 것만. 주소는 값이 아니라 등록 여부와
// 봉인에 넣을 크리에이터 ID 만 넘긴다. 채널 본인 확인(creator-verification INV-V11)도 로그인한 크리에이터의 신청만 읽는다.
// 공개 이름·소개글·찾기 노출·태그(my_creator_settings)와 알림 두 칸(my_account)도 DB 에서 — 로그인한 크리에이터의 것만(my-account INV-A9~A11).
// 태그 선택지는 고를 수 있는 것(숨기지 않은 것)만 — creator-tags INV-T3.
// 받는 상태·팬당 한도·생일·기념일(my_creator_receiving)도 로그인한 크리에이터 본인 것만(creator-receiving INV-B1·B6).
// 받기 어려운 품목(my_creator_hard_items)도 본인 것만 — 남은 기간은 이 화면에만(hard-items INV-H3·H6).
export default async function Page() {
  const { supabase, viewer } = await loadSession();
  if (viewer?.role === "fan") redirect(FAN_HOME);
  if (viewer?.role !== "creator") redirect("/login");
  const [header, blockedFans, address, state, rows, apiPlatforms, settings, tagOptions, receiving, hardItems, link, replySettings] = await Promise.all([
    readSiteHeader(supabase, viewer, "/creator/settings"),
    readMyBlockedSenders(supabase),
    readMyAddressStatus(supabase),
    readMyVerificationState(supabase),
    readMyVerifications(supabase),
    readApiCheckPlatforms(supabase),
    readMyCreatorSettings(supabase),
    readTagOptions(supabase),
    readMyCreatorReceiving(supabase),
    readMyHardItems(supabase),
    // creator-link: 링크용 아이디·남은 잠금 날 — 본인 것만(INV-E1·E4). 사진·공지 이미지는 「내 팬꾹 꾸미기」 화면
    readMyCreatorLink(supabase),
    // gift-reply: 답장 모음 보이기·X 계정·태그 허용 — 본인 것만(INV-G8)
    readMyReplySettings(supabase),
  ]);
  // 크리에이터 역할인데 크리에이터 줄이 없으면 이 화면을 그릴 수 없다 — 숨기지 않고 오류로 드러낸다
  if (!address || !state || !settings || !receiving || !link || !replySettings) throw new Error("크리에이터 줄을 찾지 못했다");
  return (
    <>
      <SiteHeader {...header} />
      <MyShell>
        <CreatorSettingsPage
          settings={settings}
          tagOptions={tagOptions}
          address={address}
          sealingKeyPem={readSealingPublicKeyPem(process.env)}
          blockedFans={blockedFans}
          verification={{ state, rows, apiPlatforms: [...apiPlatforms] }}
          receiving={receiving}
          hardItems={hardItems}
          today={kstToday(new Date())}
          link={link}
          replySettings={replySettings}
        />
      </MyShell>
      <SiteFooter />
    </>
  );
}
