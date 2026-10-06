import type { OutgoingMail } from "@/shared/api/mail/smtp";

// 비밀번호 재설정 메일(session-login INV-L10). 본문에는 링크와 닉네임만 넣는다 — 휴대폰 번호·주소·선물 내용은 넣지 않는다.
// 링크는 우리 사이트의 재설정 화면이다(운영 계정의 로그인 주소는 메일이 갈 수 없는 주소라 Auth 의 재설정 메일을 쓰지 않는다, signup INV-U8).
// 받는 재료를 이 네 칸으로 묶어 다른 값이 본문에 섞일 자리를 만들지 않는다.

export type ResetMailInput = { to: string; nickname: string; token: string; appOrigin: string };

export function resetLink(appOrigin: string, token: string): string {
  return `${appOrigin}/password/reset?token=${encodeURIComponent(token)}`;
}

export function buildResetMail({ to, nickname, token, appOrigin }: ResetMailInput): OutgoingMail {
  return {
    to,
    subject: "[팬꾹] 비밀번호 재설정 링크예요",
    text: [
      `${nickname}님, 비밀번호 재설정을 요청하셨어요.`,
      "아래 링크를 눌러 새 비밀번호를 정해 주세요. 링크는 1시간 동안 한 번만 쓸 수 있어요.",
      "",
      resetLink(appOrigin, token),
      "",
      "직접 요청하신 게 아니라면 이 메일은 무시해 주세요. 비밀번호는 바뀌지 않아요.",
    ].join("\n"),
  };
}
