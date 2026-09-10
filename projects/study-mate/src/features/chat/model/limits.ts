/**
 * 메시지 길이 상한. 데이터베이스의 `chat_messages_content_length` 제약과 **같은 숫자여야
 * 한다**(0021). 강제 위치는 그쪽이다 — 이 값은 폼과 서버 액션이 사용자에게 읽을 수 있는
 * 문구를 주기 위해 본다.
 *
 * **어느 방향으로 갈라지느냐에 따라 잡히는 자리가 다르다.** 이 상수만 바꾸면
 * `src/features/chat/api/send-message.test.ts` 가 잡는다. 반대로 스키마의 2000 만 바꾸면
 * `npm test` 는 전부 초록불이고 `tests/integration/chat-message-integrity.test.ts` 만
 * 빨간불이 된다 — 그 검사가 이 상수로 경계를 밀기 때문이다.
 *
 * (2026-09-05 test-auditor T-H4 은 「스키마에 제약이 없어 서버의 이 값이 유일한 강제
 * 위치」라고 적었다. 0021 이 그 문장을 무효로 만들었다.)
 *
 * `model/` 에 있는 이유: 폼(`ChatRoomView`)과 서버가 같은 값을 봐야 하는데, 폼은
 * 클라이언트 컴포넌트라 서버 전용 모듈(`next/headers` 를 쓰는 Supabase 클라이언트)을
 * import 할 수 없다. 서버 파일에 두면 화면이 숫자를 다시 적게 되고, 서버 상한을
 * 낮췄을 때 입력창만 옛 값을 받는다.
 */
export const MESSAGE_MAX = 2000;

/**
 * 본문에 제어문자가 섞였나 (INV-M4). 데이터베이스의 `chat_messages_content_no_control`
 * 과 같은 판정이고, **강제 위치는 그쪽이다** — 여기는 사용자가 읽을 수 있는 문구를 주기 위한
 * 자리다. 0015 가 사용자 이름에 대해 같은 짝을 이미 두었다
 * (`src/features/edit-profile/model/limits.ts`).
 *
 * **없으면 고칠 수 없는 오류가 반복된다.** `insertMessage` 는 양끝만 `trim()` 하므로 본문
 * **가운데**의 글자는 그대로 데이터베이스로 가고, 제약이 23514 로 거부하면
 * `dbErrorMessage` 가 영어 원문을 덮어 「잠시 뒤 다시 시도해 주세요」를 돌려준다.
 * 다시 시도해도 절대 성공하지 않는데 문구는 기다리라고 한다 (2026-09-10 code-reviewer).
 * 닿는 경로가 드물지 않다 — 스프레드시트 셀을 복사해 붙여 넣으면 탭(U+0009)이 그대로 남는다.
 *
 * **범위는 데이터베이스와 같아야 한다** — `[[:cntrl:]]`(U+0000–1F · U+007F · U+0080–9F).
 * 여기가 더 좁으면 그 틈으로 들어온 값이 다시 위의 반복되는 오류가 되고, 더 넓으면
 * 데이터베이스가 받아 줄 메시지를 앱이 거절한다.
 *
 * **줄 구분자(U+2028·U+2029)는 여기서 안 본다.** 2026-09-10 에 한 번 넣었다가 뺐다 —
 * 넣은 근거가 「줄을 바꾼다」였는데 재 보니 Chromium 에서 안 바꾼다. 스펙의 비범위 절에
 * 측정값이 있다.
 */
export function hasControlChars(content: string): boolean {
  for (const ch of content) {
    const code = ch.codePointAt(0) ?? 0;
    // 정규식 대신 코드 포인트로 센다 — 이 글자들을 정규식 리터럴에 적으면 소스에 그대로
    // 박혀서, 파일을 옮기거나 붙여 넣는 과정에 조용히 사라진다(2026-09-06 실측).
    if (code < 0x20 || code === 0x7f || (code >= 0x80 && code <= 0x9f)) return true;
  }
  return false;
}
