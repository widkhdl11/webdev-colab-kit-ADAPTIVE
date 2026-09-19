import { normalizeTagName, type TagAxis } from "@/entities/article";

/**
 * 태그 저장·연결의 순수 부분 — INV-K1(같은 이름이면 새 행을 만들지 않고 기존 행에 연결한다).
 *
 * **왜 어댑터에서 뺐나** (2026-08-27): 이 계산이 `api/ports.ts` 안에 인라인으로 있었는데
 * 그 파일은 `server-only` 라 **유닛 테스트가 한 번도 로드하지 않는다.** 그 안에서
 * 지도를 DB 가 돌려준 **이름**으로 만들고 붙일 때는 **모델이 준 원래 표기**로 찾고 있었다.
 * 표기가 갈리면(`온-디바이스` / `온_디바이스`) DB 는 정규화 키로 한 행에 합쳐 한쪽 이름만
 * 돌려주므로 **다른 쪽은 조용히 못 찾는다** — 리포트에는 성공으로 남고 그 키워드만 안 붙는다.
 * 예산 상수를 `server-only` 밖으로 내린 것과 같은 이유다(2026-08-13).
 *
 * 규칙은 하나다: **찾는 키와 저장 키가 같아야 한다.** 둘 다 `normalizeTagName` 이 만든다.
 */

export interface TagUpsertRow {
  /** 화면에 쓰는 표기. 같은 뜻이 여럿이면 **처음 나온 것**을 쓴다. */
  name: string;
  /** DB unique 가 유일성을 판정하는 값 (INV-T2). */
  normalized_name: string;
  /**
   * 분야인가 사건종류인가 (INV-B1).
   *
   * **반드시 실어 보낸다.** `tag.axis` 의 DB 기본값이 `field` 라, 빼면 사건종류가
   * 분야로 저장되고 화면에서 두 축이 색으로 안 갈린다(design-rules 2026-08-27).
   * 저장은 성공하므로 리포트에는 아무 흔적이 없다.
   */
  axis: TagAxis;
}

/** 모델이 준 키워드 하나 — 이름과 그것이 나온 축. */
export interface TagEntry {
  name: string;
  axis: TagAxis;
}

export interface ItemTagLink {
  item_id: string;
  tag_id: string;
}

/**
 * 한 배치의 글들 → `tagUpsertRows` 에 넘길 순서로 편다.
 *
 * **배치 전체의 분야를 먼저, 그다음 배치 전체의 사건종류.** 글 단위로 `[분야, 사건종류]` 를
 * 이어 붙이면(`pairs.flatMap(글별펴기)`) 결과가 `[A분야, A사건종류, B분야, …]` 가 되어,
 * **앞 글의 사건종류가 뒤 글의 분야를 이긴다.** 한 청크(8건)에서 1번 글이 사건종류 `보안` 을,
 * 5번 글이 분야 `보안` 을 내면 `보안` 이 kind 로 저장되고 `ignoreDuplicates` 라 영원히 kind 다
 * — 화면에서 `보안` 이 모래빛으로 굳는다(2026-08-31 code-reviewer 지적).
 *
 * 아래 `tagUpsertRows` 의 "먼저 온 축이 이긴다"가 실제로 "분야가 이긴다"가 되려면
 * 그 순서를 **여기서** 만들어야 한다. 이 함수가 `lib/` 에 있는 이유이기도 하다 —
 * 전에는 이 한 줄이 `server-only` 파일에 있어서 순서를 뒤집어도 전 스위트가 green 이었다.
 */
export function batchAxisEntries(
  pairs: readonly { fields: readonly string[]; kinds: readonly string[] }[],
): TagEntry[] {
  return [
    ...pairs.flatMap((p) => p.fields.map((name) => ({ name, axis: "field" as TagAxis }))),
    ...pairs.flatMap((p) => p.kinds.map((name) => ({ name, axis: "kind" as TagAxis }))),
  ];
}

/**
 * 키워드 목록 → `tag` 테이블에 올릴 행.
 *
 * 정규화하면 빈 값이 되는 것(`" - _ "`)은 올리지 않는다 — 올리면 이름 없는 행이 하나 생기고
 * 그 뒤로 모든 빈 값이 거기 붙는다.
 *
 * **같은 말이 두 축에 다 나오면 먼저 온 축으로 한 행만 만든다.** `normalized_name` 이
 * unique 라 두 행을 만들려 들면 upsert 가 통째로 거절하고("ON CONFLICT DO UPDATE command
 * cannot affect row a second time") 그 주기의 태그가 하나도 안 붙는다. 부르는 쪽이 분야를
 * 먼저 넘기므로(`batchAxisEntries`) 겹치는 말은 분야로 남는다 — `보안` 은 사건종류보다
 * 분야로 읽는 게 맞다.
 */
export function tagUpsertRows(entries: readonly TagEntry[]): TagUpsertRow[] {
  const byNormalized = new Map<string, TagEntry>();
  for (const entry of entries) {
    if (typeof entry?.name !== "string") continue;
    const normalized = normalizeTagName(entry.name);
    if (normalized === "" || byNormalized.has(normalized)) continue;
    byNormalized.set(normalized, entry);
  }
  return [...byNormalized].map(([normalized_name, { name, axis }]) => ({
    name,
    normalized_name,
    axis,
  }));
}

/**
 * DB 가 돌려준 행 → **정규화 키로** 찾는 지도.
 *
 * 키를 `name` 그대로 두면 안 된다. upsert 는 이미 있던 행을 그대로 돌려주므로
 * 우리가 보낸 표기가 아니라 **먼저 저장돼 있던 표기**가 온다 — 이번 주기에 모델이
 * 다른 표기를 줬으면 그 이름으로는 영영 못 찾는다.
 */
export function tagIdByNormalized(
  rows: readonly { name: string; id: string }[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const key = normalizeTagName(row.name);
    if (key === "") continue;
    map.set(key, row.id);
  }
  return map;
}

/**
 * (글, 이름들) → `item_tag` 링크.
 *
 * 같은 글에 같은 태그를 두 번 넣지 않는다. `item_tag` 는 `(item_id, tag_id)` 가 기본키라
 * 두 번 연결하려 들면 **그 글의 키워드가 하나도 안 붙는다.** 한 글의 이름 둘이 정규화 뒤
 * 같은 키가 되는 경우가 실제로 있다(`온-디바이스` / `온_디바이스`).
 */
export function itemTagLinks(
  pairs: readonly { itemId: string; tags: readonly string[] }[],
  idByNormalized: ReadonlyMap<string, string>,
): ItemTagLink[] {
  const links: ItemTagLink[] = [];
  const seen = new Set<string>();
  for (const { itemId, tags } of pairs) {
    for (const tag of tags) {
      const tagId = idByNormalized.get(normalizeTagName(tag));
      if (!tagId) continue;
      const key = `${itemId}:${tagId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push({ item_id: itemId, tag_id: tagId });
    }
  }
  return links;
}
