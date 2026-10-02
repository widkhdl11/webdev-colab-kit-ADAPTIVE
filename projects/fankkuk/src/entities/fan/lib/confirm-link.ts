// 이메일 확인 링크. 내 정보에서 바꾼 이메일과 가입 때 적은 이메일이 같은 확인 화면을 쓴다.
export function confirmLink(appOrigin: string, token: string): string {
  return `${appOrigin}/me/email/confirm?token=${encodeURIComponent(token)}`;
}
