// 탈퇴할 회원의 아이디 꼴 — 서버(withdraw-account)와 대표 화면(withdraw-form)이 같은 검사를 쓴다(my-account INV-A15).
// 꼴이 맞아도 그런 회원이 있는지는 DB 가 정한다.

export const MESSAGE_LOGIN_ID = "아이디를 영문 소문자·숫자·밑줄 4~30자로 적어 주세요.";

const LOGIN_ID_PATTERN = /^[a-z0-9_]{4,30}$/;

/** 앞뒤 공백을 지우고 소문자로. 꼴이 틀리면 null */
export function shapeLoginId(raw: string): string | null {
  const id = raw.trim().toLowerCase();
  return LOGIN_ID_PATTERN.test(id) ? id : null;
}
