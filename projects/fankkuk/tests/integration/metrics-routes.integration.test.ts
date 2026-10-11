import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestAccount, removeTestAccounts, type TestAccount } from "./account-fixtures";
import { deleteTestOrders, psql, SEED } from "./helpers";
import { sessionCookie } from "./together-helpers";

// 측정 화면과 utm 쿠키를 실제 서버에서 부른다 (docs/specs/metrics.md INV-Q1·Q2·Q4).
// 떠 있는 개발 서버(기본 http://localhost:3000, FK_TEST_APP_URL 로 바꿈)에 넘기기를 따라가지 않는 요청을 보낸다 — 서버가 꺼져 있으면 실패다.
// 개발 서버는 이 시험과 같은 로컬 Supabase 를 본다.

const APP = process.env.FK_TEST_APP_URL ?? "http://localhost:3000";
const PW = "fankkuk-local-1234";
const login = (id: string) => sessionCookie(`${id}@fankkuk.test`, PW);

async function open(path: string, cookie?: string): Promise<Response> {
  return fetch(`${APP}${path}`, { redirect: "manual", headers: { accept: "text/html", ...(cookie ? { cookie } : {}) } });
}

/** 응답이 심은 utm 쿠키 줄(없으면 null). */
function utmSetCookie(res: Response): string | null {
  return res.headers.getSetCookie().find((c) => c.startsWith("fk_utm=")) ?? null;
}

describe("INV-Q1 — 측정 화면은 운영자 틀 안", () => {
  let fan: TestAccount;
  let orderNo = "";

  beforeAll(async () => {
    fan = await createTestAccount({ tag: "mqr" });
    orderNo = `FC-QR${Date.now().toString(36).toUpperCase().slice(-5)}`;
    psql(
      `begin; set local session_replication_role = replica;
       insert into public.orders (order_no, fan_id, creator_id, item_kind, has_electronics_or_metal, status, registered_at)
       values ('${orderNo}', '${fan.userId}', '${SEED.haruCreatorId}', '시험 선물', false, 'registered', now() - interval '70 days');
       commit;`,
    );
  });
  afterAll(() => {
    deleteTestOrders();
    removeTestAccounts();
  });

  it("INV-Q1 (S1, 실패경로): 로그인 안 함 → 404", async () => {
    const res = await open("/admin/metrics");
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("재발송률");
  });

  it("INV-Q1 (S1, 실패경로): 팬 → 404", async () => {
    const res = await open("/admin/metrics", await login("byeolbit_fan"));
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("재발송률");
  });

  it("INV-Q1 (S1, 실패경로): 크리에이터 → 404", async () => {
    const res = await open("/admin/metrics", await login("haru_creator"));
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("재발송률");
  });

  it("INV-Q1·Q2 (S2): 직원 → 측정 화면. 팬 아이디·ID·주문번호는 화면에 없다", async () => {
    const res = await open("/admin/metrics", await login("fankkuk_staff"));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("재발송률");
    expect(html).toContain("감사 답장률");
    expect(html).not.toContain(fan.loginId);
    expect(html).not.toContain(fan.userId);
    expect(html).not.toContain(orderNo);
  });

  it("INV-Q1: 대표도 읽는다", async () => {
    const res = await open("/admin/metrics", await login("fankkuk_admin"));
    expect(res.status).toBe(200);
  });
});

describe("INV-Q4 — 공유 링크 utm 쿠키(처음 들어온 순간)", () => {
  it("INV-Q4: utm 이 붙은 주소로 처음 들어오면 30일 쿠키에 거른 값이 남는다", async () => {
    const res = await open("/about?utm_source=x_share&utm_medium=social&utm_campaign=launch-1");
    const line = utmSetCookie(res);
    expect(line).not.toBeNull();
    expect(line).toMatch(/^fk_utm=x_share\.social\.launch-1;/);
    expect(line).toMatch(/Max-Age=2592000/i);
    expect(line).toMatch(/HttpOnly/i);
    expect(line).toMatch(/SameSite=lax/i);
    expect(line).toMatch(/Path=\//i);
  });

  it("INV-Q4 (실패경로): 두 번째 방문에 다른 utm 이 와도 쿠키를 바꾸지 않는다", async () => {
    const first = utmSetCookie(await open("/about?utm_source=x_share"));
    expect(first).not.toBeNull();
    const cookie = first!.split(";")[0]!;
    const again = await open("/about?utm_source=community&utm_campaign=other", cookie);
    expect(utmSetCookie(again)).toBeNull();
  });

  it("INV-Q4 (S4, 실패경로): <script> 가 든 utm 은 저장하지 않는다", async () => {
    const res = await open(`/about?utm_source=${encodeURIComponent("<script>alert(1)</script>")}`);
    expect(utmSetCookie(res)).toBeNull();
  });

  it("INV-Q4 (실패경로): 틀린 값만 빠지고 맞는 값은 남는다", async () => {
    const res = await open(`/about?utm_source=${encodeURIComponent("<b>")}&utm_campaign=launch`);
    expect(utmSetCookie(res)).toMatch(/^fk_utm=\.\.launch;/);
  });

  it("INV-Q4: utm 이 없는 주소는 쿠키를 만들지 않는다", async () => {
    expect(utmSetCookie(await open("/about"))).toBeNull();
  });
});
