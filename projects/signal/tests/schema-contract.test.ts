import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 마이그레이션 SQL 이 스펙대로 생겼는지 — INV-C1 · R1 · T1 · T2.
 *
 * **이건 통합 테스트가 아니다.** 네트워크에 안 붙고 파일만 읽으므로 기본 `npm test` 에서 돈다.
 * 실제 DB 에서 제약이 작동하는지는 tests/integration/ 이 본다(그쪽은 Supabase 가 있어야 돈다).
 *
 * 왜 SQL 텍스트를 보나: 이 불변식들의 강제 위치가 애플리케이션이 아니라 **DB 제약**이다.
 * 가짜 저장소로 확인하면 "우리 fake 가 unique 를 흉내낸다"를 검증하는 셈이라 알리바이가 된다.
 */

// import.meta.url 을 쓰지 않는다 — jsdom 환경에서는 file: URL 이 아니라 던진다.
// vitest 는 프로젝트 루트를 cwd 로 잡는다(vitest.config.ts 위치 기준).
const sql = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0001_init.sql"),
  "utf8",
);

/** 주석을 뺀 본문. 주석에 적힌 단어가 제약으로 오인되지 않게. */
const body = sql
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")
  .toLowerCase();

describe("0001_init.sql — INV-C1 유일성은 canonical_url", () => {
  it("INV-C1 (S1): canonical_url 에 unique 제약이 있다", () => {
    expect(body).toMatch(/canonical_url\s+text\s+not\s+null\s+unique/);
  });

  it("INV-C1: original_url 에는 unique 를 걸지 않는다", () => {
    // 추적 파라미터만 다른 두 주소가 들어오면 원본은 서로 다르다.
    // 여기에 unique 를 걸면 정규화가 합쳐 준 것을 DB 가 다시 거절한다.
    expect(body).not.toMatch(/original_url[^,]*unique/);
  });
});

describe("0001_init.sql — INV-R1 점수는 저장하지 않는다", () => {
  it("INV-R1 (S6): 점수 컬럼이 없다", () => {
    expect(body).not.toMatch(/^\s*score\b/m);
    expect(body).not.toMatch(/\brank_score\b/);
  });

  it("INV-R1 (S6): '뜨는 중' 컬럼도 없다 (INV-R5 파생값)", () => {
    expect(body).not.toMatch(/\bis_trending\b/);
  });
});

describe("0001_init.sql — INV-C5 시각은 타임존까지 담는 타입으로", () => {
  it("INV-C5: published_at 이 timestamptz 다", () => {
    expect(body).toMatch(/published_at\s+timestamptz\s+not\s+null/);
    // timestamp(무존)로 두면 값이 어느 존인지 알 수 없어 타임존이 섞인다.
    expect(body).not.toMatch(/published_at\s+timestamp\s/);
  });

  it("INV-C5: 대체 여부를 남기는 자리가 있다", () => {
    expect(body).toMatch(/published_at_is_fallback\s+boolean\s+not\s+null/);
  });
});

describe("0001_init.sql — INV-S2·S3 요약은 비어 있을 수 있다", () => {
  it("INV-S2: summary 에 not null 을 걸지 않는다", () => {
    // not null 이면 생성 실패 항목을 아예 적재할 수 없어 수집이 멈춘다.
    expect(body).not.toMatch(/summary\s+text\s+not\s+null/);
    expect(body).toMatch(/^\s*summary\s+text,?\s*$/m);
  });
});

describe("0001_init.sql — INV-T1·T2 태그", () => {
  it("INV-T1 (S14): 항목↔태그가 조인 테이블이다", () => {
    expect(body).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.item_tag/);
    expect(body).toMatch(/primary\s+key\s*\(\s*item_id\s*,\s*tag_id\s*\)/);
  });

  it("INV-T1: 항목에 태그 단일 필드를 두지 않는다", () => {
    // 필드로 두면 항목당 태그가 하나뿐이라 다중 태그 필터가 붕괴한다.
    expect(body).not.toMatch(/^\s*tag\s+text/m);
    expect(body).not.toMatch(/^\s*tag_name\s+text/m);
  });

  it("INV-T2 (S15): 정규화된 태그명에 unique 가 있다", () => {
    expect(body).toMatch(/normalized_name\s+text\s+not\s+null\s+unique/);
  });

  it("INV-T2: 표시용 name 에는 unique 를 걸지 않는다", () => {
    expect(body).not.toMatch(/^\s*name\s+text[^,]*unique/m);
  });
});

describe("0001_init.sql — 쓰기는 열지 않는다 (INV-S4 인접)", () => {
  it("세 테이블 모두 RLS 가 켜져 있다", () => {
    for (const table of ["item", "tag", "item_tag"]) {
      expect(body).toMatch(
        new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`),
      );
    }
  });

  it("insert·update·delete 정책이 없다 — publishable 키로는 못 쓴다", () => {
    expect(body).not.toMatch(/for\s+(insert|update|delete|all)\b/);
  });
});

const sql2 = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0002_source_excerpt.sql"),
  "utf8",
);
const body2 = sql2
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")
  .toLowerCase();

describe("0002_source_excerpt.sql — INV-S2 출처 요약글", () => {
  it("INV-S2: source_excerpt 컬럼을 추가한다", () => {
    expect(body2).toMatch(/add\s+column\s+if\s+not\s+exists\s+source_excerpt\s+text/);
  });

  it("INV-S2: not null 을 걸지 않는다", () => {
    // 요약글을 안 주는 출처가 있다(HN). not null 이면 그 항목을 아예 적재할 수 없다.
    expect(body2).not.toMatch(/source_excerpt\s+text\s+not\s+null/);
  });

  it("INV-S3: 요약 후보 인덱스가 '근거가 있는' 것만 고른다", () => {
    // 근거 없는 항목을 후보에 남기면 매 주기 실패만 반복한다.
    expect(body2).toMatch(/where\s+summary\s+is\s+null/);
    expect(body2).toMatch(/content_html\s*<>\s*''\s*or\s+source_excerpt\s+is\s+not\s+null/);
  });

  it("기존 테이블을 다시 만들지 않는다 (적용해도 데이터가 안 날아간다)", () => {
    expect(body2).not.toMatch(/create\s+table/);
    expect(body2).not.toMatch(/drop\s+/);
  });
});

const sql0003 = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0003_title_ko.sql"),
  "utf8",
);
const body0003 = sql0003
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")
  .toLowerCase();

describe("0003_title_ko.sql — INV-S6 제목 번역", () => {
  it("INV-S6 (S23): 번역문은 title 과 **다른 컬럼**이다", () => {
    expect(body0003).toMatch(/add column if not exists title_ko/);
    // title 을 바꾸는 문장이 있으면 원문을 덮는다는 뜻이다 — 그게 INV-S6 위반이다.
    // `set` 바로 뒤만 보면 `set summary = null, title = title_ko` 를 놓친다.
    // `title_ko =` 는 밑줄 때문에 이 정규식에 안 걸린다.
    expect(body0003).not.toMatch(/(^|[\s,(])title\s*=/m);
    expect(body0003).not.toMatch(/alter column title\b/);
  });

  it("INV-S6 (S24): 번역 후보 인덱스는 근거 조건을 걸지 않는다", () => {
    // 요약 인덱스(0002)와 갈리는 지점이다. 여기에 content_html/source_excerpt 조건을 넣으면
    // 본문도 요약글도 없는 항목이 영어 제목으로 영영 남는다.
    const idx = body0003.slice(body0003.indexOf("item_untranslated_idx"));
    const stmt = idx.slice(0, idx.indexOf(";"));
    expect(stmt).toMatch(/where\s+title_ko is null/);
    expect(stmt).not.toMatch(/content_html/);
    expect(stmt).not.toMatch(/source_excerpt/);
  });

  it("마이그레이션에 조건 없는 파괴적 문장이 없다 (재실행 안전)", () => {
    // 이 스크립트는 이름을 안 주면 폴더의 .sql 을 전부 다시 적용한다. 조건 없는
    // UPDATE/DELETE 가 파일에 남아 있으면 다음에 전부 돌리는 순간 데이터가 날아간다.
    // 요약 초기화는 2026-08-10 에 손으로 한 번 실행했고 주석으로만 남겼다.
    const destructive = body0003.match(/^\s*(update|delete)\s[\s\S]*?;/gm) ?? [];
    expect(destructive).toEqual([]);
  });
});
