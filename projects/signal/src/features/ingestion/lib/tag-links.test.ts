import { describe, expect, it } from "vitest";
import { normalizeTagName } from "@/entities/article";
import {
  batchAxisEntries,
  itemTagLinks,
  tagIdByNormalized,
  tagUpsertRows,
} from "./tag-links";

/**
 * INV-K1: 같은 이름이 다시 나오면 **새 행을 만들지 않고 기존 행에 연결한다.**
 *
 * DB 의 unique(normalized_name) 가 최종 강제 지점이지만, 코드가 **같은 키로 찾아야**
 * 그 제약이 뜻을 갖는다. 여기서 재는 것이 그 부분이다.
 *
 * 이 파일이 생긴 이유(2026-08-27): `api/ports.ts` 의 `tagIdsByName` 이 DB 가 돌려준
 * **이름**으로 지도를 만들고, 붙일 때는 **모델이 준 원래 표기**로 찾고 있었다.
 * 표기가 갈리면 DB 는 한 행으로 합쳐 한쪽 이름만 돌려주므로 **다른 쪽은 조용히 못 찾는다** —
 * 리포트에는 성공으로 남고 그 키워드만 안 붙는다. `server-only` 파일 안에 있어서
 * 유닛 테스트가 한 번도 로드하지 않았고, 그래서 아무도 못 봤다.
 */

/** DB 가 돌려주는 모양(정규화 키로 이미 합쳐진 뒤) */
function dbReturns(rows: { name: string; id: string }[]) {
  return tagIdByNormalized(rows);
}

/** 축을 붙이는 잡음을 줄인다 — 이 헬퍼가 없으면 아래 표가 축 이야기로 뒤덮인다. */
const asFields = (...names: string[]) => names.map((name) => ({ name, axis: "field" as const }));

describe("tagUpsertRows — INV-K1 새 행을 만들지 않는다", () => {
  it("표기가 달라도 정규화 키가 같으면 행이 하나다", () => {
    // 대소문자(MCP/mcp) · 하이픈(온-디바이스/온_디바이스) · 연속 공백.
    // 행이 둘 나가면 DB 가 unique 로 막고, 막히지 않았다면 같은 말이 두 행이 된다.
    expect(tagUpsertRows(asFields("MCP", "mcp"))).toHaveLength(1);
    expect(tagUpsertRows(asFields("온-디바이스", "온_디바이스"))).toHaveLength(1);
    expect(tagUpsertRows(asFields("AI 모델", "AI  모델"))).toHaveLength(1);
  });

  it("처음 나온 표기를 이름으로 쓴다 — 화면에 그 표기가 남는다", () => {
    expect(tagUpsertRows(asFields("온-디바이스", "온_디바이스"))).toEqual([
      { name: "온-디바이스", normalized_name: "온 디바이스", axis: "field" },
    ]);
  });

  it("서로 다른 말은 합치지 않는다 — 접는 쪽만 보면 전부 하나로 만들어도 통과한다", () => {
    expect(tagUpsertRows(asFields("보안", "코딩", "출시"))).toHaveLength(3);
  });

  it("정규화하면 빈 값이 되는 것은 안 올린다", () => {
    // 올리면 이름 없는 행이 생기고, 그 뒤로 모든 빈 값이 거기 붙는다.
    expect(tagUpsertRows(asFields(" - _ ", "", "  "))).toEqual([]);
  });

  it("normalized_name 은 normalizeTagName 이 만든 값 그대로다", () => {
    // 여기서 다른 값을 만들면 DB 유일성 기준과 갈려 같은 말이 두 행이 된다.
    for (const name of ["MCP", "온-디바이스", "AI  모델", "에이전트"]) {
      const [row] = tagUpsertRows(asFields(name));
      expect(row.normalized_name).toBe(normalizeTagName(name));
    }
  });
});

describe("tagUpsertRows — INV-B1 축을 같이 올린다", () => {
  it("사건종류는 kind 로 나간다", () => {
    // `tag.axis` 의 DB 기본값이 `field` 다. 안 실어 보내면 **사건종류가 분야로 저장되고**,
    // 화면에서 두 축이 색으로 갈리지 않는다(design-rules 2026-08-27). 조용히 틀리는 자리다.
    expect(tagUpsertRows([{ name: "출시", axis: "kind" }])).toEqual([
      { name: "출시", normalized_name: "출시", axis: "kind" },
    ]);
  });

  it("두 축을 한 번에 올려도 각자의 축을 지킨다", () => {
    const rows = tagUpsertRows([
      { name: "보안", axis: "field" },
      { name: "사건사고", axis: "kind" },
    ]);
    expect(rows).toEqual([
      { name: "보안", normalized_name: "보안", axis: "field" },
      { name: "사건사고", normalized_name: "사건사고", axis: "kind" },
    ]);
  });

  it("같은 말이 두 축에 다 나오면 **먼저 온 축**으로 한 행만 만든다", () => {
    // `normalized_name` 이 unique 라 한 행뿐이다. 두 행을 만들려 들면 upsert 가
    // "ON CONFLICT DO UPDATE command cannot affect row a second time" 으로 거절해
    // **그 주기의 태그가 통째로 안 붙는다.** 부르는 쪽이 분야를 먼저 넘긴다.
    expect(
      tagUpsertRows([
        { name: "보안", axis: "field" },
        { name: "보안", axis: "kind" },
      ]),
    ).toEqual([{ name: "보안", normalized_name: "보안", axis: "field" }]);
  });
});

describe("itemTagLinks — INV-K1 기존 행에 연결한다", () => {
  it("표기가 갈린 두 글이 **같은 tag_id** 에 붙는다", () => {
    // 이게 이 파일이 잡으려는 버그다. DB 는 한 행(`MCP`)만 돌려주는데
    // 두 번째 글은 `mcp` 로 찾는다 — 이름으로 찾으면 여기서 링크가 사라진다.
    const idMap = dbReturns([{ name: "MCP", id: "tag-1" }]);
    const links = itemTagLinks(
      [
        { itemId: "a", tags: ["MCP"] },
        { itemId: "b", tags: ["mcp"] },
      ],
      idMap,
    );
    expect(links).toEqual([
      { item_id: "a", tag_id: "tag-1" },
      { item_id: "b", tag_id: "tag-1" },
    ]);
  });

  it("한 글에 같은 태그를 두 번 연결하지 않는다", () => {
    // `item_tag` 는 (item_id, tag_id) 가 기본키다. 두 번 넣으려 들면
    // **그 글의 키워드가 하나도 안 붙는다.**
    const idMap = dbReturns([{ name: "온-디바이스", id: "tag-1" }]);
    const links = itemTagLinks(
      [{ itemId: "a", tags: ["온-디바이스", "온_디바이스"] }],
      idMap,
    );
    expect(links).toEqual([{ item_id: "a", tag_id: "tag-1" }]);
  });

  it("지도에 없는 이름은 건너뛴다 — 링크를 만들지 않는다", () => {
    const idMap = dbReturns([{ name: "보안", id: "tag-1" }]);
    expect(itemTagLinks([{ itemId: "a", tags: ["코딩"] }], idMap)).toEqual([]);
  });

  it("정상 경로: 여러 글 × 여러 태그가 전부 붙는다", () => {
    // 걸러내는 쪽만 보면 전부 걸러도 통과한다.
    const idMap = dbReturns([
      { name: "보안", id: "t1" },
      { name: "코딩", id: "t2" },
    ]);
    const links = itemTagLinks(
      [
        { itemId: "a", tags: ["보안", "코딩"] },
        { itemId: "b", tags: ["코딩"] },
      ],
      idMap,
    );
    expect(links).toHaveLength(3);
  });
});

describe("tagIdByNormalized — INV-K1 찾는 키가 저장 키와 같다", () => {
  it("DB 가 돌려준 이름을 정규화해 키로 쓴다", () => {
    const map = tagIdByNormalized([{ name: "AI  모델", id: "t1" }]);
    expect(map.get(normalizeTagName("ai 모델"))).toBe("t1");
    // 원래 표기 그대로는 키가 아니다 — 이름으로 찾던 옛 방식이 되살아나면 여기서 걸린다.
    expect(map.has("AI  모델")).toBe(false);
  });
});

/**
 * `batchAxisEntries` — INV-B1 축이 배치 안에서 뒤집히지 않는다 (2026-08-31 신설).
 *
 * 위 `tagUpsertRows` 의 "먼저 온 축이 이긴다"는 **부르는 쪽이 분야를 먼저 넘긴다**를 전제로 한다.
 * 그 전제를 만드는 것이 이 함수인데, 2026-08-31 감사 전까지 그 순서를 정하는 코드가
 * `server-only` 파일에 있어서 **어떤 순서로 바꿔도 전 스위트가 green** 이었다.
 */
describe("batchAxisEntries — 배치 전체의 분야가 먼저다 (INV-B1)", () => {
  it("한 글 안에서는 분야 → 사건종류 순이다", () => {
    expect(batchAxisEntries([{ fields: ["코딩"], kinds: ["출시"] }])).toEqual([
      { name: "코딩", axis: "field" },
      { name: "출시", axis: "kind" },
    ]);
  });

  it("**앞 글의 사건종류가 뒤 글의 분야를 이기지 않는다**", () => {
    // 글 단위로 펴면 `[보안(kind), 코딩(field), 보안(field)]` 이 되어 kind 가 먼저 온다.
    // 배치 단위로 펴야 분야가 전부 앞에 선다.
    const entries = batchAxisEntries([
      { fields: [], kinds: ["보안"] }, // 1번 글: 사건종류로 냈다
      { fields: ["보안"], kinds: [] }, // 5번 글: 같은 말을 분야로 냈다
    ]);
    expect(entries[0]).toEqual({ name: "보안", axis: "field" });
  });

  it("그래서 저장까지 가면 `보안` 은 분야로 남는다 — 두 함수를 이어서 본다", () => {
    // 한쪽만 보면 순서가 뒤집혀도 `tagUpsertRows` 쪽 테스트는 그대로 통과한다.
    const rows = tagUpsertRows(
      batchAxisEntries([
        { fields: [], kinds: ["보안"] },
        { fields: ["보안"], kinds: [] },
      ]),
    );
    expect(rows).toEqual([{ name: "보안", normalized_name: "보안", axis: "field" }]);
  });

  it("겹치지 않는 말은 각자의 축을 그대로 지킨다", () => {
    const rows = tagUpsertRows(
      batchAxisEntries([
        { fields: ["코딩"], kinds: ["출시"] },
        { fields: ["로봇"], kinds: ["소송"] },
      ]),
    );
    expect(rows.map((r) => [r.name, r.axis])).toEqual([
      ["코딩", "field"],
      ["로봇", "field"],
      ["출시", "kind"],
      ["소송", "kind"],
    ]);
  });

  it("빈 배치는 빈 배열", () => {
    expect(batchAxisEntries([])).toEqual([]);
  });
});
