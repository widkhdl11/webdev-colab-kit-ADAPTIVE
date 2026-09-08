import { describe, expect, it } from "vitest";
import { SLOT_ROWS, SLOT_ROWS_MAX } from "./limits";
import { diffSlots, hhmm, readSlots, slotFormRows } from "./slots";

function 폼(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [k, v] of Object.entries(values)) form.append(k, v);
  return form;
}

describe("모임 일정 읽기", () => {
  it("세 줄을 끝까지 읽는다 — 마지막 줄도 저장된다", () => {
    // 유효한 줄이 하나뿐이면 루프를 첫 줄에서 끊은 변이도 초록불이다.
    const r = readSlots(
      폼({
        weekday0: "1",
        startsAt0: "18:00",
        endsAt0: "20:00",
        weekday2: "3",
        startsAt2: "19:00",
        endsAt2: "21:00",
      }),
    );

    expect(r).toEqual({
      ok: true,
      slots: [
        { weekday: 1, starts_at: "18:00", ends_at: "20:00" },
        { weekday: 3, starts_at: "19:00", ends_at: "21:00" },
      ],
    });
  });

  it("세 칸이 다 빈 줄은 안 적은 줄로 보고 건너뛴다", () => {
    expect(readSlots(폼({}))).toEqual({ ok: true, slots: [] });
    expect(readSlots(폼({ weekday1: "", startsAt1: "", endsAt1: "" }))).toEqual({
      ok: true,
      slots: [],
    });
  });

  it("요일이 0~6 밖이거나 숫자가 아니면 몇 번째 줄인지 말하고 멈춘다", () => {
    for (const 값 of ["7", "-1", "화", "1.5"]) {
      const r = readSlots(폼({ weekday0: 값, startsAt0: "18:00", endsAt0: "20:00" }));
      expect(r).toEqual({ ok: false, message: "1번째 모임 일정의 요일을 골라 주세요" });
    }
    // 경계 안쪽 짝. 없으면 범위를 뒤집은 변이도 초록불이다.
    for (const 값 of ["0", "6"]) {
      const r = readSlots(폼({ weekday0: 값, startsAt0: "18:00", endsAt0: "20:00" }));
      expect(r.ok).toBe(true);
    }
  });

  it("시각 한 칸만 적힌 줄은 조용히 버리지 않고 이유를 말한다", () => {
    expect(readSlots(폼({ weekday0: "1", startsAt0: "18:00", endsAt0: "" }))).toEqual({
      ok: false,
      message: "1번째 모임 일정의 시작·끝 시각을 모두 적어 주세요",
    });
  });

  // 시각 모양은 아무도 안 보던 자리다(2026-09-07 code-reviewer). 두 가지가 여기 달려 있다 —
  // ① 모양이 아무거나면 그 값이 Postgres 까지 가서 22007 로 거부되는데, 수정 경로에서는
  //    그때 이미 지우기가 끝나 있어 **있던 일정이 사라진 채로** 실패한다
  // ② 아래 시각 비교는 글자 순서 비교라 자리수가 다르면 뒤집힌다
  it("시각이 HH:MM 모양이 아니면 몇 번째 줄인지 말하고 멈춘다", () => {
    for (const 나쁜값 of ["7시", "25:00", "10:60", "9:00", "07:0", "2026-01-01"]) {
      const r = readSlots(폼({ weekday0: "2", startsAt0: 나쁜값, endsAt0: "22:00" }));
      expect(r.ok, `${나쁜값} 이 통과했다`).toBe(false);
      expect(!r.ok && r.message).toContain("1번째");
    }
    // 끝 시각도 같이 본다 — 한쪽만 보면 나머지가 그대로 데이터베이스로 간다
    const 끝 = readSlots(폼({ weekday0: "2", startsAt0: "20:00", endsAt0: "10시" }));
    expect(끝.ok).toBe(false);
  });

  it("자리수를 채운 정상 값은 통과한다 — 09시~10시가 「끝이 앞선다」로 막히던 자리다", () => {
    const r = readSlots(폼({ weekday0: "2", startsAt0: "09:00", endsAt0: "10:00" }));
    expect(r.ok).toBe(true);
    expect(r.ok && r.slots).toEqual([{ weekday: 2, starts_at: "09:00", ends_at: "10:00" }]);
  });

  it("끝 시각이 시작 시각보다 뒤여야 한다 — study_sessions_time_order 와 같은 판정이다", () => {
    // 이걸 안 보면 데이터베이스까지 가서 거부당하는데, 그때는 스터디가 이미 만들어진
    // 뒤라 되돌릴 수 없다 (2026-09-06 security-reviewer · code-reviewer).
    for (const [시작, 끝] of [
      ["20:00", "18:00"],
      ["18:00", "18:00"],
    ]) {
      expect(readSlots(폼({ weekday0: "1", startsAt0: 시작, endsAt0: 끝 }))).toEqual({
        ok: false,
        message: "1번째 모임 일정의 끝 시각이 시작 시각보다 뒤여야 합니다",
      });
    }
  });

  it("같은 요일에 같은 시각으로 시작하는 줄을 두 번 넣을 수 없다", () => {
    // study_sessions_unique 가 거부하는 조합이다. 여기서 안 막으면 위와 같은 문제가 난다.
    const r = readSlots(
      폼({
        weekday0: "1",
        startsAt0: "18:00",
        endsAt0: "20:00",
        weekday1: "1",
        startsAt1: "18:00",
        endsAt1: "21:00",
      }),
    );

    expect(r).toEqual({
      ok: false,
      message: "같은 요일에 같은 시각으로 시작하는 일정을 두 번 넣을 수 없습니다",
    });
  });

  it("같은 요일이라도 시작 시각이 다르면 통과한다", () => {
    const r = readSlots(
      폼({
        weekday0: "1",
        startsAt0: "09:00",
        endsAt0: "11:00",
        weekday1: "1",
        startsAt1: "18:00",
        endsAt1: "20:00",
      }),
    );

    expect(r.ok).toBe(true);
  });
});

describe("hhmm — 데이터베이스의 시각을 폼의 모양으로", () => {
  it("초를 떼어 낸다", () => {
    expect(hhmm("19:00:00")).toBe("19:00");
  });

  it("이미 폼의 모양이면 그대로 둔다", () => {
    expect(hhmm("19:00")).toBe("19:00");
  });
});

describe("diffSlots — 바뀐 줄만 고른다", () => {
  const 줄 = (id: string, weekday: number, starts_at: string, ends_at: string) => ({
    id,
    weekday,
    starts_at,
    ends_at,
  });

  // **이것이 이 함수의 존재 이유다.** 통째로 지우고 다시 넣으면 넣기가 실패했을 때
  // 손대지도 않은 줄이 사라진다.
  it("아무것도 안 바뀌면 지울 것도 넣을 것도 없다 — 초 표기가 달라도 같은 줄이다", () => {
    const 지금 = [줄("a", 1, "19:00:00", "21:00:00")];
    const 다음 = [{ weekday: 1, starts_at: "19:00", ends_at: "21:00" }];

    expect(diffSlots(지금, 다음)).toEqual({ toDelete: [], toInsert: [] });
  });

  it("끝 시각만 바뀐 줄은 지우고 다시 넣는다 — 유일 제약이 요일·시작 시각만 보기 때문이다", () => {
    const 지금 = [줄("a", 1, "19:00:00", "21:00:00")];
    const 다음 = [{ weekday: 1, starts_at: "19:00", ends_at: "22:00" }];

    const { toDelete, toInsert } = diffSlots(지금, 다음);
    expect(toDelete.map((s) => s.id)).toEqual(["a"]);
    expect(toInsert).toEqual([{ weekday: 1, starts_at: "19:00", ends_at: "22:00" }]);
  });

  it("안 바뀐 줄은 그대로 두고 바뀐 줄만 고른다", () => {
    const 지금 = [줄("a", 1, "19:00:00", "21:00:00"), 줄("b", 3, "10:00:00", "12:00:00")];
    const 다음 = [
      { weekday: 1, starts_at: "19:00", ends_at: "21:00" },
      { weekday: 5, starts_at: "07:00", ends_at: "08:00" },
    ];

    const { toDelete, toInsert } = diffSlots(지금, 다음);
    expect(toDelete.map((s) => s.id)).toEqual(["b"]);
    expect(toInsert).toEqual([{ weekday: 5, starts_at: "07:00", ends_at: "08:00" }]);
  });

  it("줄을 다 비우면 있던 것을 전부 지운다", () => {
    const 지금 = [줄("a", 1, "19:00:00", "21:00:00")];

    expect(diffSlots(지금, []).toDelete.map((s) => s.id)).toEqual(["a"]);
  });
});

describe("폼이 기본 줄 수보다 많이 보내면", () => {
  // **수정 화면이 이미 저장된 일정만큼 줄을 그린다.** 서버가 세 줄만 읽으면 화면에 보이던
  // 넷째 줄이 제출과 동시에 사라진다 — 수정은 「보낸 줄이 곧 전부」이기 때문이다.
  it("기본 줄 수를 넘는 줄도 읽는다", () => {
    const r = readSlots(
      폼({
        weekday0: "1",
        startsAt0: "18:00",
        endsAt0: "20:00",
        weekday3: "5",
        startsAt3: "07:00",
        endsAt3: "08:00",
      }),
    );

    expect(r).toEqual({
      ok: true,
      slots: [
        { weekday: 1, starts_at: "18:00", ends_at: "20:00" },
        { weekday: 5, starts_at: "07:00", ends_at: "08:00" },
      ],
    });
  });

  // 이 수는 요청에서 온다. 상한이 없으면 아주 큰 번호까지 채워 보내는 요청 하나가
  // 서버를 그만큼 돌린다.
  it("상한을 넘는 번호는 안 읽는다", () => {
    const 값: Record<string, string> = {};
    for (let i = 0; i < SLOT_ROWS_MAX + 3; i += 1) {
      값[`weekday${i}`] = String(i % 7);
      값[`startsAt${i}`] = `0${i % 7}:00`;
      값[`endsAt${i}`] = `0${i % 7}:30`;
    }

    const r = readSlots(폼(값));

    // 같은 요일·같은 시작 시각이 두 번이면 거부되므로(유일 제약), 상한 안에서 이미
    // 걸린다 — **상한이 사라지면 걸리는 자리가 달라지는 것이 아니라 도는 횟수가 는다.**
    // 그래서 값 자체가 아니라 「상한 밖 번호를 안 봤다」를 본다.
    expect(r.ok).toBe(false);

    const 성긴값: Record<string, string> = {
      [`weekday${SLOT_ROWS_MAX}`]: "1",
      [`startsAt${SLOT_ROWS_MAX}`]: "18:00",
      [`endsAt${SLOT_ROWS_MAX}`]: "20:00",
    };
    expect(readSlots(폼(성긴값))).toEqual({ ok: true, slots: [] });
  });
});

describe("slotFormRows — 수정 폼이 그릴 줄 수", () => {
  it("저장된 일정이 없거나 적으면 기본 줄 수를 그린다", () => {
    expect(slotFormRows(0)).toBe(SLOT_ROWS);
    expect(slotFormRows(SLOT_ROWS - 1)).toBe(SLOT_ROWS);
  });

  // **잘라 내면 화면에 안 보인 줄이 제출과 동시에 지워진다.** 수정은 「보낸 줄이 곧 전부」다.
  it("저장된 일정이 기본 줄 수보다 많으면 그만큼 늘린다", () => {
    expect(slotFormRows(SLOT_ROWS + 2)).toBe(SLOT_ROWS + 2);
  });

  it("서버가 읽어 주는 수를 넘겨 그리지 않는다 — 그려 봐야 안 읽힌다", () => {
    expect(slotFormRows(SLOT_ROWS_MAX + 5)).toBe(SLOT_ROWS_MAX);
  });
});
