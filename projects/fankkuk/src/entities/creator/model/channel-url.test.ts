import { describe, expect, it } from "vitest";
import { CHANNEL_URL_CASES } from "./channel-url-cases";
import { channelUrlOf, parseChannelUrl, percentDecode } from "./channel-url";

describe("채널 주소 형식 검사 (creator-verification INV-V2)", () => {
  for (const c of CHANNEL_URL_CASES) {
    it(`INV-V2: ${JSON.stringify(c.url.length > 60 ? `${c.url.slice(0, 60)}…` : c.url)} → ${Array.isArray(c.expect) ? c.expect.join(":") : c.expect}`, () => {
      const r = parseChannelUrl(c.url);
      if (Array.isArray(c.expect)) {
        const [platform, key] = c.expect;
        expect(r).toEqual({ ok: true, channel: { platform, channelKey: key, channelUrl: channelUrlOf(platform, key) } });
      } else {
        expect(r).toEqual({ ok: false, reason: c.expect });
      }
    });
  }

  it("INV-V2 S2: 저장할 주소는 보낸 문자열이 아니라 채널 키로 다시 만든 주소다", () => {
    const r = parseChannelUrl("https://m.youtube.com/@GgulDanji/videos?x=1");
    expect(r.ok && r.channel.channelUrl).toBe("https://www.youtube.com/@gguldanji");
  });

  it("INV-V2: % 풀기 — 깨진 꼴·UTF-8 이 아닌 바이트·0 바이트는 null", () => {
    expect(percentDecode("%ED%95%98")).toBe("하");
    expect(percentDecode("%E")).toBeNull();
    expect(percentDecode("%C3%28")).toBeNull();
    expect(percentDecode("a%00b")).toBeNull();
  });
});
