import { createTransport } from "nodemailer";
import type { MailConfig } from "./config";

// 메일 한 통 보내기(SMTP). 본문은 글자만 보낸다 — 무엇을 넣을지는 부르는 쪽이 정한다(INV-A8).
// 로컬 Mailpit 은 TLS 없이 받는다. 운영 메일 서비스는 배포 전에 정하고, 그때 TLS·인증 설정을 더한다(BACKLOG).

export type OutgoingMail = { to: string; subject: string; text: string };
export type SendMail = (mail: OutgoingMail) => Promise<void>;

export function createSmtpSender(config: Pick<MailConfig, "host" | "port" | "from">): SendMail {
  const transport = createTransport({ host: config.host, port: config.port, secure: false });
  return async (mail) => {
    // 받는 사람은 주소 하나로만 넘긴다 — 글자 그대로 넘기면 「이름 <주소>」·쉼표 목록으로 해석된다.
    await transport.sendMail({ from: config.from, to: { name: "", address: mail.to }, subject: mail.subject, text: mail.text });
  };
}
