import { describe, expect, it } from "vitest";
import { PHONE_IN_TEXT } from "./integration/pii-shape";

describe("시험용 휴대폰 번호 꼴", () => {
  it("번호는 붙여 쓰든 띄어 쓰든 문장 안에 있든 잡는다", () => {
    for (const s of ["01012345678", "010-1234-5678", "010 123 4567", "연락처:01098765432 입니다", "번호01612345678", '"phone":"0101234567"'])
      expect(s).toMatch(PHONE_IN_TEXT);
  });

  it("송장번호·ID 안에 든 숫자는 번호로 보지 않는다", () => {
    for (const s of ["020194399903", "010123456789", "ef0160445216", "a1b2c3d4-e5f6-4a7b-8c9d-a01012345678", "9f0d2c7e-0101-4234-8567-0161234567ab"])
      expect(s).not.toMatch(PHONE_IN_TEXT);
  });
});
