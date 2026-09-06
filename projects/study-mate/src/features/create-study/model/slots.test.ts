import { describe, expect, it } from "vitest";
import { readSlots } from "./slots";

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
