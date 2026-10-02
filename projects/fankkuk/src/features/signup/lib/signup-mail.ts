import { confirmLink } from "@/entities/fan/lib/confirm-link";
import type { OutgoingMail } from "@/shared/api/mail/smtp";

// 가입 확인 메일(INV-U7). 본문에는 링크와 닉네임만 — 휴대폰 번호·주소·선물 내용은 넣지 않는다(INV-A8 과 같다).
// 남이 적은 주소로 갈 수 있는 메일이라, 주인이 아니면 무시하면 된다는 안내를 같이 둔다.

export type SignupMailInput = { to: string; nickname: string; token: string; appOrigin: string };

export function buildSignupMail({ to, nickname, token, appOrigin }: SignupMailInput): OutgoingMail {
  return {
    to,
    subject: "[팬꾹] 가입을 환영해요 — 이메일 주소를 확인해 주세요",
    text: [
      `${nickname}님, 팬꾹에 가입해 주셔서 고마워요.`,
      "아래 링크를 누르면 이 주소로 선물 소식을 받을 수 있어요. 링크는 24시간 동안 한 번만 쓸 수 있어요.",
      "",
      confirmLink(appOrigin, token),
      "",
      "직접 가입하신 게 아니라면 이 메일은 무시해 주세요. 이 주소로는 아무 소식도 가지 않아요.",
    ].join("\n"),
  };
}
