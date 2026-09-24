import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SIGNAL_STORED_KEYS } from "@/entities/article/lib/summary-format";
import { QUESTION_LABELS } from "@/entities/verdict-review";

/**
 * 판정 검토 화면의 질문 라벨이 상세 화면과 같은가. 두 슬라이스(article·verdict-review)를 같이 보므로
 * 슬라이스 밖(tests/)에 둔다 — 슬라이스 안에서 다른 슬라이스를 import 하면 FSD 게이트가 막는다.
 */
describe("판정 검토 질문 라벨", () => {
  it("질문 라벨은 상세 화면과 같고, 키는 판정이 저장하는 키와 같다", () => {
    const view = readFileSync(resolve(process.cwd(), "src/widgets/article-view/ui/article-view.tsx"), "utf8");
    expect(Object.keys(QUESTION_LABELS).sort()).toEqual(Object.values(SIGNAL_STORED_KEYS).sort());
    for (const [key, stored] of Object.entries(SIGNAL_STORED_KEYS)) {
      expect(view).toContain(`${key}: "${QUESTION_LABELS[stored]}"`);
    }
  });
});
