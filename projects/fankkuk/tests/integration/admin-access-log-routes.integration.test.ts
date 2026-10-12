import { describe, expect, it } from "vitest";
import { sessionCookie } from "./together-helpers";

// 관리자 「주소 열람 기록」 화면을 실제 서버에서 부른다 (address-protection INV-P7 (b) — 2026-10-12 문제집 D12).
// 거부 줄과 대표·직원 구분은 운영자만 본다 — 운영자가 아니면(손님 포함) 화면이 있는지도 알리지 않고 404(admin-console INV-K1).
// 떠 있는 개발 서버(기본 http://localhost:3000, FK_TEST_APP_URL 로 바꿈)에 넘기기를 따라가지 않는 요청을 보낸다 — 서버가 꺼져 있으면 실패다.

const APP = process.env.FK_TEST_APP_URL ?? "http://localhost:3000";
const PW = "fankkuk-local-1234";
const PATH = "/admin/access-log";
const HEADING = "주소 열람 기록";
const login = (id: string) => sessionCookie(`${id}@fankkuk.test`, PW);

async function open(cookie?: string): Promise<Response> {
  return fetch(`${APP}${PATH}`, { redirect: "manual", headers: { accept: "text/html", ...(cookie ? { cookie } : {}) } });
}

describe("INV-P7 (D12): 운영자 내부 열람 기록 화면은 운영자만", () => {
  it("INV-P7 (D12, 실패경로): 로그인 안 함 → 404", async () => {
    const res = await open();
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("운영자만 보는 내부 기록");
  });

  it.each(["byeolbit_fan", "haru_creator"])("INV-P7 (D12, 실패경로): %s → 404", async (id) => {
    const res = await open(await login(id));
    expect(res.status).toBe(404);
    expect(await res.text()).not.toContain("운영자만 보는 내부 기록");
  });

  it.each(["fankkuk_staff", "fankkuk_admin"])("INV-P7 (D12): %s → 200, 내부 기록 화면", async (id) => {
    const res = await open(await login(id));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(HEADING);
    expect(html).toContain("운영자만 보는 내부 기록");
  });
});
