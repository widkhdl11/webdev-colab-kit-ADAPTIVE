import { describe, expect, it } from "vitest";
import { fanImageUrl, toFanProfile } from "./fan-profile";

// 팬 프로필 읽기 결과 (docs/specs/my-account.md INV-A13·A14). 화면에 닿는 값은 네 칸뿐이고, 사진 주소는 정해진 경로 꼴만 만든다.

const ID = "00000000-0000-4000-a000-000000000001";

describe("INV-A13: 프로필은 네 칸만 화면에 닿는다", () => {
  it("INV-A13: 닉네임·사진·배경·소개 넷만 꺼낸다 — 다른 칸이 섞여 와도 버린다", () => {
    const p = toFanProfile({ nickname: "별빛", photo_path: `${ID}/p-1.webp`, bg_path: `${ID}/bg-2.webp`, intro: "안녕", login_id: "byeolbit_fan", phone: "01012345678" });
    expect(p).toEqual({ nickname: "별빛", photoPath: `${ID}/p-1.webp`, bgPath: `${ID}/bg-2.webp`, intro: "안녕" });
    expect(Object.keys(p!).sort()).toEqual(["bgPath", "intro", "nickname", "photoPath"]);
  });

  it("INV-A13 (실패경로): 꼴이 틀린 행은 null, 꼴이 틀린 경로는 빈 사진", () => {
    expect(toFanProfile(undefined)).toBeNull();
    expect(toFanProfile({ nickname: 3 })).toBeNull();
    expect(toFanProfile({ nickname: "별빛", photo_path: "../etc/passwd", bg_path: `${ID}/p-1.webp`, intro: "" })).toEqual({
      nickname: "별빛",
      photoPath: null,
      bgPath: null,
      intro: "",
    });
  });
});

describe("INV-A14: 공개 저장소 주소", () => {
  it("INV-A14: 정해진 경로 꼴만 fan-photos 공개 주소로 만든다", () => {
    expect(fanImageUrl("http://x", `${ID}/p-12.webp`)).toBe(`http://x/storage/v1/object/public/fan-photos/${ID}/p-12.webp`);
    expect(fanImageUrl("http://x", `${ID}/bg-1.webp`)).toBe(`http://x/storage/v1/object/public/fan-photos/${ID}/bg-1.webp`);
  });

  it("INV-A14 (실패경로): 다른 꼴·빈 값은 주소를 만들지 않는다", () => {
    for (const bad of [null, "", `${ID}/1.webp`, `${ID}/p-0.webp`, `${ID}/p-1.png`, "x/../p-1.webp", `${ID}/p-1.webp?x=1`]) {
      expect(fanImageUrl("http://x", bad)).toBeNull();
    }
  });
});
