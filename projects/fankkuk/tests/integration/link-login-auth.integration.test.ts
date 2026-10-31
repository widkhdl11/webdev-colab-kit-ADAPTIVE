import type { CookieMethodsServer } from "@supabase/ssr";
import { afterEach, describe, expect, it } from "vitest";
import { loginLinksOf } from "@/entities/session/api/login-links";
import { newLoginLinkToken } from "@/entities/session/model/login-link";
import { readVerifiedUserId } from "@/entities/session/model/viewer";
import { linkSignIn } from "@/features/auth/model/link-sign-in";
import type { ChannelMessage, NotificationChannel } from "@/features/notification-dispatch/api/channels";
import { dispatchNotifications } from "@/features/notification-dispatch/model/dispatch-notifications";
import { sessionActivityOf, sessionCookieMaxAgeFor } from "@/entities/session/api/session-activity";
import { sessionCookieMaxAgeSeconds } from "@/entities/session/model/session-lifetime";
import { createSessionClient } from "@/shared/api/supabase/session-cookies";
import { adminClient, deleteTestOrders, psql, SEED } from "./helpers";
import { paidGift } from "./office-helpers";

// 알림톡 링크로 바로 로그인 — 실제 로컬 Supabase(DB 함수 + Auth)와 맞물려 (docs/specs/link-login.md INV-K1·K2·K4·K6, S1·S1b·S3·S4).
// 쿠키는 브라우저 대신 메모리 저장소가 들고 있다 — 토큰 쓰기 라우트가 요청 세션 클라이언트를 넘기는 자리와 같다.
// 발송은 실제 일꾼(dispatchNotifications)에 보낸 것을 모으는 가짜 카카오 통로를 끼운다. 연락처 함수(manual/0011)가 적용된 로컬 DB 에서 돈다.

const OUTBOX = "public.notification_outbox";
const TEMPLATES = "public.notification_kakao_templates";
const TOKENS = "public.login_link_tokens";
const FAILURES = "public.login_link_failures";
const MAILPIT = "http://127.0.0.1:55324/api/v1/messages?limit=1";

afterEach(() => {
  deleteTestOrders();
  psql(`delete from ${OUTBOX}; delete from ${TEMPLATES}; delete from ${TOKENS}; delete from ${FAILURES};`);
});

type Jar = Map<string, { value: string; options: Record<string, unknown> }>;

function memoryCookies(jar: Jar): CookieMethodsServer {
  return {
    getAll: () => [...jar].map(([name, c]) => ({ name, value: c.value })),
    setAll: (list) => {
      for (const { name, value, options } of list) {
        if (value === "" || options?.maxAge === 0) jar.delete(name);
        else jar.set(name, { value, options: { ...options } });
      }
    },
  };
}

const config = () => ({ url: process.env.FK_TEST_API_URL ?? "", anonKey: process.env.FK_TEST_ANON_KEY ?? "" });
const dev = { NODE_ENV: "development" };
const session = (jar: Jar) => createSessionClient(config(), memoryCookies(jar), dev);

function signInWithLink(jar: Jar, token: string, logs: string[] = []) {
  const admin = adminClient();
  return linkSignIn({ links: loginLinksOf(admin), authAdmin: admin.auth.admin, auth: session(jar).auth, env: dev, log: (l) => logs.push(l) }, { t: token });
}

function kakaoCapture(): NotificationChannel & { sent: ChannelMessage[] } {
  const sent: ChannelMessage[] = [];
  return {
    sent,
    fake: true,
    async send(m) {
      sent.push(m);
      return { providerMessageId: null };
    },
    lookup: null,
  };
}

function emailSink(): NotificationChannel {
  return { fake: true, send: async () => ({ providerMessageId: null }), lookup: null };
}

/** 하루에게 결제된 선물 → 일꾼이 카카오 승인 요청을 로그인 링크 템플릿으로 보낸다. 보낸 토큰과 그 줄 id */
async function sentLoginLink(): Promise<{ token: string; outboxId: string; message: ChannelMessage }> {
  psql(`insert into ${TEMPLATES} (kind, template_code, login_link_template_code) values ('approval_request', 'TPL_APPROVAL', 'TPL_APPROVAL_LINK')`);
  const g = await paidGift();
  const outboxId = psql(`select id from ${OUTBOX} where order_id = '${g.orderId}' and kind = 'approval_request' and channel = 'kakao'`);
  const kakao = kakaoCapture();
  const result = await dispatchNotifications({ admin: adminClient(), appOrigin: "http://127.0.0.1:3311", chooseChannels: () => ({ email: emailSink(), kakao }) });
  expect(result.ok).toBe(true);
  const message = kakao.sent.find((m) => m.outboxId === outboxId);
  expect(message?.templateCode).toBe("TPL_APPROVAL_LINK");
  const token = message!.variables!["#{token}"]!;
  expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  return { token, outboxId, message: message! };
}

/** 비밀번호로 로그인한 쿠키 저장소(시험 계정) */
async function passwordJar(loginId: string): Promise<Jar> {
  const jar: Jar = new Map();
  const { error } = await session(jar).auth.signInWithPassword({ email: `${loginId}@fankkuk.test`, password: "fankkuk-local-1234" });
  expect(error).toBeNull();
  return jar;
}

async function mailCount(): Promise<number> {
  const r = await fetch(MAILPIT);
  return ((await r.json()) as { total: number }).total;
}

describe("INV-K1·K4 (S1): 승인 요청 알림톡의 링크로 쿠키 없는 브라우저가 바로 로그인", () => {
  it("INV-K1 · INV-K4 (S1): 일꾼이 보낸 토큰으로 하루 계정에 로그인되고, 토큰 줄에 쓴 시각이 남는다", async () => {
    const { token } = await sentLoginLink();
    const jar: Jar = new Map();
    expect(await signInWithLink(jar, token)).toEqual({ outcome: "signed_in", accountId: SEED.creatorProfileId });
    expect(await readVerifiedUserId(session(jar).auth)).toBe(SEED.creatorProfileId);
    expect(psql(`select count(*) from ${TOKENS} where account_id = '${SEED.creatorProfileId}' and used_at is not null`)).toBe("1");
  });

  it("INV-K1 (S3): 발송 줄·토큰 표·실패 기록 어디에도 토큰 원문이 없다", async () => {
    const { token, outboxId } = await sentLoginLink();
    await signInWithLink(new Map(), token);
    await signInWithLink(new Map(), token);
    expect(psql(`select status from ${OUTBOX} where id = '${outboxId}'`)).toBe("sent");
    expect(psql(`select count(*) from ${OUTBOX} o where o::text like '%${token}%'`)).toBe("0");
    expect(psql(`select count(*) from ${TOKENS} t where t::text like '%${token}%'`)).toBe("0");
    expect(psql(`select count(*) from ${FAILURES} f where f::text like '%${token}%'`)).toBe("0");
  });

  it("INV-K6 · INV-L1 (S4): 링크로 받은 로그인 쿠키는 HttpOnly·SameSite=Lax, 유효기간은 크리에이터의 절대 기간(30일)", async () => {
    const { token } = await sentLoginLink();
    const jar: Jar = new Map();
    await signInWithLink(jar, token);
    expect(jar.size).toBeGreaterThan(0);
    for (const [, c] of jar) {
      expect(c.options.httpOnly).toBe(true);
      expect(c.options.sameSite).toBe("lax");
    }
    // 라우트가 쓰기 규칙에 넘기는 유효기간 = 링크 계정(크리에이터) 역할의 절대 기간(session-login INV-L16 — 30일)
    expect(await sessionCookieMaxAgeFor(session(jar).auth, sessionActivityOf(adminClient()))).toBe(sessionCookieMaxAgeSeconds("member"));
  });

  it("INV-K4: 1회용 로그인 값을 만들어도 메일은 나가지 않는다", async () => {
    const { token } = await sentLoginLink();
    const before = await mailCount();
    expect((await signInWithLink(new Map(), token)).outcome).toBe("signed_in");
    await new Promise((r) => setTimeout(r, 300));
    expect(await mailCount()).toBe(before);
  });
});

describe("INV-K2·K4 (실패경로): 두 번째·남의 토큰·만료", () => {
  it("INV-K2 · INV-K4 (S1b, 실패경로): 같은 링크를 두 번째 열면 로그인하지 않고, 실패 기록에 「이미 씀」, 로그에는 해시 앞 8자만", async () => {
    const { token } = await sentLoginLink();
    expect((await signInWithLink(new Map(), token)).outcome).toBe("signed_in");
    const second: Jar = new Map();
    const logs: string[] = [];
    expect(await signInWithLink(second, token, logs)).toEqual({ outcome: "failed" });
    expect(second.size).toBe(0);
    expect(psql(`select reason from ${FAILURES}`)).toBe("used");
    expect(logs.join("\n")).not.toContain(token);
  });

  it("INV-K4 (카드 d1): 하루로 로그인한 브라우저에서 하루의 링크를 열면 그 로그인 그대로 — 쿠키를 새로 쓰지 않는다", async () => {
    const { token } = await sentLoginLink();
    const jar = await passwordJar("haru_creator");
    const before = JSON.stringify([...jar]);
    expect(await signInWithLink(jar, token)).toEqual({ outcome: "kept" });
    expect(JSON.stringify([...jar])).toBe(before);
    expect(await readVerifiedUserId(session(jar).auth)).toBe(SEED.creatorProfileId);
  });

  it("INV-K4 (카드 d1, 실패경로): 별빛으로 로그인한 브라우저에서 하루의 링크를 열면 로그아웃 — 쿠키 저장소에 하루 세션도 별빛 세션도 남지 않는다", async () => {
    const { token } = await sentLoginLink();
    const jar = await passwordJar("byeolbit_fan");
    const fanCookies: Jar = new Map(jar);
    expect(await readVerifiedUserId(session(jar).auth)).toBe(SEED.fanId);
    expect(await signInWithLink(jar, token)).toEqual({ outcome: "signed_out" });
    // 응답 뒤 저장소: 로그인 쿠키가 하나도 없다 — 링크 계정 세션이 아니다
    expect([...jar.keys()].filter((n) => n.includes("auth-token"))).toEqual([]);
    expect(await readVerifiedUserId(session(jar).auth)).toBeNull();
    // 끝낸 별빛 세션의 옛 쿠키를 다시 넣어도 들어가지 못한다(서버에서 세션이 끝났다)
    expect(await readVerifiedUserId(session(fanCookies).auth)).toBeNull();
    // 토큰은 쓴 것으로 처리된다(1회용) — 같은 링크로 다시 하루에 들어가지 못한다
    expect(await signInWithLink(new Map(), token)).toEqual({ outcome: "failed" });
  });

  it("INV-K4 (카드 d1): 별빛으로 로그인한 브라우저에서 이미 쓴 링크를 열면 별빛 로그인 그대로", async () => {
    const { token } = await sentLoginLink();
    expect((await signInWithLink(new Map(), token)).outcome).toBe("signed_in");
    const jar = await passwordJar("byeolbit_fan");
    expect(await signInWithLink(jar, token)).toEqual({ outcome: "kept" });
    expect(await readVerifiedUserId(session(jar).auth)).toBe(SEED.fanId);
  });

  it("INV-K1 (S1d, 실패경로): 30분이 지난 토큰으로는 로그인하지 않는다", async () => {
    const { token } = await sentLoginLink();
    psql(`update ${TOKENS} set created_at = created_at - public.login_link_ttl(), expires_at = expires_at - public.login_link_ttl()`);
    const jar: Jar = new Map();
    expect((await signInWithLink(jar, token)).outcome).toBe("failed");
    expect(jar.size).toBe(0);
    expect(psql(`select reason from ${FAILURES}`)).toBe("expired");
  });

  it("INV-K4 (실패경로): 발급된 적 없는 토큰은 로그인하지 않는다", async () => {
    const jar: Jar = new Map();
    expect((await signInWithLink(jar, newLoginLinkToken().token)).outcome).toBe("failed");
    expect(jar.size).toBe(0);
  });
});
