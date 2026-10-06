// 소개란 글에서 인증 코드 찾기 (creator-verification INV-V16).
// 코드는 `FK-XXXX-NN` 꼴 그대로(글자 크기까지) 일치해야 한다. 앞뒤에 영문·숫자·「-」가 붙어 더 긴 낱말이 되면 같은 코드가 아니다.
// 찾을 코드는 DB 가 신청 줄에서 준 값이고, 글은 서버가 플랫폼 API 로 읽은 소개란 칸이다 — 브라우저가 보낸 값이 아니다.

/** DB 의 cva_code_shape 와 같은 꼴(0·1·I·O 를 뺀 글자 넷, 숫자 둘) */
const CODE_SHAPE = /^FK-[2-9A-HJ-NP-Z]{4}-[0-9]{2}$/;
const WORD_CHAR = /[A-Za-z0-9-]/;

export function bioHasVerificationCode(bio: string, code: string): boolean {
  if (!CODE_SHAPE.test(code)) return false;
  let from = 0;
  for (;;) {
    const at = bio.indexOf(code, from);
    if (at < 0) return false;
    const before = at === 0 ? "" : bio.charAt(at - 1);
    const after = bio.charAt(at + code.length);
    if (!WORD_CHAR.test(before) && !WORD_CHAR.test(after)) return true;
    from = at + 1;
  }
}
