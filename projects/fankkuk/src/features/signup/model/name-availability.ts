import {
  AVAILABILITY_DELAY_MS,
  createAvailabilityWatcher,
  type AvailabilityAnswer,
  type AvailabilityCheck,
  type AvailabilityState,
  type AvailabilityTone,
} from "@/shared/lib/availability/availability-watcher";
import { LINK_AVAILABILITY_LINE, linkNeedsCheck } from "@/entities/creator/model/link-availability";

// 가입 화면의 아이디·닉네임 미리 확인(signup INV-U14) — 입력을 멈춘 뒤 0.4초에 한 번 묻는다(업계 표준, DECISIONS 2026-10-15).
// 입력이 바뀌면 진행 중인 요청을 끊고(AbortController), 늦게 도착한 이전 값의 답은 버린다 — 안내는 언제나 지금 칸의 값에 대한 것이다.
// 「잠시 뒤에」 답(rate_limited·요청 실패) 뒤에는 같은 값도 다시 묻는다 — 그 답은 값에 대한 판정이 아니다.
// 「다음」은 settle 로 지금 값의 답이 올 때까지 기다렸다가 availabilityBlock 으로 판정한다(확인 중에 눌러도 넘어가지 않게).
// 미리 확인은 안내일 뿐이다. 최종 판정은 가입 때 DB 제약이 한다(INV-U3·U13).

export type NameField = "loginId" | "nickname";
/** 미리 확인 API 가 받는 종류 — 팬꾹 링크(linkHandle)는 채널 확인 단계의 링크 만들기 칸이 쓴다(signup INV-U14). */
export type CheckKind = NameField | "linkHandle";

/** 미리 확인의 답 → 칸 아래 안내. 「잠시 뒤에」는 틀렸다는 뜻이 아니라 흐린 안내로 둔다. */
export const AVAILABILITY_LINE: Record<AvailabilityState["status"], { tone: AvailabilityTone; message: string }> = {
  checking: { tone: "wait", message: "확인 중…" },
  available: { tone: "ok", message: "사용 가능합니다." },
  taken: { tone: "bad", message: "이미 사용 중입니다." },
  invalid: { tone: "bad", message: "입력 형식을 확인해 주세요." },
  // 아이디·닉네임에는 오지 않는 답(팬꾹 링크 전용) — 같은 꼴로 둔다
  reserved: { tone: "bad", message: "쓸 수 없는 주소예요." },
  rate_limited: { tone: "wait", message: "잠시 후 다시 확인해 주세요." },
  error: { tone: "wait", message: "잠시 후 다시 확인해 주세요." },
};

/** 「다음」을 눌렀는데 지금 값의 답을 끝내 받지 못했을 때(기다리는 사이 값이 바뀜) */
export const NAME_STILL_CHECKING = "아이디와 닉네임을 확인 중입니다. 완료 후 다시 눌러 주세요.";

/** 지금 칸 값에 대한 안내 — 답이 없거나 이전 값의 답이면 「확인 중」 */
export function availabilityLine(state: AvailabilityState | null, value: string): { tone: AvailabilityTone; message: string } {
  if (!state || state.value !== value) return AVAILABILITY_LINE.checking;
  return AVAILABILITY_LINE[state.status];
}

/**
 * 「다음」 판정. states: settle 이 돌려준 답 · values: 지금 칸 값(앞뒤 공백 뺀 것).
 * 이미 씀·형식 틀림이면 그 칸에서 막는다. 지금 값의 답이 없거나 아직 확인 중이면 「확인 중이에요」로 막는다.
 * 「잠시 뒤에」·요청 실패는 막지 않는다 — 가입 때 서버가 다시 본다(INV-U13).
 */
/** fields: 판정할 칸 — 크리에이터는 2단계에 닉네임 칸이 없어 아이디만 본다(signup INV-U21) */
export function availabilityBlock(
  states: Record<NameField, AvailabilityState | null>,
  values: Record<NameField, string>,
  fields: readonly NameField[] = ["loginId", "nickname"],
): { field: NameField; message: string } | null {
  for (const field of fields) {
    const state = states[field];
    if (!state || state.value !== values[field] || state.status === "checking") return { field, message: NAME_STILL_CHECKING };
    const line = AVAILABILITY_LINE[state.status];
    if (line.tone === "bad") return { field, message: line.message };
  }
  return null;
}

// 감시기와 팬꾹 링크 안내는 채널 확인 칸(features/creator-verify)도 써서 아래 레이어로 옮겼다 — 이 파일을 부르던 곳은 그대로 쓴다.
export { AVAILABILITY_DELAY_MS, createAvailabilityWatcher, LINK_AVAILABILITY_LINE, linkNeedsCheck };
export type { AvailabilityCheck, AvailabilityState, AvailabilityTone };
/** 서버의 답 다섯 + 요청 자체가 실패함(error). */
export type NameAnswer = AvailabilityAnswer;
