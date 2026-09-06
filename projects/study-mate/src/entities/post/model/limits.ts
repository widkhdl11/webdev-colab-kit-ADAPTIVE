// 모집글의 길이 상한. **폼과 서버가 같은 값을 봐야 해서 따로 뗐다** — 폼은 클라이언트
// 컴포넌트라 서버 전용 모듈(`next/headers` 를 쓰는 Supabase 클라이언트)을 import 할 수 없다.
// 붙여 뒀더니 브라우저 번들이 서버 클라이언트를 끌고 들어가 빌드가 죽었다.
//
// **엔티티에 있는 이유**: 이 값은 「모집글이라는 것이 얼마나 긴가」이지 「작성 기능이 무엇을
// 허용하는가」가 아니다. 작성과 수정이 같은 값을 봐야 하는데 기능끼리는 import 할 수 없으므로
// (features → features 금지), 작성 기능 안에 두면 수정 기능이 상한을 손으로 복사하게 된다.
// 그러면 한쪽만 고쳐지는 날 「작성은 되는데 수정은 거부되는 본문」이 생긴다.
//
// 스키마에는 길이 제약이 없다. 지금은 서버 액션의 검사가 유일한 강제 위치이고,
// 폼의 maxLength 는 거들 뿐이다(요청은 폼을 안 거치고도 들어온다).

export const TITLE_MAX = 80;
// 스터디 개설 폼의 「한 줄 소개」와 같은 값이다(80). 라벨도 힌트도 글자까지 같은 칸이
// 하나는 80 하나는 120 이면, 사용자는 상한이 다르다는 것도 어디서 잘리는지도 알 수 없다.
export const SUMMARY_MAX = 80;
export const CONTENT_MAX = 4000;

/** 모집글의 글칸 셋. 폼이 보낸 값을 다듬은 뒤의 모양이다(빈 것은 null) */
export type PostText = {
  readonly title: string | null;
  readonly summary: string | null;
  readonly content: string | null;
};

/**
 * 글칸 셋이 규칙을 지키는가. 어기면 **사용자에게 보여 줄 문장**을 돌려주고, 괜찮으면 null.
 *
 * **상한만 옮기고 규칙은 두 벌로 뒀던 자리다.** 작성과 수정이 문구까지 글자 그대로 같은
 * 검사 여섯 줄을 각자 들고 있었다 — 지금은 값이 같아 안 보이지만, 규칙이 하나 늘면
 * (제어문자 금지 같은 것) 그 순간 「작성은 되는데 수정은 거부되는 본문」이 생긴다.
 * 상수를 여기로 옮긴 이유가 그것이었는데 규칙이 안 따라왔다 (2026-09-06 code-reviewer).
 *
 * **문구에 숫자를 직접 적지 않고 상수를 끼운다** — 문구와 상한이 갈리면 사용자가 읽는
 * 숫자와 실제로 막히는 숫자가 달라진다. 대신 검사 쪽이 숫자를 직접 박아 상한을 고정한다.
 */
export function validatePostText(text: PostText): string | null {
  if (!text.title) return "모집글 제목을 적어 주세요";
  if (text.title.length > TITLE_MAX) return `제목은 ${TITLE_MAX}자까지 적을 수 있습니다`;
  if (text.summary && text.summary.length > SUMMARY_MAX) {
    return `한 줄 소개는 ${SUMMARY_MAX}자까지 적을 수 있습니다`;
  }
  if (!text.content) return "모집글 내용을 적어 주세요";
  if (text.content.length > CONTENT_MAX) return `내용은 ${CONTENT_MAX}자까지 적을 수 있습니다`;
  return null;
}
