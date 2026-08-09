import type { Source } from "./types";

/**
 * 소스 목록 — ingestion-ranking 의 "설정파일"이 이 파일이다.
 *
 * MVP 에 소스 관리 화면은 없다(PRODUCT 비범위). 소스를 늘리거나 weight 를 조정하려면
 * 여기를 고치고 배포한다. DB 에 두지 않는 이유는 INV-R4 와 같다 — 소스에 귀속하는 값이
 * 항목 쪽에 흩어지면 어느 것이 진짜인지 알 수 없어진다.
 *
 * weight 의 뜻: 1.0 을 기준으로 한 배수다. 시간감쇠에 곱해지므로(INV-R2),
 * weight 2.0 인 소스의 글은 같은 시각의 weight 1.0 글보다 정확히 두 배 점수를 받는다.
 */
export const SOURCES: readonly Source[] = [
  {
    id: "openai-blog",
    name: "OpenAI",
    weight: 1.4,
    feedUrl: "https://openai.com/blog/rss.xml",
  },
  {
    id: "hn-frontpage",
    name: "Hacker News",
    weight: 1.0,
    feedUrl: "https://hnrss.org/frontpage",
  },
];

// 2026-08-09 확인한 응답: openai-blog 200(1115건) · hn-frontpage 200(20건).
// Anthropic 은 공개 RSS 를 못 찾았다 — /news/rss.xml · /rss.xml · /news/rss · /feed.xml ·
// /engineering/rss.xml 전부 404. 주소를 알게 되면 weight 1.6 으로 다시 넣는다.

/** 소스를 못 찾았을 때 쓰는 값. 0 이 아닌 이유는 아래 getSourceWeight 주석 참조. */
export const UNKNOWN_SOURCE_WEIGHT = 1;
