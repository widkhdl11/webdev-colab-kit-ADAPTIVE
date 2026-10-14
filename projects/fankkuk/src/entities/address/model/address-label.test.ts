import { describe, expect, it } from "vitest";
import { ADDRESS_LABELS, ADDRESS_LABEL_NAME, parseAddressLabel } from "./address-label";

describe("주소 이름표 (INV-P16)", () => {
  it("INV-P16: 목록의 네 값만 받는다 — DB 칸의 허용 값과 같은 목록", () => {
    expect(ADDRESS_LABELS).toEqual(["home", "studio", "office", "other"]);
    for (const v of ADDRESS_LABELS) expect(parseAddressLabel(v)).toBe(v);
    expect(ADDRESS_LABELS.map((v) => ADDRESS_LABEL_NAME[v])).toEqual(["집", "작업실", "사무실", "기타"]);
  });

  it("INV-P16 S16b (실패경로): 목록 밖 값(주소 글자·대문자·공백·빈 값·이름표 이름 자체)은 받지 않는다", () => {
    for (const bad of ["서울 강남구 집", "HOME", "home ", "", "집", null, undefined, 1]) expect(parseAddressLabel(bad)).toBeNull();
  });
});
