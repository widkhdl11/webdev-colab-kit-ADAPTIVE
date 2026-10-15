// 나만 보는 선물 메모(together INV-F7·F8) — 보낸 팬 본인만 본다. 크리에이터에게 가는 물품 이름(item_kind)과는 다른 값이다.
// 길이는 글자 수(코드 포인트)로 센다 — DB char_length 와 같은 기준. DB 등록 함수와 메모 표 제약이 같은 한도로 다시 막는다.

/** 선물 이름 — 앞뒤 공백을 뺀 한 줄 0~20자 */
export const MEMO_TITLE_MAX = 20;
/** 내용 — 앞뒤 공백을 뺀 0~200자, 줄바꿈 허용 */
export const MEMO_BODY_MAX = 200;

/** 둘 다 선택이고, 둘 다 비면 메모 자체가 없다(null) — 그래서 이 모양에서는 적어도 한쪽이 있다. */
export type GiftMemo = { title: string | null; body: string | null };

/** 앞뒤 공백을 뺀 두 칸 → 메모. 둘 다 비면 null(저장하지 않는다). */
export function giftMemoOf(title: string | undefined, body: string | undefined): GiftMemo | null {
  const t = title?.trim() || null;
  const b = body?.trim() || null;
  return t === null && b === null ? null : { title: t, body: b };
}
