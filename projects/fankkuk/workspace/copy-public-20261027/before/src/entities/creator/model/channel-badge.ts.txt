import { CHANNEL_PLATFORM_LABEL, isChannelPlatform, type ChannelPlatform } from "./channel-url";

// 확인된 채널 한 줄의 공개 정보 (추가분 4-3·4-4·4-5, creator-verification INV-V7 — 승인으로만 바뀌는 칸).
// 링크 페이지 닉네임 아래 채널 아이콘, 「채널 소유 확인」 뱃지의 풀이, 선물 보내기 맨 위 한 줄, 함께한 시간 확인 아이콘이 모두 이 파일을 읽는다.
// 공개 칸은 플랫폼·채널 키·채널 주소·확인 날짜뿐이다 — 운영자 메모·인증 코드·신청은 읽기 함수가 돌려주지 않는다.
// 문구는 확인한 사실만 말한다(design-rules 6절): 「공식·인증된·검증된·안전한」은 쓰지 않는다.

export type ChannelBadge = {
  platform: ChannelPlatform;
  /** 채널 키(유튜브 핸들·치지직 채널 ID·SOOP 아이디·인스타그램 사용자 이름) — 이미 소문자로 정리된 값 */
  channelKey: string;
  /** DB 가 채널 키로 다시 만든 주소 */
  channelUrl: string;
  /** 마지막 승인 날짜(한국 시간, YYYY-MM-DD) — 승인 기록이 없으면 null */
  verifiedOn: string | null;
};

/** 화면에 보이는 플랫폼 이름(유튜브·치지직·SOOP·인스타그램). */
export function channelPlatformLabel(badge: Pick<ChannelBadge, "platform">): string {
  return CHANNEL_PLATFORM_LABEL[badge.platform];
}

/** 「2026.10.14」 — YYYY-MM-DD 가 아니면 빈 문자열. */
function dotted(isoDate: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? isoDate.replaceAll("-", ".") : "";
}

/**
 * 풀이의 앞머리 — 채널 키를 사람이 알아보는 꼴로.
 * 유튜브·인스타그램은 「@핸들」(그 플랫폼이 쓰는 꼴), SOOP 은 아이디 그대로(@ 없이),
 * 치지직은 키가 32자 채널 ID 라 보여 줘도 알아볼 수 없어 「치지직 채널」.
 */
function channelSubject(badge: Pick<ChannelBadge, "platform" | "channelKey">): string {
  switch (badge.platform) {
    case "youtube":
    case "instagram":
      return `@${badge.channelKey}`;
    case "soop":
      return badge.channelKey;
    case "chzzk":
      return `${CHANNEL_PLATFORM_LABEL.chzzk} 채널`;
  }
}

/**
 * 마우스를 올리면 보이는 풀이 — 「@핸들 · 2026.10.14 확인」(유튜브·인스타그램), 「아이디 · …」(SOOP), 「치지직 채널 · …」.
 * 날짜가 없으면 「… · 채널 소유 확인」(치지직은 「치지직 채널 소유 확인」).
 */
export function channelBadgeTitle(badge: Pick<ChannelBadge, "platform" | "channelKey" | "verifiedOn">): string {
  const subject = channelSubject(badge);
  const date = badge.verifiedOn ? dotted(badge.verifiedOn) : "";
  if (date) return `${subject} · ${date} 확인`;
  return badge.platform === "chzzk" ? `${subject} 소유 확인` : `${subject} · 채널 소유 확인`;
}

/**
 * 선물 보내기 맨 위 한 줄(4-4). platform 은 플랫폼 코드(youtube·chzzk·soop·instagram) — 화면 이름은 안에서 붙인다.
 * 이름이 비었거나 플랫폼이 그 넷이 아니면(확인 전·옛 값) null — 줄을 그리지 않는다.
 */
export function channelOwnerLine(creator: { name: string; platform: string | null } | null | undefined): string | null {
  const name = creator?.name.trim() ?? "";
  const platform = creator?.platform ?? "";
  if (!name || !isChannelPlatform(platform)) return null;
  return `${name}님의 ${CHANNEL_PLATFORM_LABEL[platform]} 채널 소유자 확인 완료`;
}
