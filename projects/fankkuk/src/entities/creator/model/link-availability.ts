import { isHandleShape, normalizeHandle } from "./creator-handle";
import type { AvailabilityState, AvailabilityTone } from "@/shared/lib/availability/availability-watcher";

// 팬꾹 링크 만들기 칸의 미리 확인 안내(signup INV-U14). 가입 화면과 채널 확인 단계(가입 4단계·계정 설정)가 같이 쓴다.

/**
 * 채널 확인 단계 팬꾹 링크 만들기 칸의 안내(signup INV-U14, 2026-11-02 사용자 지시 문구). 아이디·닉네임과 같은 답을 받고 문구만 다르다.
 * 로그인 아이디와 같으면 서버에 묻지 않고 sameAsLogin 을 보인다(linkNeedsCheck).
 */
export const LINK_AVAILABILITY_LINE: Record<AvailabilityState["status"] | "sameAsLogin", { tone: AvailabilityTone; message: string }> = {
  checking: { tone: "wait", message: "확인 중…" },
  available: { tone: "ok", message: "쓸 수 있어요." },
  taken: { tone: "bad", message: "이미 쓰고 있어요." },
  invalid: { tone: "bad", message: "형식이 맞지 않아요." },
  reserved: { tone: "bad", message: "쓸 수 없는 주소예요." },
  rate_limited: { tone: "wait", message: "잠시 후 다시 확인해 주세요." },
  error: { tone: "wait", message: "잠시 후 다시 확인해 주세요." },
  sameAsLogin: { tone: "bad", message: "로그인 아이디와 다르게 정해 주세요." },
};

/** 팬꾹 링크를 서버에 물어야 하는가 — 위 아이디 칸과 같으면(소문자로 비교) 묻지 않는다. */
export function linkNeedsCheck(link: string, loginId: string): boolean {
  const h = link.trim().toLowerCase();
  return h !== "" && h !== loginId.trim().toLowerCase();
}


/**
 * ① 팬꾹 링크 만들기 칸의 지금 모습(signup INV-U14). 화면은 이 결과를 그리기만 한다.
 * - value: 저장·비교에 쓰는 값(앞뒤 공백 빼고 소문자 — 저장 함수와 같은 정리)
 * - line: 칸 아래 안내 한 줄(없으면 null) · ask: 서버에 물을 값(묻지 않으면 null) · canMake: 「만들기」가 켜지는가
 * 빈 값·꼴 틀림·로그인 아이디와 같음은 서버에 묻지 않는다. 「만들기」는 지금 값의 답이 「쓸 수 있어요」일 때만 켜진다.
 */
export function linkMakerState(input: { draft: string; loginId: string | null; check: AvailabilityState | null }): {
  value: string;
  line: { tone: AvailabilityTone; message: string } | null;
  ask: string | null;
  canMake: boolean;
} {
  const value = normalizeHandle(input.draft);
  if (value === "") return { value, line: null, ask: null, canMake: false };
  if (!isHandleShape(value)) return { value, line: LINK_AVAILABILITY_LINE.invalid, ask: null, canMake: false };
  if (input.loginId !== null && !linkNeedsCheck(value, input.loginId)) return { value, line: LINK_AVAILABILITY_LINE.sameAsLogin, ask: null, canMake: false };
  const status = input.check && input.check.value === value ? input.check.status : "checking";
  return { value, line: LINK_AVAILABILITY_LINE[status], ask: value, canMake: status === "available" };
}
