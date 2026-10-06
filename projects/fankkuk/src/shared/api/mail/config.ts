// 메일 보내기 설정 읽기의 정본. 메일은 표준 메일 전송 방식(SMTP)으로 보낸다(my-account 스펙 비범위 — 운영 서비스는 배포 전에 정한다).
// 개발에서는 값이 없으면 로컬 Supabase 의 메일 확인 화면(Mailpit, config.toml [local_smtp])으로 보낸다.
// 운영에서는 기본값을 쓰지 않는다 — 빠진 값이 있으면 시작하지 않는다. 값은 오류 메시지에 넣지 않는다. 이름만.

import { isProduction } from "@/shared/lib/env/is-production";

type EnvLike = Record<string, string | undefined>;

export type MailConfig = {
  host: string;
  port: number;
  /** 보내는 사람 — `이름 <주소>` 꼴. */
  from: string;
  /** 메일 속 링크가 가리키는 사이트 주소(끝 / 없이). 요청 헤더에서 만들지 않는다 — Host 를 바꾼 요청이 남의 사이트 링크를 메일에 넣게 된다. */
  appOrigin: string;
};

const DEV_DEFAULTS = {
  SMTP_HOST: "127.0.0.1",
  SMTP_PORT: "55325",
  MAIL_FROM: "팬꾹 <no-reply@fankkuk.test>",
  APP_ORIGIN: "http://127.0.0.1:3311",
} as const;

export function readMailConfig(env: EnvLike): MailConfig {
  const production = isProduction(env);
  const pick = (name: keyof typeof DEV_DEFAULTS): string => {
    const value = env[name] ?? (production ? undefined : DEV_DEFAULTS[name]);
    if (!value) throw new Error(`${name} 이 없다`);
    return value;
  };
  const port = Number(pick("SMTP_PORT"));
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error("SMTP_PORT 가 포트 번호가 아니다");
  const appOrigin = pick("APP_ORIGIN");
  let parsed: URL;
  try {
    parsed = new URL(appOrigin);
  } catch {
    throw new Error("APP_ORIGIN 이 주소가 아니다");
  }
  if (parsed.origin !== appOrigin.replace(/\/$/, "")) throw new Error("APP_ORIGIN 은 경로 없는 사이트 주소여야 한다");
  if (production && parsed.protocol !== "https:") throw new Error("APP_ORIGIN 은 운영에서 https 여야 한다");
  return { host: pick("SMTP_HOST"), port, from: pick("MAIL_FROM"), appOrigin: parsed.origin };
}
