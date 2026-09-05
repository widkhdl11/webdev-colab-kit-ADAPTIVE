// 어휘가 두 벌인 자리를 붙든다.
//
// 층 규칙이 엔티티끼리의 import 를 막고(공유는 아래 레이어로), 참여 상태·진행 방식은
// 도메인 지식이라 shared 로도 못 내린다. 그래서 `entities/post` 와 `entities/study` 가
// 같은 이름의 union 을 각자 갖는다.
//
// **두 벌이 어긋나는 것은 조용하다** — 한쪽에만 값을 더하면 타입 검사는 통과하고,
// 화면 어딘가에서 "알 수 없음"으로 떨어질 때까지 아무도 모른다.
// 단일 출처는 데이터베이스의 허용값 제약이고, 이 파일이 셋을 대조한다.

import { afterAll, describe, expect, it } from "vitest";
import { rawClient } from "./helpers";

/** 제약식(`CHECK (status = ANY (ARRAY['pending'::text, ...]))`)에서 값만 뽑는다 */
function valuesOf(definition: string): string[] {
  return [...definition.matchAll(/'([^']+)'::text/g)].map((m) => m[1]).sort();
}

async function constraintDefinition(name: string): Promise<string> {
  const c = await rawClient();
  try {
    const { rows } = await c.query(
      `select pg_get_constraintdef(oid) as def from pg_constraint where conname = $1`,
      [name],
    );
    // 검사할 대상이 실제로 있다는 것을 같이 확인한다 — 제약이 사라지면 이 검사는
    // "위반 0건"이 아니라 "검사가 안 돌았다"가 되어야 한다.
    expect(rows, `제약 ${name} 을 찾지 못했다`).toHaveLength(1);
    return rows[0].def as string;
  } finally {
    await c.end();
  }
}

afterAll(() => undefined);

describe("어휘 두 벌이 데이터베이스와 같은지", () => {
  it("참여 상태 다섯: 두 슬라이스와 데이터베이스가 같다", async () => {
    const def = await constraintDefinition("participants_status_allowed");
    const fromDb = valuesOf(def);
    expect(fromDb).toEqual(["accepted", "kicked", "pending", "rejected", "withdrawn"]);

    // 두 슬라이스의 union 을 값으로 적어 둔다. 타입은 실행 시점에 없으므로
    // 여기 적힌 목록이 곧 "코드가 믿고 있는 값"이다.
    const inPostSlice = ["pending", "accepted", "rejected", "withdrawn", "kicked"].sort();
    const inStudySlice = ["pending", "accepted", "rejected", "withdrawn", "kicked"].sort();

    expect(inPostSlice, "entities/post 의 ParticipationStatus 가 데이터베이스와 다르다").toEqual(
      fromDb,
    );
    expect(inStudySlice, "entities/study 의 ParticipationStatus 가 데이터베이스와 다르다").toEqual(
      fromDb,
    );
  });

  it("진행 방식 셋: 두 슬라이스와 데이터베이스가 같다", async () => {
    const def = await constraintDefinition("studies_meeting_mode_allowed");
    const fromDb = valuesOf(def);
    expect(fromDb).toEqual(["hybrid", "offline", "online"]);

    const inPostSlice = ["offline", "online", "hybrid"].sort();
    const inStudySlice = ["offline", "online", "hybrid"].sort();

    expect(inPostSlice, "entities/post 의 MeetingMode 가 데이터베이스와 다르다").toEqual(fromDb);
    expect(inStudySlice, "entities/study 의 MeetingMode 가 데이터베이스와 다르다").toEqual(fromDb);
  });

  it("소스에 적힌 union 이 위 목록과 같다", async () => {
    // 위 두 검사는 이 파일에 손으로 적은 목록을 본다. 그 목록이 실제 소스와 어긋나면
    // 검사가 통과하면서 아무것도 안 붙드는 상태가 되므로, 소스를 직접 읽어 맞춘다.
    const { readFileSync } = await import("node:fs");
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf-8");

    const unionValues = (source: string, typeName: string): string[] => {
      const m = new RegExp(`export type ${typeName} =([^;]+);`).exec(source);
      expect(m, `${typeName} 을 소스에서 찾지 못했다`).not.toBeNull();
      return [...(m as RegExpExecArray)[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
    };

    const postSource = read("../../src/entities/post/model/post-detail.ts");
    const postSummarySource = read("../../src/entities/post/model/post-summary.ts");
    const studySource = read("../../src/entities/study/model/study.ts");

    const expectedStatus = ["accepted", "kicked", "pending", "rejected", "withdrawn"];
    const expectedMode = ["hybrid", "offline", "online"];

    expect(unionValues(postSource, "ParticipationStatus")).toEqual(expectedStatus);
    expect(unionValues(studySource, "ParticipationStatus")).toEqual(expectedStatus);
    expect(unionValues(postSummarySource, "MeetingMode")).toEqual(expectedMode);
    expect(unionValues(studySource, "MeetingMode")).toEqual(expectedMode);
  });
});
