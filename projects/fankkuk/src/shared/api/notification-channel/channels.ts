import { isProduction, type DeployEnv } from "@/shared/lib/env/is-production";
import type { SendMail } from "../mail/smtp";

// 알림 발송 통로 (notifications INV-N7·N10·N11). 통로를 고르는 곳은 이 함수 하나다.
// 카카오 알림톡 대행사는 아직 정하지 않았다(스펙 비범위 — 사람이 고른다). 그래서 지금 카카오 통로는 로컬의 가짜뿐이고,
// 가짜는 알림톡 대신 같은 본문을 로컬 메일 확인 화면으로 보낸다. 운영에서 가짜를 켜는 설정은 일부러 두지 않는다
// (승인 서명 창구 approval-signer 와 같은 이유). 운영에서 카카오 템플릿 코드가 있는데 대행사가 없으면 시작하지 않는다.
// 오류는 코드만 넘긴다 — 메일 서버·대행사의 오류 문장은 주소·번호를 되풀이할 수 있다(INV-N10).

export type ChannelMessage = {
  /** 발송 대기 줄 id — 대행사에 우리 발송 번호로 넘겨 나중에 조회한다(INV-N5) */
  outboxId: string;
  /** 보내는 순간 읽은 연락처(휴대폰 번호 또는 확인된 이메일). 어디에도 남기지 않는다. */
  to: string;
  subject: string;
  text: string;
  /** 카카오만 — 그 종류의 승인된 템플릿 코드(INV-N7) */
  templateCode: string | null;
};

export type NotificationChannel = {
  fake: boolean;
  send(message: ChannelMessage): Promise<{ providerMessageId: string | null }>;
  /** 발송 조회 — 우리 발송 번호로 실제로 갔는지. 조회가 없는 통로(메일)는 null. */
  lookup: ((outboxId: string) => Promise<boolean>) | null;
};

export type NotificationChannels = { email: NotificationChannel; kakao: NotificationChannel | null };

/** 통로가 돌려준 실패. code 는 발송 기록에 남는 값이라 소문자·숫자·밑줄만(DB 제약과 같다). */
export class ChannelError extends Error {
  constructor(readonly code: string) {
    super(`알림 발송 실패: ${code}`);
    this.name = "ChannelError";
  }
}

/** 로컬 가짜 카카오가 보내는 메일 주소. 받는 사람 번호는 메일 주소로도, 본문으로도 쓰지 않는다. */
export const FAKE_KAKAO_INBOX = "kakao-fake@fankkuk.test";

function emailChannel(sendMail: SendMail): NotificationChannel {
  return {
    fake: false,
    async send({ to, subject, text }) {
      try {
        await sendMail({ to, subject, text });
      } catch {
        throw new ChannelError("smtp_error");
      }
      return { providerMessageId: null };
    },
    lookup: null,
  };
}

function fakeKakaoChannel(sendMail: SendMail): NotificationChannel {
  return {
    fake: true,
    async send({ subject, text, templateCode }) {
      if (!templateCode) throw new ChannelError("template_missing");
      try {
        await sendMail({ to: FAKE_KAKAO_INBOX, subject: `[카카오 알림톡 대신 · ${templateCode}] ${subject}`, text });
      } catch {
        throw new ChannelError("fake_kakao_error");
      }
      return { providerMessageId: null };
    },
    // 가짜는 보낸 기록이 없다 — 멈춘 줄은 「안 갔다」로 보고 다시 보낸다(로컬에서 두 번 가도 해가 없다)
    lookup: async () => false,
  };
}

export function chooseNotificationChannels(env: DeployEnv, deps: { sendMail: SendMail; hasKakaoTemplates: boolean }): NotificationChannels {
  const email = emailChannel(deps.sendMail);
  if (isProduction(env)) {
    // 실제 알림톡 대행사가 붙으면 여기서 그 통로를 돌려준다
    if (deps.hasKakaoTemplates) throw new Error("카카오 템플릿 코드가 설정돼 있는데 알림톡 대행사 설정(KAKAO_ALIMTALK_*)이 없다");
    return { email, kakao: null };
  }
  return { email, kakao: fakeKakaoChannel(deps.sendMail) };
}
