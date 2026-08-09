import { XMLParser } from "fast-xml-parser";

/**
 * RSS·Atom XML → 항목 목록.
 *
 * 여기서는 **모양만 맞춘다.** 무엇을 버릴지는 INV-C3(`parseFeedItem`)이 정한다 —
 * 두 곳에서 버리면 어느 쪽이 버렸는지 알 수 없고, 규칙이 갈라진다.
 *
 * 던지지 않는다: 소스 하나가 이상한 응답을 줬다고 예외가 나면 INV-C4 의 격리가
 * 파이프라인이 아니라 여기서 먼저 무너진다.
 */

export interface RawFeedItem {
  title?: string;
  link?: string;
  pubDate?: string;
  summary?: string;
  contentHtml?: string;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  // 값을 추측해 바꾸지 않는다. 켜 두면 제목 "2026" 이 number 가 되어
  // INV-C3 의 타입 검사에서 멀쩡한 글이 버려진다.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

const text = (v: unknown): string | undefined => {
  if (typeof v === "string") return v;
  // fast-xml-parser 는 속성이 섞인 요소를 객체로 준다 — 본문은 #text 에 들어간다.
  if (v && typeof v === "object" && "#text" in v) {
    const t = (v as { "#text": unknown })["#text"];
    return typeof t === "string" ? t : undefined;
  }
  return undefined;
};

/** Atom 의 링크는 텍스트가 아니라 `href` 속성이다. */
const linkOf = (entry: Record<string, unknown>): string | undefined => {
  const direct = text(entry.link);
  if (direct) return direct;
  const link = entry.link;
  if (Array.isArray(link)) {
    const alt = link.find((l) => typeof l?.["@_href"] === "string");
    return alt?.["@_href"];
  }
  if (link && typeof link === "object" && "@_href" in link) {
    const href = (link as Record<string, unknown>)["@_href"];
    return typeof href === "string" ? href : undefined;
  }
  return undefined;
};

/** 반복 요소가 하나뿐이면 파서가 객체로 준다. 부르는 쪽이 매번 갈리지 않게 여기서 감싼다. */
const asArray = (v: unknown): Record<string, unknown>[] => {
  if (Array.isArray(v)) return v.filter((x) => x && typeof x === "object");
  if (v && typeof v === "object") return [v as Record<string, unknown>];
  return [];
};

export function parseFeedXml(xml: string): RawFeedItem[] {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml) as Record<string, unknown>;
  } catch {
    return [];
  }
  if (!doc || typeof doc !== "object") return [];

  const rss = (doc.rss as Record<string, unknown> | undefined)?.channel;
  const entries = rss
    ? asArray((rss as Record<string, unknown>).item)
    : asArray((doc.feed as Record<string, unknown> | undefined)?.entry);

  return entries.map((e) => ({
    title: text(e.title),
    link: linkOf(e),
    // RSS 는 pubDate, Atom 은 published 또는 updated.
    pubDate: text(e.pubDate) ?? text(e.published) ?? text(e.updated),
    summary: text(e.description) ?? text(e.summary),
    // 본문 전문을 주는 소스만 채운다. 없으면 상세 화면이 요약만 보여 준다.
    contentHtml: text(e["content:encoded"]) ?? text(e.content),
  }));
}
