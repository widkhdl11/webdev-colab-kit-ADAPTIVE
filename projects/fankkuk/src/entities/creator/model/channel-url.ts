// 채널 주소 → (플랫폼, 채널 키, 다시 만든 주소) (creator-verification INV-V2).
// DB 의 cv_parse_channel_url · cv_key_valid · cv_channel_url(supabase/migrations/20261006000001·0002)과 같은 규칙이다.
// 앱 서버의 입력 검사와 화면의 미리 보기가 모두 이 파일 하나를 쓴다. 두 쪽이 같은 답을 내는지는
// 통합 시험(tests/integration/channel-url-parity.integration.test.ts)이 같은 주소 목록을 DB 와 이 함수에 함께 넣어 확인한다.
// 저장하는 주소는 언제나 DB 가 채널 키로 다시 만든 것이다 — 이 함수의 결과는 검사와 안내에만 쓴다.

export const CHANNEL_PLATFORMS = ["youtube", "chzzk", "soop", "instagram"] as const;
export type ChannelPlatform = (typeof CHANNEL_PLATFORMS)[number];

export const CHANNEL_PLATFORM_LABEL: Record<ChannelPlatform, string> = {
  youtube: "유튜브",
  chzzk: "치지직",
  soop: "SOOP",
  instagram: "인스타그램",
};

export type ParsedChannel = { platform: ChannelPlatform; channelKey: string; channelUrl: string };

/** unsupported = 받지 않는 플랫폼(알플레이·틱톡·목록 밖 — 1:1 문의) · shape = 받는 플랫폼이지만 꼴이 틀림 */
export type ChannelUrlResult = { ok: true; channel: ParsedChannel } | { ok: false; reason: "unsupported" | "shape" };

export const CHANNEL_URL_MESSAGE = {
  unsupported: "아직 받지 않는 플랫폼이에요. 1:1 문의로 알려 주세요.",
  shape: "채널 주소를 확인해 주세요. 받는 주소 꼴은 아래에 있어요.",
} as const;

/** 화면 안내용 — 플랫폼마다 받는 주소 꼴(INV-V2 표). */
export const CHANNEL_URL_EXAMPLES: ReadonlyArray<{ platform: ChannelPlatform; example: string }> = [
  { platform: "youtube", example: "https://www.youtube.com/@핸들" },
  { platform: "chzzk", example: "https://chzzk.naver.com/채널ID" },
  { platform: "soop", example: "https://www.sooplive.com/station/아이디" },
  { platform: "instagram", example: "https://www.instagram.com/사용자이름" },
];

const INSTAGRAM_RESERVED = new Set(["explore", "accounts", "reels", "reel", "p", "stories", "direct", "about", "developer", "legal", "tv"]);

/** 글자 수 — DB 의 char_length 와 같게 코드 포인트로 센다. */
const charLength = (s: string) => [...s].length;

/** cv_key_valid 와 같다. 키는 이미 소문자여야 한다. */
export function isValidChannelKey(platform: ChannelPlatform, key: string): boolean {
  if (key !== key.toLowerCase()) return false;
  switch (platform) {
    case "youtube":
      return (
        /^[a-z0-9가-힣]([a-z0-9가-힣_.·-]*[a-z0-9가-힣])?$/.test(key) && charLength(key) <= 30 && (charLength(key) >= 3 || /[가-힣]/.test(key))
      );
    case "chzzk":
      return /^[0-9a-f]{32}$/.test(key);
    case "soop":
      return /^[a-z0-9_]{3,24}$/.test(key);
    case "instagram":
      return /^[a-z0-9._]{1,30}$/.test(key) && !/^\.|\.$|\.\./.test(key) && !INSTAGRAM_RESERVED.has(key);
  }
}

/** cv_channel_url 과 같다. */
export function channelUrlOf(platform: ChannelPlatform, key: string): string {
  switch (platform) {
    case "youtube":
      return `https://www.youtube.com/@${key}`;
    case "chzzk":
      return `https://chzzk.naver.com/${key}`;
    case "soop":
      return `https://www.sooplive.com/station/${key}`;
    case "instagram":
      return `https://www.instagram.com/${key}`;
  }
}

/** cv_percent_decode 와 같다 — %XX 를 바이트로 풀어 UTF-8 로 읽는다. 꼴이 깨졌으면 null. */
export function percentDecode(s: string): string | null {
  const bytes: number[] = [];
  const encoder = new TextEncoder();
  const chars = [...s];
  for (let i = 0; i < chars.length; ) {
    const ch = chars[i]!;
    if (ch === "%") {
      const hex = (chars[i + 1] ?? "") + (chars[i + 2] ?? "");
      if (!/^[0-9A-Fa-f]{2}$/.test(hex)) return null;
      bytes.push(parseInt(hex, 16));
      i += 3;
    } else {
      bytes.push(...encoder.encode(ch));
      i += 1;
    }
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
    // DB(convert_from)는 0 바이트를 받지 않는다
    return text.includes("\u0000") ? null : text;
  } catch {
    return null;
  }
}

const shape = { ok: false, reason: "shape" } as const;

/** cv_parse_channel_url 과 같다. */
export function parseChannelUrl(input: string): ChannelUrlResult {
  // DB 의 btrim 은 띄어쓰기(공백 글자)만 뗀다
  const v = input.replace(/^ +| +$/g, "");
  if (charLength(v) > 300 || v.slice(0, 8).toLowerCase() !== "https://") return shape;
  const rest = v.slice(8).split("#")[0]!.split("?")[0]!;
  const authority = rest.split("/")[0]!;
  let path = rest.slice(authority.length);
  let host = authority.toLowerCase();
  // 사용자 정보(@)·포트(:) 같은 것이 붙은 주소는 받지 않는다
  if (!/^[a-z0-9.-]+$/.test(host)) return shape;
  host = host.replace(/^(www|m)\./, "");
  path = path.replace(/\/+$/, "");
  const parts = path === "" ? [] : path.slice(1).split("/");
  const n = parts.length;

  let platform: ChannelPlatform;
  let key: string | null;
  if (host === "youtube.com") {
    // /@핸들, 뒤의 탭 경로(/videos 등) 하나는 버린다. /channel/UC… 은 받지 않는다.
    if ((n !== 1 && n !== 2) || !parts[0]!.startsWith("@") || (n === 2 && !/^[a-z]+$/.test(parts[1]!))) return shape;
    platform = "youtube";
    key = percentDecode(parts[0]!.slice(1))?.toLowerCase() ?? null;
  } else if (host === "chzzk.naver.com") {
    if (n === 1) key = parts[0]!.toLowerCase();
    else if (n === 2 && parts[0] === "live") key = parts[1]!.toLowerCase();
    else return shape;
    platform = "chzzk";
  } else if (host === "sooplive.com") {
    if (n !== 2 || parts[0] !== "station") return shape;
    platform = "soop";
    key = parts[1]!.toLowerCase();
  } else if (host === "ch.sooplive.co.kr") {
    if (n !== 1) return shape;
    platform = "soop";
    key = parts[0]!.toLowerCase();
  } else if (host === "instagram.com") {
    if (n !== 1) return shape;
    platform = "instagram";
    key = parts[0]!.toLowerCase();
  } else {
    // 알플레이·틱톡·그 밖의 플랫폼: 규칙을 표에 더하기 전까지 받지 않는다
    return { ok: false, reason: "unsupported" };
  }

  if (key === null || !isValidChannelKey(platform, key)) return shape;
  return { ok: true, channel: { platform, channelKey: key, channelUrl: channelUrlOf(platform, key) } };
}

export function isChannelPlatform(v: string): v is ChannelPlatform {
  return (CHANNEL_PLATFORMS as readonly string[]).includes(v);
}

/**
 * 화면 이름(유튜브·치지직·SOOP·인스타그램) → 플랫폼 코드. 크리에이터 카드의 플랫폼 칸은 승인 때 DB 가 이름으로 적는다.
 * 넷이 아니면(확인 전·옛 값·주소) null.
 */
export function channelPlatformOfLabel(label: string): ChannelPlatform | null {
  const trimmed = label.trim();
  return CHANNEL_PLATFORMS.find((p) => CHANNEL_PLATFORM_LABEL[p] === trimmed) ?? null;
}
