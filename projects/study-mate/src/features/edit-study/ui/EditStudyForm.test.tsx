/**
 * **폼이 저장된 일정만큼 줄을 그리는지 아무도 안 붙들고 있었다** (2026-09-07 test-auditor).
 * `slotFormRows` 자체에는 검사가 있지만 화면이 그것을 부르는지는 안 봤다 — 줄 수를 상수로
 * 되돌려도 전 스위트가 초록불이었고, 그 상태의 제품은 **화면에 안 보인 줄이 저장과 동시에
 * 지워진다**(수정은 「보낸 줄이 곧 전부」다).
 *
 * 숨은 `studyId` 칸도 같은 자리다 — 지우면 모든 저장이 "어느 스터디를 고치는지 알 수
 * 없습니다"로 떨어지는데 검사는 전부 초록불이었다.
 *
 * **모킹하는 것은 이웃(서버 액션)이지 검증 대상(폼)이 아니다.** 액션 파일은 `"use server"`
 * 라 `next/headers` 를 끌고 오므로 이 환경에서 못 부른다.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditableStudy } from "@/entities/study";

vi.mock("../api/edit-study", () => ({ updateStudyAction: vi.fn(async () => null) }));

const { EditStudyForm } = await import("./EditStudyForm");

const 스터디아이디 = "33333333-3333-4333-8333-333333333333";

const 카테고리 = [{ id: "language", name: "외국어", parentId: null, sortOrder: 1 }];
const 지역 = [{ id: "seoul", name: "서울" }];

function 스터디(over: Partial<EditableStudy> = {}): EditableStudy {
  return {
    id: 스터디아이디,
    title: "새벽 토익반",
    summary: null,
    description: "화목 6시에 모입니다",
    categoryId: "language",
    regionCode: "seoul",
    locationDetail: null,
    meetingMode: "offline",
    capacity: 6,
    startsOn: null,
    endsOn: null,
    recruitUntil: null,
    filled: 2,
    slots: [],
    ...over,
  };
}

const 줄 = (i: number, weekday: number) => ({
  weekday,
  startsAt: `0${i}:00`,
  endsAt: `0${i + 1}:00`,
});

let container: HTMLDivElement;
let root: Root;

function 그린다(study: EditableStudy) {
  act(() =>
    root.render(<EditStudyForm study={study} categories={카테고리} regions={지역} />),
  );
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const 일정줄수 = () => container.querySelectorAll('select[name^="weekday"]').length;

describe("EditStudyForm — 저장된 것을 하나도 안 잃고 그린다", () => {
  it("일정이 없거나 적으면 기본 세 줄을 그린다", () => {
    그린다(스터디());
    expect(일정줄수()).toBe(3);
  });

  // **여기가 데이터가 사라지는 자리다.** 저장된 줄보다 적게 그리면 안 그려진 줄은 제출에
  // 안 실리고, 서버는 「보낸 줄이 곧 전부」로 읽어 그 줄을 지운다.
  it("저장된 일정이 기본 줄 수보다 많으면 그만큼 늘려 그린다", () => {
    그린다(스터디({ slots: [줄(1, 1), 줄(2, 2), 줄(3, 3), 줄(4, 4), 줄(5, 5)] }));
    expect(일정줄수()).toBe(5);

    const 요일 = [...container.querySelectorAll<HTMLSelectElement>('select[name^="weekday"]')];
    expect(요일.map((s) => s.value)).toEqual(["1", "2", "3", "4", "5"]);
    expect(
      container.querySelector<HTMLInputElement>('input[name="startsAt4"]')?.value,
    ).toBe("05:00");
  });

  it("어느 스터디를 고치는지 숨은 칸으로 싣는다", () => {
    그린다(스터디());
    const 숨은칸 = container.querySelector<HTMLInputElement>('input[name="studyId"]');
    expect(숨은칸?.value).toBe(스터디아이디);
    // 호스트는 폼에서 오지 않는다 (INV-Z15) — 있으면 갱신 자체가 데이터베이스에서 거부된다
    expect(container.querySelector('[name="hostId"]')).toBeNull();
    expect(container.querySelector('[name="host_id"]')).toBeNull();
  });

  // 정원을 지금 인원보다 낮추는 갱신은 데이터베이스가 거부한다 (INV-P3). 입력칸이 그 값을
  // 받아 두면 사용자는 저장을 누른 뒤에야 막힌 이유를 찾는다.
  it("정원 입력칸의 하한이 지금 참여 인원이다", () => {
    그린다(스터디({ filled: 4, capacity: 6 }));
    expect(container.querySelector<HTMLInputElement>('input[name="capacity"]')?.min).toBe("4");

    // 참여가 적으면 도메인 하한(2)이 그대로 하한이다
    그린다(스터디({ filled: 1, capacity: 6 }));
    expect(container.querySelector<HTMLInputElement>('input[name="capacity"]')?.min).toBe("2");
  });

  // 낭독기의 폼 목록에는 「시작」·「끝」이 줄 수만큼 나란히 뜬다. 번호가 없으면 어느 줄의
  // 시작인지 알 방법이 없다 (2026-09-07 ui-reviewer).
  it("일정 칸의 라벨이 줄마다 다르다", () => {
    그린다(스터디());
    const 라벨 = [...container.querySelectorAll("label")].map((l) => l.textContent ?? "");
    expect(라벨.filter((t) => t.includes("번째 시작")).length).toBe(3);
    // 필수가 아닌 칸에는 「(선택)」이 붙으므로 앞머리로 본다
    expect(라벨.some((t) => t.startsWith("1번째 시작"))).toBe(true);
    expect(라벨.some((t) => t.startsWith("3번째 끝"))).toBe(true);
  });
});
