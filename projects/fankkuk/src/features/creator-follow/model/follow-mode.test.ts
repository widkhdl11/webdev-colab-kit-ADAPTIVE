import { describe, expect, it } from "vitest";
import { followModeOf } from "./follow-mode";

const HARU = "00000000-0000-4000-b000-000000000001";
const BYEOLBIT_PAGE = "00000000-0000-4000-b000-000000000002";

describe("팔로우 버튼을 누구에게 보이나", () => {
  it("로그인하지 않았으면 로그인으로 보내는 버튼", () => {
    expect(followModeOf(null)).toBe("login");
  });
  it("팬과 크리에이터는 저장하는 버튼, 운영자는 숨김", () => {
    expect(followModeOf({ userId: "f", role: "fan" })).toBe("save");
    expect(followModeOf({ userId: "c", role: "creator" }, { creatorId: HARU, ownCreatorId: BYEOLBIT_PAGE })).toBe("save");
    expect(followModeOf({ userId: "o", role: "operator" })).toBe("hidden");
  });
  it("크리에이터 자기 페이지에서는 숨김", () => {
    expect(followModeOf({ userId: "c", role: "creator" }, { creatorId: BYEOLBIT_PAGE, ownCreatorId: BYEOLBIT_PAGE })).toBe("hidden");
  });
});
