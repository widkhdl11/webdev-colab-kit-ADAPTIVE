import { describe, expect, it } from "vitest";
import { CREATOR_HOME, FAN_HOME, homePathOf } from "./home-path";

describe("로그인한 사람의 첫 화면", () => {
  it("팬은 팬 메인, 크리에이터는 크리에이터 메인으로 간다", () => {
    expect(homePathOf("fan")).toBe("/home");
    expect(homePathOf("creator")).toBe("/creator");
    expect(FAN_HOME).toBe("/home");
    expect(CREATOR_HOME).toBe("/creator");
  });

  it("크리에이터의 첫 화면은 승인 요청 목록이 아니다", () => {
    expect(homePathOf("creator")).not.toBe("/creator/requests");
  });

  it("운영자·손님은 첫 화면이 없다 — 손님 화면을 그대로 보여 준다", () => {
    expect(homePathOf("operator")).toBeNull();
    expect(homePathOf(null)).toBeNull();
    expect(homePathOf(undefined)).toBeNull();
  });
});
