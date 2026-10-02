import type { OutgoingMail } from "@/shared/api/mail/smtp";

// 이메일 확인 메일. 본문에는 링크와 닉네임만 넣는다 — 휴대폰 번호·주소·선물 내용은 넣지 않는다(INV-A8).
// 남이 적은 주소로 갈 수 있는 메일이라, 주인이 아니면 무시하면 된다는 안내를 같이 둔다.
// 받는 재료를 이 네 칸으로 묶어 두어 다른 값이 본문에 섞일 자리를 만들지 않는다.

export type VerificationMailInput = { to: string; nickname: string; token: string; appOrigin: string };

export function confirmLink(appOrigin: string, token: string): string {
  return `${appOrigin}/me/email/confirm?token=${encodeURIComponent(token)}`;
}

export function buildVerificationMail({ to, nickname, token, appOrigin }: VerificationMailInput): OutgoingMail {
  return {
    to,
    subject: "[팬꾹] 이메일 주소를 확인해 주세요",
    text: [
      `${nickname}님, 팬꾹 내 정보에서 이 주소로 이메일을 바꾸셨어요.`,
      "아래 링크를 누르면 이 주소로 바뀌어요. 링크는 24시간 동안 한 번만 쓸 수 있어요.",
      "",
      confirmLink(appOrigin, token),
      "",
      "직접 바꾸신 게 아니라면 이 메일은 무시해 주세요. 아무것도 바뀌지 않아요.",
    ].join("\n"),
  };
}
