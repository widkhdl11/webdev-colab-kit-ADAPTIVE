/**
 * 알림 목록 판독기. 근거 스펙: docs/specs/notifications.md (INV-N6 · INV-N7)
 *
 * **이 파일이 붙드는 것은 링크를 거는 판단이다.** 알림 행에는 참조 대상 외래 키가 없어서
 * 가리키는 스터디가 지워져도 알림은 남는다. 링크를 그대로 그리면 누르지 않아도 Next 의
 * 미리 가져오기가 404 를 만든다.
 */
import { describe, expect, it, vi } from "vitest";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import { readMyNotifications } from "./read-my-notifications";

const 살아있는스터디 = "22222222-2222-4222-8222-222222222222";
const 지워진스터디 = "33333333-3333-4333-8333-333333333333";

type 행 = Record<string, unknown>;

function 알림(덮어쓸: 행 = {}): 행 {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    type: "participation_requested",
    title: "토익 900 뿌시기",
    reference_type: "study",
    reference_id: 살아있는스터디,
    read_at: null,
    created_at: "2026-09-08T00:00:00.000Z",
    ...덮어쓸,
  };
}

/**
 * 알림 목록과 「지금 보이는 스터디」를 각각 돌려주는 가짜 데이터베이스.
 * 보이는 스터디는 접근 정책이 정하므로, 여기서는 정책이 돌려줄 값을 흉내 낸다.
 */
function 가짜DB(알림들: 행[], 보이는스터디: string[], 스터디오류: unknown = null) {
  const 건조건: Record<string, unknown> = {};
  const factory = vi.fn(async () => ({
    from(table: string) {
      if (table === "notifications") {
        const q = {
          select(columns: string) {
            건조건["notifications:columns"] = columns;
            return q;
          },
          order(c: string, o: unknown) {
            const 지금까지 = (건조건["notifications:order"] as string[]) ?? [];
            건조건["notifications:order"] = [...지금까지, `${c}:${JSON.stringify(o)}`];
            return q;
          },
          limit(n: number) {
            건조건["notifications:limit"] = n;
            return Promise.resolve({ data: 알림들, error: null });
          },
        };
        return q;
      }
      const q = {
        select(columns: string) {
          건조건["studies:columns"] = columns;
          return q;
        },
        in(c: string, v: unknown) {
          건조건[`studies:in:${c}`] = v;
          return Promise.resolve({
            // **물어본 id 로 걸러서 돌려준다.** 무엇을 물어도 같은 값을 주면
            // 엉뚱한 id 로 묻는 회귀를 아무도 못 잡는다
            data: 보이는스터디.filter((id) => (v as string[]).includes(id)).map((id) => ({ id })),
            error: 스터디오류,
          });
        },
      };
      return q;
    },
  }));
  return { factory: factory as unknown as typeof createServerSupabase, 건조건 };
}

describe("내 알림 목록", () => {
  it("INV-N7: 지금 보이는 스터디를 가리킬 때만 링크를 준다", async () => {
    const db = 가짜DB(
      [알림({ id: "a", reference_id: 살아있는스터디 }), 알림({ id: "b", reference_id: 지워진스터디 })],
      [살아있는스터디],
    );

    const rows = await readMyNotifications(db.factory);

    expect(rows[0].href).toBe(`/studies/${살아있는스터디}`);
    // 지워진 스터디를 가리키는 줄은 주소가 아예 없다 — 화면 어디에도 그 주소가 안 나간다
    expect(rows[1].href).toBeNull();
    // 그리고 **사라진 것을 확인했다**고 말한다 — 화면이 이유를 붙일 수 있는 것은 이때뿐이다
    expect(rows[1].gone).toBe(true);
  });

  it("보이는지 못 물어봤을 때는 「사라졌다」고 말하지 않는다", async () => {
    const db = 가짜DB([알림()], [], { message: "일시적 실패" });

    const rows = await readMyNotifications(db.factory);

    expect(rows[0].href).toBeNull(); // 모르면 링크는 안 건다
    expect(rows[0].gone).toBe(false); // 그런데 지워졌다고 단정하지도 않는다
  });

  it("INV-N7: 보이는지 물을 때 필요한 것만 묻는다 — 제목을 같이 읽으면 INV-N6 이 깨진다", async () => {
    const db = 가짜DB([알림()], [살아있는스터디]);
    await readMyNotifications(db.factory);

    // 이 질의가 title 을 가져오기 시작하면, 다음 사람이 그 값으로 문장을 짓게 된다.
    // 그러면 스터디 이름이 바뀔 때 지난 알림의 문장까지 같이 바뀐다.
    expect(db.건조건["studies:columns"]).toBe("id");
    expect(db.건조건["studies:in:id"]).toEqual([살아있는스터디]);
  });

  it("INV-N7: 참조가 스터디가 아니면 링크를 안 만든다", async () => {
    const db = 가짜DB([알림({ reference_type: "post", reference_id: 살아있는스터디 })], [살아있는스터디]);

    const rows = await readMyNotifications(db.factory);

    expect(rows[0].href).toBeNull();
  });

  it("INV-N6: 문장의 재료는 저장된 값이다 — 종류와 그때의 제목을 그대로 돌려준다", async () => {
    const db = 가짜DB([알림({ title: "그때의 제목" })], [살아있는스터디]);

    const rows = await readMyNotifications(db.factory);

    expect(rows[0].title).toBe("그때의 제목");
    expect(rows[0].type).toBe("participation_requested");
    // 알림 질의가 스터디를 조인하지 않는다 — 조인하면 지금 이름이 딸려 와서 쓰이게 된다
    expect(String(db.건조건["notifications:columns"])).not.toContain("studies");
  });

  it("누구 것인지는 조건에 안 적는다 — 그 판정의 주인은 접근 정책이다", async () => {
    const db = 가짜DB([알림()], [살아있는스터디]);
    await readMyNotifications(db.factory);

    expect(String(db.건조건["notifications:columns"])).toContain("read_at");
    // 100 은 임의의 수가 아니다 — 종 옆 숫자가 99+ 에서 멈추므로, 여기서 그보다 많이
    // 가져와야 숫자와 목록이 사용자가 볼 수 있는 모든 경우에 맞는다(INV-N8)
    expect(db.건조건["notifications:limit"]).toBe(100);
  });

  it("INV-N8: 안 읽은 것부터 담는다 — 「최근 100줄」로 자르면 숫자가 목록보다 클 수 있다", async () => {
    const db = 가짜DB([알림()], [살아있는스터디]);
    await readMyNotifications(db.factory);

    // **정확한 값으로 단언한다.** `toContain("created_at")` 로 두면 오름차순으로 바꿔도
    // 초록불이고, 그 상태의 제품은 **가장 오래된 100줄**을 보여 준다.
    expect(db.건조건["notifications:order"]).toEqual([
      'read_at:{"ascending":true,"nullsFirst":true}',
      'created_at:{"ascending":false}',
      'id:{"ascending":true}',
    ]);
  });

  it("화면에 주는 순서는 시간순이다 — 읽음 여부로 두 덩이가 되면 순서를 못 읽는다", async () => {
    const db = 가짜DB(
      [
        알림({ id: "안읽음-오래된", read_at: null, created_at: "2026-09-01T00:00:00.000Z" }),
        알림({ id: "읽음-최근", read_at: "2026-09-08T00:00:00.000Z", created_at: "2026-09-07T00:00:00.000Z" }),
      ],
      [살아있는스터디],
    );

    const rows = await readMyNotifications(db.factory);

    expect(rows.map((r) => r.id)).toEqual(["읽음-최근", "안읽음-오래된"]);
  });

  it("가리키는 스터디가 하나도 없으면 스터디를 아예 안 묻는다", async () => {
    const db = 가짜DB([알림({ reference_type: null, reference_id: null })], []);

    const rows = await readMyNotifications(db.factory);

    expect(rows[0].href).toBeNull();
    expect(db.건조건["studies:columns"]).toBeUndefined();
  });

  it("모양이 어긋난 줄은 빼고 나머지를 그린다 — 한 줄 때문에 패널이 통째로 비면 안 된다", async () => {
    const db = 가짜DB([알림({ id: "a" }), 알림({ id: 42 }), 알림({ id: "c" })], [살아있는스터디]);

    const rows = await readMyNotifications(db.factory);

    expect(rows.map((r) => r.id)).toEqual(["a", "c"]);
  });
});
