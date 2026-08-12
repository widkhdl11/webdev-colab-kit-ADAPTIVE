import type { Source, SubjectSite } from "./types";

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
// tier 는 content-selection.md 의 "열린 값" 분류를 따른다 — openai.com/blog 는 그 목록에서
// daily 다. hn-frontpage 는 소스 목록 확정(대기 중인 결정 ①)이 끝나면 이 배열 자체가
// 교체될 대상이라 임시로 daily 를 둔다.
export const SOURCES: readonly Source[] = [
  {
    id: "openai-blog",
    name: "OpenAI",
    weight: 1.4,
    feedUrl: "https://openai.com/blog/rss.xml",
    tier: "daily",
  },
  {
    id: "hn-frontpage",
    name: "Hacker News",
    weight: 1.0,
    feedUrl: "https://hnrss.org/frontpage",
    tier: "daily",
  },
];

// 2026-08-09 확인한 응답: openai-blog 200(1115건) · hn-frontpage 200(20건).
// Anthropic 은 공개 RSS 를 못 찾았다 — /news/rss.xml · /rss.xml · /news/rss · /feed.xml ·
// /engineering/rss.xml 전부 404. 주소를 알게 되면 weight 1.6 으로 다시 넣는다.

/** 소스를 못 찾았을 때 쓰는 값. 0 이 아닌 이유는 아래 getSourceWeight 주석 참조. */
export const UNKNOWN_SOURCE_WEIGHT = 1;

/**
 * 공식 발표가 나오는 자리 (content-selection INV-O2·O3 의 "설정").
 *
 * 원문 주소가 여기 맞으면 **모델을 거치지 않고** 공식으로 친다. 소스 목록과 다른 목록이다 —
 * 우리가 수집하지 않는 곳도 들어간다. HN 을 거쳐 들어온 `anthropic.com` 글이 그 경우다.
 *
 * **넣는 기준은 하나다: 그 호스트·경로에 그 주체가 스스로 낸 발표만 있는가.**
 * "모델이 공식이라고 맞혔다"는 기준이 될 수 없다 — 모델을 안 쓰겠다는 목록을
 * 모델의 동의로 넓히는 셈이다. 사람이 글을 올릴 수 있는 곳(포럼·커뮤니티 업로드)은 뺀다:
 * `community.openai.com`, `huggingface.co/<사용자>/…`, `forums.developer.nvidia.com` 이
 * 그래서 없다. 뉴스 매체·개인 블로그도 안 넣는다 — 그쪽은 모델이 `byContent` 로 판단할 몫이다.
 */
export const SUBJECT_SITES: readonly SubjectSite[] = [
  { host: "anthropic.com", pathPrefix: "/news/" },
  { host: "anthropic.com", pathPrefix: "/engineering/" },
  { host: "openai.com", pathPrefix: "/index/" },
  { host: "openai.com", pathPrefix: "/blog/" },
  // 회사가 직접 쓰는 발표 호스트 — 사용자 업로드 경로가 없어 호스트 전체를 연다.
  { host: "blog.google" },
  { host: "ai.google" },
  { host: "deepmind.google" },
  { host: "blogs.microsoft.com" },
  { host: "ai.meta.com" },
  { host: "blogs.nvidia.com" },
  { host: "mistral.ai", pathPrefix: "/news/" },
  { host: "clickhouse.com", pathPrefix: "/blog/" },
];
