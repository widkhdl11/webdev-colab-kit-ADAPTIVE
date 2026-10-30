import { z } from "zod";

// 내 정보 화면이 받는 모양. DB 함수 my_account 의 한 줄을 그대로 옮긴다.
// 「바로 받기」(notification-batching INV-NB5)는 my_account 가 아니라 my_notification_instant 가 따로 준다 — 둘째 인자로 받는다.
// 휴대폰은 DB 가 가린 모양만 온다(INV-A2) — 전체 번호를 담을 칸이 없다.

export type MyAccount = {
  loginId: string;
  nickname: string;
  /** 확인된 이메일. 알림 메일은 이 주소로만 간다(INV-A7). */
  email: string | null;
  /** 확인 메일을 보냈지만 아직 링크를 누르지 않은 주소. */
  pendingEmail: string | null;
  /** `010-****-5678` 꼴. 번호가 없으면 null. */
  phoneMasked: string | null;
  notifyKakao: boolean;
  notifyEmail: boolean;
  /** 선물 소식 바로 받기. 꺼짐이면 하루 한 번 묶음(INV-NB5). */
  notifyInstant: boolean;
};

const rowSchema = z.object({
  login_id: z.string(),
  nickname: z.string(),
  email: z.string().nullable(),
  pending_email: z.string().nullable(),
  phone_masked: z.string().regex(/^01\d-\*{4}-\d{4}$/).nullable(),
  notify_kakao: z.boolean(),
  notify_email: z.boolean(),
});

/** DB 한 줄을 화면 모양으로. 꼴이 틀리면 null — 특히 가리지 않은 번호가 오면 화면에 넘기지 않는다. */
export function toMyAccount(row: unknown, instant: unknown): MyAccount | null {
  const parsed = rowSchema.safeParse(row);
  if (!parsed.success || typeof instant !== "boolean") return null;
  const r = parsed.data;
  return {
    loginId: r.login_id,
    nickname: r.nickname,
    email: r.email,
    pendingEmail: r.pending_email,
    phoneMasked: r.phone_masked,
    notifyKakao: r.notify_kakao,
    notifyEmail: r.notify_email,
    notifyInstant: instant,
  };
}
