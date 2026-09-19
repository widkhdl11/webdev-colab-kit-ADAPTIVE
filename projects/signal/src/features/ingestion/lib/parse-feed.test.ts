import { describe, expect, it } from "vitest";
import { parseFeedXml } from "./parse-feed";

/**
 * RSS/Atom XML → 항목 목록. **여기까지가 XML 파싱이고, 값 검증은 INV-C3 이 따로 한다.**
 * 이 함수의 책임은 "어느 형식이든 같은 모양의 목록으로 만든다"까지다.
 */

const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <title>어느 블로그</title>
  <item>
    <title>첫 글</title>
    <link>https://ex.com/1</link>
    <pubDate>Sat, 09 Aug 2026 09:00:00 +0900</pubDate>
    <description>요약 하나</description>
  </item>
  <item>
    <title>둘째 글</title>
    <link>https://ex.com/2</link>
    <pubDate>Fri, 08 Aug 2026 09:00:00 +0900</pubDate>
    <content:encoded><![CDATA[<p>본문 <b>강조</b></p>]]></content:encoded>
  </item>
</channel></rss>`;

const atom = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>어느 사이트</title>
  <entry>
    <title>아톰 글</title>
    <link href="https://ex.com/atom-1"/>
    <updated>2026-08-09T00:00:00Z</updated>
    <summary>아톰 요약</summary>
  </entry>
</feed>`;

describe("parseFeedXml — RSS", () => {
  it("항목을 순서대로 뽑는다", () => {
    const items = parseFeedXml(rss);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe("첫 글");
    expect(items[0].link).toBe("https://ex.com/1");
    expect(items[0].pubDate).toBe("Sat, 09 Aug 2026 09:00:00 +0900");
    expect(items[0].summary).toBe("요약 하나");
  });

  it("content:encoded 를 본문으로 쓴다 (CDATA 포함)", () => {
    expect(parseFeedXml(rss)[1].contentHtml).toBe("<p>본문 <b>강조</b></p>");
  });

  it("항목이 하나뿐이어도 배열로 준다", () => {
    // XML 파서는 반복 요소가 하나면 객체로 준다 — 여기서 안 감싸면 부르는 쪽이 매번 갈린다.
    const one = rss.replace(/<item>[\s\S]*?<\/item>\s*<item>/, "<item>");
    expect(Array.isArray(parseFeedXml(one))).toBe(true);
    expect(parseFeedXml(one)).toHaveLength(1);
  });
});

describe("parseFeedXml — Atom", () => {
  it("entry 도 같은 모양으로 뽑는다", () => {
    const items = parseFeedXml(atom);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("아톰 글");
    // Atom 의 링크는 텍스트가 아니라 href 속성이다.
    expect(items[0].link).toBe("https://ex.com/atom-1");
    expect(items[0].pubDate).toBe("2026-08-09T00:00:00Z");
    expect(items[0].summary).toBe("아톰 요약");
  });
});

describe("실패 경로 — 던지지 않는다", () => {
  it("빈 문자열·깨진 XML 은 빈 목록", () => {
    // 소스 하나가 이상한 응답을 줬다고 예외가 나면 INV-C4 의 격리가 여기서 무너진다.
    for (const bad of ["", "   ", "<rss><channel>", "이건 XML 이 아니다", "<html><body/></html>"]) {
      expect(() => parseFeedXml(bad), bad).not.toThrow();
      expect(parseFeedXml(bad), bad).toEqual([]);
    }
  });

  it("item 이 없는 정상 XML 도 빈 목록", () => {
    expect(parseFeedXml('<?xml version="1.0"?><rss><channel><title>빈 피드</title></channel></rss>')).toEqual([]);
  });

  it("제목·링크가 없는 항목도 버리지 않고 그대로 넘긴다", () => {
    // 버릴지 말지는 INV-C3(parseFeedItem)이 정한다. 여기서 미리 버리면 판정이 두 곳으로 갈린다.
    const items = parseFeedXml('<rss><channel><item><description>설명뿐</description></item></channel></rss>');
    expect(items).toHaveLength(1);
    expect(items[0].title).toBeUndefined();
  });

  it("숫자로 보이는 제목을 숫자로 바꾸지 않는다", () => {
    // 파서가 값을 추측해 바꾸면 "2026" 같은 제목이 number 가 되어 INV-C3 에서 버려진다.
    const items = parseFeedXml("<rss><channel><item><title>2026</title></item></channel></rss>");
    expect(items[0].title).toBe("2026");
  });
});
