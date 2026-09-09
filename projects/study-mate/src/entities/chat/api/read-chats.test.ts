/**
 * 방 하나의 메시지 판독기.
 *
 * **이 파일이 붙드는 것은 둘이다.**
 * ① 이름 칸에 제품이 안 들어간다 — 이름을 모를 때 제품이 「나간 멤버」를 넣고 있었다.
 *    이름은 20자에 공백·제어문자만 거르므로 그 글자를 자기 이름으로 지을 수 있다.
 *    (시각 기준 「이름을 모르면 이름 줄을 안 그린다」, 2026-09-09)
 * ② 못 읽은 것을 「없다」로 접지 않는다 — 질의 오류·임베드 모양. 접으면 고장이
 *    「아직 대화가 없습니다」나 404 로 그려져서 사용자도 나도 원인을 못 본다.
 *
 * **가짜는 무엇을 물었는지도 기록한다.** 안 그러면 `.eq("chat_id", …)` 를 지워도
 * 돌려주는 행이 똑같아서 조건이 통째로 검사 밖으로 나간다 (2026-09-09 test-auditor).
 */
import { describe, expect, it, vi } from "vitest";
import type { createServerSupabase } from "@/shared/api/supabase/server-client";
import { readChatRoom, toChatStudy } from "./read-chats";

const 방 = "44444444-4444-4444-8444-444444444444";
const 스터디 = "55555555-5555-4555-8555-555555555555";

type 메시지행 = {
  id: string;
  sender_id: string | null;
  content: string;
  created_at: string;
  sender?: { username: string } | null;
};

function 메시지(덮어쓸: Partial<메시지행> = {}): 메시지행 {
  return {
    id: "m1",
    sender_id: "66666666-6666-4666-8666-666666666666",
    content: "안녕하세요",
    created_at: "2026-09-09T00:00:00.000Z",
    sender: { username: "홍길동" },
    ...덮어쓸,
  };
}

type 오류 = { code?: string; message?: string } | null;

/** 방 행 하나와 메시지 행들을 돌려주는 가짜 데이터베이스. */
function 가짜DB(
  메시지들: unknown[],
  { 메시지오류 = null, 방오류 = null, 방없음 = false }: { 메시지오류?: 오류; 방오류?: 오류; 방없음?: boolean } = {},
) {
  const 건조건: Record<string, unknown> = {};
  const factory = vi.fn(async () => ({
    from(table: string) {
      if (table === "chats") {
        const q = {
          select: () => q,
          eq: () => q,
          maybeSingle: async () => ({
            data: 방없음 || 방오류 ? null : { id: 방, study_id: 스터디, study: null },
            error: 방오류,
          }),
        };
        return q;
      }
      건조건.table = table;
      const q = {
        select(columns: string) {
          건조건.columns = columns;
          return q;
        },
        eq(column: string, value: unknown) {
          건조건[`eq:${column}`] = value;
          return q;
        },
        order(column: string, opts: unknown) {
          건조건.order = [column, opts];
          return q;
        },
        limit: async (n: number) => {
          건조건.limit = n;
          return { data: 메시지오류 ? null : 메시지들, error: 메시지오류 };
        },
      };
      return q;
    },
  }));
  return { factory: factory as unknown as typeof createServerSupabase, 건조건 };
}

/** 던지는 검사는 모양 오류를 로그로 찍는다 — 출력이 섞이지 않게 삼킨다. */
function 로그삼키기() {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
}

describe("채팅방 메시지 판독기 — 무엇을 묻나", () => {
  it("이 방의 메시지만, 최근 것부터, 넘긴 개수만큼 묻는다", async () => {
    const db = 가짜DB([메시지()]);
    await readChatRoom(방, 30, db.factory);

    expect(db.건조건.table).toBe("chat_messages");
    expect(db.건조건["eq:chat_id"]).toBe(방);
    // 「최근 N개」를 자르려면 내림차순이어야 한다. 오름차순이면 가장 오래된 N개가 온다.
    expect(db.건조건.order).toEqual(["created_at", { ascending: false }]);
    expect(db.건조건.limit).toBe(30);
  });

  it("보낸 사람 이름을 같이 묻는다 — 이 조각이 빠지면 모든 이름 줄이 사라진다", async () => {
    const db = 가짜DB([메시지()]);
    await readChatRoom(방, 100, db.factory);

    expect(db.건조건.columns).toContain("sender:profiles(username)");
  });
});

describe("채팅방 메시지 판독기 — 보낸 사람 이름", () => {
  it("이름을 모르면 null 이다 — 제품이 쓴 글자를 이름 칸에 넣지 않는다", async () => {
    const 결과 = await readChatRoom(
      방,
      100,
      가짜DB([메시지({ sender_id: null, sender: null })]).factory,
    );

    expect(결과?.messages[0]?.senderName).toBeNull();
  });

  it("반대 절반: 이름이 있으면 그 글자가 그대로 온다", async () => {
    const 결과 = await readChatRoom(방, 100, 가짜DB([메시지()]).factory);

    expect(결과?.messages[0]?.senderName).toBe("홍길동");
  });

  it("자기 이름을 옛 자리표시 글자로 지어도 그냥 이름이다 — 판독기는 두 경우를 안 섞는다", async () => {
    const 결과 = await readChatRoom(
      방,
      100,
      가짜DB([
        메시지({ id: "m1", sender: { username: "나간 멤버" } }),
        메시지({ id: "m2", sender_id: null, sender: null }),
      ]).factory,
    );

    // 판독기는 최근 것부터 받아 화면 순서로 뒤집으므로 m2 가 앞이다.
    // 이름을 지은 사람은 문자열, 이름이 없는 쪽은 null — 값의 종류부터 다르다.
    expect(결과?.messages.map((m) => [m.id, m.senderName])).toEqual([
      ["m2", null],
      ["m1", "나간 멤버"],
    ]);
  });
});

describe("채팅방 메시지 판독기 — 못 읽은 것을 「없다」로 접지 않는다", () => {
  it("방 질의가 실패하면 던진다 — null 로 떨어뜨리면 화면이 404 를 그린다", async () => {
    로그삼키기();

    await expect(
      readChatRoom(방, 100, 가짜DB([], { 방오류: { message: "터짐" } }).factory),
    ).rejects.toThrow();
  });

  it("반대 절반: 방이 정말 없으면 null 이다 — 못 들어가는 것과 없는 것이 화면에서 같아야 한다", async () => {
    const 결과 = await readChatRoom(방, 100, 가짜DB([], { 방없음: true }).factory);

    expect(결과).toBeNull();
  });

  it("메시지 질의가 실패하면 던진다 — 빈 목록으로 떨어뜨리면 화면이 「아직 대화가 없습니다」를 그린다", async () => {
    로그삼키기();

    await expect(
      readChatRoom(방, 100, 가짜DB([], { 메시지오류: { code: "PGRST", message: "터짐" } }).factory),
    ).rejects.toThrow();
  });

  it("오류 문구에 데이터베이스 메시지를 담지 않는다 — `error.tsx` 가 그리면 화면에 나간다", async () => {
    로그삼키기();

    await expect(
      readChatRoom(
        방,
        100,
        가짜DB([], { 메시지오류: { code: "PGRST", message: "관계 chat_messages 없음" } }).factory,
      ),
    ).rejects.toThrow(/^((?!관계 chat_messages 없음).)*$/);
  });

  it("보낸 사람 임베드가 배열로 오면 던진다 — 「이름을 모른다」로 접으면 고장이 안 보인다", async () => {
    로그삼키기();

    await expect(
      readChatRoom(방, 100, 가짜DB([{ ...메시지(), sender: [{ username: "홍길동" }] }]).factory),
    ).rejects.toThrow();
  });

  it("보낸 사람 키가 아예 없어도 던진다 — select 한 조각이 빠진 상태다", async () => {
    로그삼키기();
    const { sender: _버림, ...키없음 } = 메시지();

    await expect(readChatRoom(방, 100, 가짜DB([키없음]).factory)).rejects.toThrow();
  });

  it("반대 절반: 모양이 맞으면 안 던진다", async () => {
    await expect(readChatRoom(방, 100, 가짜DB([메시지()]).factory)).resolves.not.toBeNull();
  });
});

describe("방에 딸린 스터디 — 임베드의 갈래 넷", () => {
  const 정상 = { id: 스터디, title: "토익 새벽반", category_id: "language", accepted_count: 4 };

  it("정상이면 갈래가 available: true 다", () => {
    expect(toChatStudy(스터디, 정상)).toEqual({
      available: true,
      id: 스터디,
      title: "토익 새벽반",
      categoryId: "language",
      memberCount: 4,
    });
  });

  it("null 이면 안 보이는 것이다 — 이건 고장이 아니라 정책이 감춘 것이다", () => {
    expect(toChatStudy(스터디, null)).toEqual({ available: false, id: 스터디 });
  });

  it("인원수 키가 없으면 던진다 — 통과시키면 화면이 「멤버 (빈칸)명」을 그린다", () => {
    로그삼키기();
    const { accepted_count: _버림, ...키없음 } = 정상;

    expect(() => toChatStudy(스터디, 키없음 as never)).toThrow();
  });

  it("인원수가 숫자가 아니면 던진다 — 계산 컬럼 이름이 바뀌면 이렇게 온다", () => {
    로그삼키기();

    expect(() => toChatStudy(스터디, { ...정상, accepted_count: "4" } as never)).toThrow();
  });

  it("제목이 문자열이 아니면 던진다", () => {
    로그삼키기();

    expect(() => toChatStudy(스터디, { ...정상, title: 7 } as never)).toThrow();
  });

  it("갈래 이름이 문자열이 아니면 던진다", () => {
    로그삼키기();

    expect(() => toChatStudy(스터디, { ...정상, category_id: null } as never)).toThrow();
  });

  it("던지는 문구에 행 원문을 담지 않는다 — 개발 오버레이와 `error.tsx` 에 그대로 나간다", () => {
    로그삼키기();

    expect(() => toChatStudy(스터디, { ...정상, title: "비밀 제목", accepted_count: "4" } as never)).toThrow(
      /^((?!비밀 제목).)*$/,
    );
  });
});
