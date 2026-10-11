// 가입 화면 「어디서 팬꾹을 알게 되셨나요」의 답 (metrics INV-Q4). 고르는 것 하나, 답하지 않아도 가입된다.
// 저장 값은 영문 코드, 화면 이름은 한국어. DB(signup_sources.heard_from·record_signup_source)가 같은 목록으로 다시 검사한다.

export const HEARD_FROM = ["x", "creator_stream", "fan_community", "friend", "other"] as const;

export type HeardFrom = (typeof HEARD_FROM)[number];

export const HEARD_FROM_LABEL: Record<HeardFrom, string> = {
  x: "X",
  creator_stream: "크리에이터 방송",
  fan_community: "팬 커뮤니티",
  friend: "지인",
  other: "기타",
};

export function isHeardFrom(v: unknown): v is HeardFrom {
  return typeof v === "string" && (HEARD_FROM as readonly string[]).includes(v);
}
