// 채널 주소 규칙(INV-V2)의 시험 주소 — 유닛 시험(channel-url.test.ts)과 DB 대조 시험(tests/integration/channel-url-parity)이 같이 쓴다.
// expect: 받으면 [플랫폼, 채널 키], 아니면 "unsupported"(1:1 문의) · "shape"(꼴이 틀림).

import type { ChannelPlatform } from "./channel-url";

export type ChannelUrlCase = { url: string; expect: readonly [ChannelPlatform, string] | "unsupported" | "shape" };

export const CHANNEL_URL_CASES: readonly ChannelUrlCase[] = [
  // S2: 표기가 달라도 같은 키
  { url: "https://m.youtube.com/@GgulDanji/videos?x=1", expect: ["youtube", "gguldanji"] },
  { url: "https://www.youtube.com/@gguldanji", expect: ["youtube", "gguldanji"] },
  { url: "https://youtube.com/@gguldanji/", expect: ["youtube", "gguldanji"] },
  { url: "  https://www.youtube.com/@gguldanji#about  ", expect: ["youtube", "gguldanji"] },
  { url: "HTTPS://WWW.YOUTUBE.COM/@Haru", expect: ["youtube", "haru"] },
  { url: "https://www.youtube.com/@%ED%95%98%EB%A3%A8", expect: ["youtube", "하루"] },
  { url: "https://www.youtube.com/@하루", expect: ["youtube", "하루"] },
  { url: "https://www.youtube.com/@a.b·c-d_e", expect: ["youtube", "a.b·c-d_e"] },
  // S2b
  { url: "https://instagram.com/Summer_Night_KO/", expect: ["instagram", "summer_night_ko"] },
  { url: "https://www.instagram.com/mocha.daily", expect: ["instagram", "mocha.daily"] },
  { url: "https://chzzk.naver.com/0123456789ABCDEF0123456789abcdef", expect: ["chzzk", "0123456789abcdef0123456789abcdef"] },
  { url: "https://chzzk.naver.com/live/0123456789abcdef0123456789abcdef", expect: ["chzzk", "0123456789abcdef0123456789abcdef"] },
  { url: "https://www.sooplive.com/station/Boris_01", expect: ["soop", "boris_01"] },
  { url: "https://ch.sooplive.co.kr/boris_01", expect: ["soop", "boris_01"] },
  // S2c: 꼴이 틀림
  { url: "http://www.youtube.com/@gguldanji", expect: "shape" },
  { url: "www.youtube.com/@gguldanji", expect: "shape" },
  { url: "https://www.youtube.com/channel/UCabcdefghijklmnopqrstuv", expect: "shape" },
  { url: "https://www.youtube.com/@gguldanji/Videos", expect: "shape" },
  { url: "https://www.youtube.com/@gguldanji/videos/extra", expect: "shape" },
  { url: "https://www.youtube.com/@ab", expect: "shape" },
  { url: "https://www.youtube.com/@_ab", expect: "shape" },
  { url: "https://www.youtube.com/@%ZZ", expect: "shape" },
  { url: "https://www.youtube.com/@%FF%FE", expect: "shape" },
  { url: "https://www.youtube.com", expect: "shape" },
  { url: "https://user@www.youtube.com/@gguldanji", expect: "shape" },
  { url: "https://www.youtube.com:443/@gguldanji", expect: "shape" },
  { url: "https://chzzk.naver.com/xyz", expect: "shape" },
  { url: "https://chzzk.naver.com/video/0123456789abcdef0123456789abcdef", expect: "shape" },
  { url: "https://www.sooplive.com/boris_01", expect: "shape" },
  { url: "https://www.sooplive.com/station/ab", expect: "shape" },
  { url: "https://www.instagram.com/explore", expect: "shape" },
  { url: "https://www.instagram.com/.mocha", expect: "shape" },
  { url: "https://www.instagram.com/mo..cha", expect: "shape" },
  { url: "https://www.instagram.com/p/abc", expect: "shape" },
  { url: "", expect: "shape" },
  { url: `https://www.youtube.com/@${"a".repeat(300)}`, expect: "shape" },
  // S2c·S2e: 받지 않는 플랫폼
  { url: "https://evil.example/@a", expect: "unsupported" },
  { url: "https://www.tiktok.com/@gguldanji", expect: "unsupported" },
  { url: "https://rplay.live/play/abc", expect: "unsupported" },
  { url: "https://youtu.be/abc", expect: "unsupported" },
  { url: "https://youtube.com.evil.example/@gguldanji", expect: "unsupported" },
];
