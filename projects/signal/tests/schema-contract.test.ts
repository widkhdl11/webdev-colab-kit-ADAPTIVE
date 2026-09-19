import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
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
  it("INV-DA1 (S1): 세 테이블 모두 RLS 가 켜져 있다", () => {
    for (const table of ["item", "tag", "item_tag"]) {
      expect(body).toMatch(
        new RegExp(`alter\\s+table\\s+public\\.${table}\\s+enable\\s+row\\s+level\\s+security`),
      );
    }
  });

  it("INV-DA2 (S3, 실패경로): 이 파일에 쓰기 정책이 없다 — publishable 키로는 못 쓴다", () => {
    expect(body).not.toMatch(/for\s+(insert|update|delete|all)\b/);
  });
});

// ── INV-DA1·DA2 — 마이그레이션 **전체**를 한 자리에서 본다 ────────────────
//
// 2026-09-19 테스트 감사 지적 셋을 한 묶음으로 닫는다. 셋 다 원인이 같았다 —
// 검사가 파일을 이름으로 하나씩 읽어서, 검사를 안 받는 파일이 다섯 개였고 새 파일은
// 언제나 검사 밖에서 시작했다.
//
//   ① 0002~0004 는 쓰기 정책 검사를 한 번도 안 받았다. 0008 도 마찬가지였을 것이다.
//   ② `for` 절 없는 `create policy ... using (true)` 는 Postgres 에서 FOR ALL 이다.
//      `for (insert|update|delete|all)` 만 찾는 정규식은 그 형태에 침묵한다.
//      (이 함정은 ingest_run 쪽에서 2026-08-17 에 이미 한 번 잡혔는데 여기만 옛 모양이었다)
//   ③ 뒤 마이그레이션이 RLS 를 **끄는** 것을 아무도 안 봤다. `not.toMatch(/drop\s+/)` 는
//      `disable` 을 안 잡는다. 꺼지면 INV-DA2 가 막던 것보다 넓게 뚫린다.
//
// 판정을 **순수 함수로** 뺀 이유: 진짜 파일만 먹이면 「위반 0건」과 「검사가 안 돌았다」가
// 겉이 같다. 아래에서 세 위반을 하나씩 심어 각각 빨간불이 나는 것을 본다.

const MIGRATION_DIR = resolve(process.cwd(), "supabase/migrations");
const migrationFiles = readdirSync(MIGRATION_DIR).filter((f) => f.endsWith(".sql")).sort();

/** 주석을 뺀 본문. 주석에 적힌 단어가 제약으로 오인되지 않게. */
const withoutComments = (text: string) =>
  text
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .toLowerCase();

/**
 * 행 수준 접근 정책 위반을 센다. 빈 배열이면 통과.
 * 입력은 마이그레이션 SQL 본문(주석 제거·소문자)이다.
 */
export function policyViolations(sqlText: string): string[] {
  const out: string[] = [];
  if (/for\s+(insert|update|delete|all)\b/.test(sqlText)) out.push("쓰기 정책(for insert·update·delete·all)");
  // `for` 절이 없는 정책은 FOR ALL 이다 — 문장 단위로 보고 `for select` 가 아닌 것을 찾는다.
  for (const stmt of sqlText.match(/create\s+policy[\s\S]*?;/g) ?? []) {
    if (!/\bfor\s+select\b/.test(stmt)) out.push(`읽기 전용이 아닌 정책: ${stmt.trim().slice(0, 60)}`);
  }
  if (/disable\s+row\s+level\s+security/.test(sqlText)) out.push("행 수준 접근 제어를 끄는 문장");
  return out;
}

describe("마이그레이션 전체 — INV-DA1·DA2 는 파일 하나의 약속이 아니다", () => {
  const all = migrationFiles.map((f) => withoutComments(readFileSync(join(MIGRATION_DIR, f), "utf8"))).join("\n");

  it("훑은 파일이 실제로 있다 — 0개면 아래 항목들이 공허하게 통과한다", () => {
    expect(migrationFiles.length).toBeGreaterThanOrEqual(7);
    expect(all).toContain("create table if not exists public.item");
  });

  it("INV-DA1·DA2 (S3, 실패경로): 어느 파일에도 위반이 없다", () => {
    expect(policyViolations(all)).toEqual([]);
  });

  it("INV-DA1: 정책은 셋뿐이고 전부 읽기다", () => {
    const policies = all.match(/create\s+policy[\s\S]*?;/g) ?? [];
    expect(policies).toHaveLength(3);
    for (const p of policies) expect(p).toMatch(/\bfor\s+select\b/);
  });

  // ── 심은 위반 셋. 이름표를 따로 단다 — 하나로 묶으면 한 갈래만 붙들려 있어도 만점이 된다.
  it("프로브(쓰기 정책): for insert 를 심으면 잡는다", () => {
    expect(policyViolations(`${all}\ncreate policy "x" on public.item for insert with check (true);`))
      .toContain("쓰기 정책(for insert·update·delete·all)");
  });

  it("프로브(FOR 없는 정책): for 절 없는 정책을 심으면 잡는다 — 그것이 FOR ALL 이다", () => {
    const planted = policyViolations(`${all}\ncreate policy "x" on public.item using (true);`);
    expect(planted.some((v) => v.startsWith("읽기 전용이 아닌 정책"))).toBe(true);
  });

  it("프로브(제어 끄기): disable row level security 를 심으면 잡는다", () => {
    expect(policyViolations(`${all}\nalter table public.item disable row level security;`))
      .toContain("행 수준 접근 제어를 끄는 문장");
  });

  it("프로브(정상은 안 잡는다): 읽기 정책만 있으면 위반이 아니다 — 판정이 전부를 잡는 것이 아니다", () => {
    expect(policyViolations('create policy "읽기" on public.item for select using (true);')).toEqual([]);
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

const sql0004 = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0004_official_basis.sql"),
  "utf8",
);
const body0004 = sql0004
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")
  .toLowerCase();

describe("0004_official_basis.sql — INV-O2 공식 여부의 근거", () => {
  it("INV-O2: 근거를 담는 컬럼이 있고 기본값은 none 이다", () => {
    // 기본값이 없으면 기존 101건이 null 이 되고, 그때 화면이 그리는 것은
    // "판단 못 함"이 아니라 undefined 다.
    expect(body0004).toMatch(/add column if not exists official_basis text/);
    expect(body0004).toMatch(/default 'none'/);
  });

  it("INV-O2: 세 값 밖은 DB 가 막는다", () => {
    // 앱 경계(row.ts)도 모르는 값을 none 으로 떨어뜨리지만 그건 읽는 쪽 방어라,
    // 잘못된 값이 **들어가는** 것 자체는 못 막는다.
    const check = body0004.slice(body0004.indexOf("add constraint"));
    expect(check).toMatch(/check\s*\(official_basis in \('none', 'byurl', 'bycontent'\)\)/);
  });

  it("INV-O2: boolean 한 칸으로 합치지 않는다", () => {
    // is_official 같은 칸이 생기면 모델 판단과 주소 근거가 같은 값이 된다 — 그게 이 스펙이 막는 것이다.
    expect(body0004).not.toMatch(/is_official/);
  });

  it("다시 적용해도 안전하다 (--all 로 전부 돌릴 때)", () => {
    // add constraint 는 if not exists 를 지원하지 않아, drop 이 앞에 없으면 두 번째 실행에서 죽는다.
    expect(body0004.indexOf("drop constraint if exists")).toBeLessThan(
      body0004.indexOf("add constraint"),
    );
    const destructive = body0004.match(/^\s*(update|delete)\s[\s\S]*?;/gm) ?? [];
    expect(destructive).toEqual([]);
  });
});

const sql0005 = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0005_ingest_run.sql"),
  "utf8",
);
const body0005 = sql0005
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n")
  .toLowerCase();

describe("0005_ingest_run.sql — 수집 실행 이력", () => {
  it("ingest_run 테이블을 만든다", () => {
    expect(body0005).toMatch(/create\s+table\s+if\s+not\s+exists\s+public\.ingest_run/);
  });

  // 라벨을 붙인다(2026-09-19). INV-DA3 을 참조하던 검사가 통합 테스트 파일에만 있었는데,
  // 그 파일은 기본 실행에서 빠진다 — 커버리지는 「검사 1개 있음」인데 그 검사는 한 번도 안 돌았다.
  // 이 검사는 내용상 이미 같은 조항을 붙들고 있었고 기본 실행에서 돈다.
  it("INV-DA3 (S5, 실패경로): RLS 는 켜지만 select 정책은 없다 — publishable 키로는 못 읽는다", () => {
    expect(body0005).toMatch(
      /alter\s+table\s+public\.ingest_run\s+enable\s+row\s+level\s+security/,
    );
    // `for` 절 없이 `create policy ... using (true)` 만 써도 정책이 생긴다 — Postgres 는
    // FOR 를 생략하면 기본 FOR ALL 이다. "for select|insert|..." 만 찾으면 이 형태를 놓친다
    // (2026-08-17 test-audit 지적) — ingest_run 을 대상으로 한 정책 자체가 없어야 한다.
    expect(body0005).not.toMatch(/create\s+policy[^;]*\bingest_run\b/);
  });

  it("item 에 last_ingest_run_id 컬럼을 추가한다", () => {
    expect(body0005).toMatch(/add\s+column\s+if\s+not\s+exists\s+last_ingest_run_id\s+uuid/);
  });

  it("기존 테이블을 다시 만들지 않는다 (적용해도 데이터가 안 날아간다)", () => {
    expect(body0005).not.toMatch(/drop\s+/);
  });

  it("마이그레이션에 조건 없는 파괴적 문장이 없다 (재실행 안전)", () => {
    const destructive = body0005.match(/^\s*(update|delete)\s[\s\S]*?;/gm) ?? [];
    expect(destructive).toEqual([]);
  });
});

/**
 * 0006 · 0007 — 뱃지 키워드 (2026-08-31 신설).
 *
 * **이 두 파일은 2026-08-31 리뷰 전까지 이 검사를 하나도 안 받고 있었다.** 그동안
 * 0006 의 `update ... where normalized_name in (...)` 와 0007 의 `delete ... where axis='legacy'`
 * 가 파일에 남아 있었고, 둘이 `--all` 재적용에서 연쇄해 **지금 쓰는 키워드 태그와 `item_tag`
 * 연결을 지우는** 상태였다(security-reviewer·code-reviewer 독립 지적).
 *
 * 앞선 파일들과 달리 "조건 **없는**" 이 아니라 **`update`/`delete` 문 자체가 없어야** 한다 —
 * 0007 의 delete 에는 `where` 가 있었으므로 기존 정규식은 그것을 못 잡았다.
 */
const readBody = (name: string) =>
  readFileSync(resolve(process.cwd(), `supabase/migrations/${name}`), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .toLowerCase();

const body0006 = readBody("0006_tag_axis.sql");
const body0007 = readBody("0007_keywords_at.sql");

describe("0006_tag_axis.sql — INV-B1 축", () => {
  it("tag 에 axis 컬럼을 더하고 값 셋으로 막는다", () => {
    expect(body0006).toMatch(/add column if not exists axis text/);
    expect(body0006).toMatch(/check \(axis in \('field', 'kind', 'legacy'\)\)/);
  });

  it("기존 테이블을 다시 만들지 않는다", () => {
    expect(body0006).not.toMatch(/drop\s+table/);
  });

  it("데이터를 건드리는 문장이 **아예** 없다 (재실행 안전)", () => {
    // `where` 가 붙어 있어도 안 된다 — 그 조건이 참이 되는 행 집합이 시간이 지나며 바뀐다.
    // 여기 있던 update 가 정확히 그랬다(2026-08-31 에 주석으로 내렸다).
    expect(body0006.match(/^\s*(update|delete|truncate)\s[\s\S]*?;/gm) ?? []).toEqual([]);
  });
});

describe("0007_keywords_at.sql — INV-K1 재시도 신호", () => {
  it("item 에 keywords_at 컬럼을 더한다", () => {
    expect(body0007).toMatch(/add column if not exists keywords_at timestamptz/);
  });

  it("후보 인덱스는 `keywords_at is null` 만 본다", () => {
    // 여기에 다른 조건을 걸면 "짚이는 게 없다"고 답한 글이 후보에서 새는 자리가 생긴다.
    const idx = body0007.slice(body0007.indexOf("item_missing_keywords_idx"));
    const stmt = idx.slice(0, idx.indexOf(";"));
    expect(stmt).toMatch(/where\s+keywords_at is null/);
  });

  it("데이터를 건드리는 문장이 **아예** 없다 (재실행 안전)", () => {
    expect(body0007.match(/^\s*(update|delete|truncate)\s[\s\S]*?;/gm) ?? []).toEqual([]);
  });

  it("정책을 새로 열지 않는다 — tag·item_tag 는 0001 의 select 정책 그대로다", () => {
    expect(body0006).not.toMatch(/create\s+policy/);
    expect(body0007).not.toMatch(/create\s+policy/);
  });
});
