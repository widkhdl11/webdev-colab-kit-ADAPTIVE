// 상태 배지 색의 갈래. 어느 상태가 어느 갈래인지는 각 도메인이 정하고, 여기서는 갈래 → 클래스만 바꾼다.
// 클래스 정의: shared/ui/base.css 의 .tag--success·.tag--warn·.tag--danger·.tag--info (plain 은 수식어 없는 .tag).
export type StatusTone = "success" | "warn" | "danger" | "info" | "plain";

const TONE_CLASS: Record<StatusTone, string> = {
  success: "tag tag--success",
  warn: "tag tag--warn",
  danger: "tag tag--danger",
  info: "tag tag--info",
  plain: "tag",
};

/** 상태 배지의 className. extra 는 화면별 모듈 클래스를 뒤에 붙일 때 쓴다. */
export function statusTagClass(tone: StatusTone, extra?: string): string {
  return extra ? `${TONE_CLASS[tone]} ${extra}` : TONE_CLASS[tone];
}
