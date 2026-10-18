import { describe, expect, it } from "vitest";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import { memberTiles } from "./home-page";

// ①-2 내 바로가기 숫자(design-rules 16절). 처리할 일 숫자가 읽기 결과의 줄 수인지는 tests/action-center-*.test.tsx(INV-J2)가 본다.
const gifts = [{}, {}] as unknown as FanGiftView[];
const note = (tiles: ReturnType<typeof memberTiles>, label: string) => tiles.find((t) => t.label === label)?.note;

describe("memberTiles", () => {
  it("보낸 선물은 진행 중 수, 처리할 일·받은 선물은 받은 수 그대로", () => {
    const tiles = memberTiles({ gifts, actionCount: 1, receivedCount: 5 });
    expect(note(tiles, "보낸 선물")).toBe("진행 중 2건");
    expect(note(tiles, "처리할 일")).toBe("1건");
    expect(note(tiles, "받은 선물")).toBe("5건");
  });

  it("0 은 「0건」으로 쓴다", () => {
    const tiles = memberTiles({ gifts: [], actionCount: 0, receivedCount: 0 });
    expect(note(tiles, "처리할 일")).toBe("0건");
    expect(note(tiles, "받은 선물")).toBe("0건");
  });

  it("(실패경로) 못 읽은 수(null)는 「0건」으로 보이지 않고 비운다", () => {
    const tiles = memberTiles({ gifts: [], actionCount: null, receivedCount: null });
    expect(note(tiles, "처리할 일")).toBe("");
    expect(note(tiles, "받은 선물")).toBe("");
  });
});
