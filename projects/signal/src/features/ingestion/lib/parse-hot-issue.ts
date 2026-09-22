import type { ArticleKind } from "@/entities/article";
import { HOT_ISSUE_QUESTIONS } from "../model/prompt-text";

/**
 * 핫이슈 판정 응답 읽기 (hot-issue.md INV-G1 · G2 · G4).
 *
 * **못 읽으면 null 이다. 0 으로 채우지 않는다** (INV-G2 실패 처리). 중요도 0 은
 * "물어봤고 셋 다 아니었다"이고 null 은 "못 물어봤다"다. 실패를 0 으로 적으면 그 글은
 * 판정을 받은 것으로 기록돼 다음 주기가 다시 안 묻는다 — 조용히 영구 누락이다.
 */

export interface HotIssueVerdict {
  /** 뉴스·툴. 모르는 값은 버린다 — 값이 셋째 갈래로 새지 않는다. */
  kinds: ArticleKind[];
  /** 문턱 질문 셋 중 참인 개수 (0~3). */
  importance: number;
  /** 어느 질문이 참이었나. 첫 2주 표본 검토가 이것을 읽는다. */
  answers: Record<string, boolean>;
  /** 그날 이미 뽑힌 것과 같은 사건인가 (INV-G4). 안 물어봤으면 false. */
  duplicateOfPicked: boolean;
}

const KIND_BY_LABEL: Record<string, ArticleKind> = { 뉴스: "news", 툴: "tool" };

export function parseHotIssue(raw: string): HotIssueVerdict | null {
  let body: unknown;
  try {
    // 모델이 앞뒤에 말을 붙이는 경우가 있다. 객체 부분만 떼어 읽는다
    // (parse-keywords 와 같은 처리).
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    body = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return null;
  }

  if (typeof body !== "object" || body === null) return null;
  const obj = body as Record<string, unknown>;

  // 답 셋이 전부 참/거짓으로 와야 한다. 하나라도 빠지거나 다른 타입이면 못 읽은 것이다 —
  // `"네"` 같은 문자열을 참으로 읽어 주면 모델이 형식을 벗어난 것을 우리가 덮어 주는 셈이고,
  // 그러면 형식이 깨진 날을 아무도 모른다.
  const answers: Record<string, boolean> = {};
  for (const q of HOT_ISSUE_QUESTIONS) {
    const v = obj[q.key];
    if (typeof v !== "boolean") return null;
    answers[q.key] = v;
  }

  const kinds: ArticleKind[] = [];
  const rawKinds = obj["종류"];
  if (Array.isArray(rawKinds)) {
    for (const label of rawKinds) {
      if (typeof label !== "string") continue;
      const kind = KIND_BY_LABEL[label.trim()];
      // 모르는 값은 버린다. 받아 주면 DB 제약에 걸려 그 글의 저장이 통째로 실패한다.
      if (kind && !kinds.includes(kind)) kinds.push(kind);
    }
  }

  // **질문 셋과 같은 엄격함으로 읽는다** (2026-09-21 리뷰 2순위).
  //
  // 전에는 `=== true` 하나였다. 그러면 모델이 `"예"` 로 답하는 날 조용히 거짓이 되어
  // **중복 제거가 한 건도 안 걸리는데 리포트의 `duplicates` 는 0 으로 정상처럼 보인다.**
  // 형식이 깨진 것을 우리가 덮어 주면 깨진 날을 아무도 모른다 — 위 질문 셋과 같은 규칙이다.
  //
  // 칸이 **없는 것**은 다르다. 목록을 안 실어 보낸 판정에는 이 칸이 아예 없고, 그때는
  // "같은 사건 아님"이다 — 물어보지 않은 것을 참으로 보면 첫 판정에서 전부 빠진다.
  const duplicate = obj["같은사건"];
  if (duplicate !== undefined && typeof duplicate !== "boolean") return null;

  return {
    kinds,
    importance: Object.values(answers).filter(Boolean).length,
    answers,
    duplicateOfPicked: duplicate === true,
  };
}
