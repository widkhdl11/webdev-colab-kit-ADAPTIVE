import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readAdminBoxServiceFees } from "@/entities/payment/api/read-admin-pricing";
import { saveBoxServiceFees } from "@/features/admin-pricing-edit/model/save-box-service-fees";
import { psql, signedInClient } from "./helpers";

// /admin/pricing 의 선물함 서비스료 칸 (revgift-box INV-GB13~GB15, admin-console INV-K2) — 앱 저장 함수를 로그인한 세션으로 실제 DB 에 부른다.
// DB 함수 자체(대표만·범위·기록)는 revgift-box-pricing-db 가 본다. 여기서는 화면이 쓰는 읽기·저장 길이 DB 까지 이어지는지 본다.
// 시드: fankkuk_admin = 대표 운영자, fankkuk_staff = 직원 운영자. 시작 값은 DB 에서 읽어 끝나면 그대로 돌려놓는다.

let start: { regular: number; early: number };
let changesBefore: number;
let lastIdBefore: number;

function feesNow(): string {
  return psql("select box_service_fee_krw || '/' || box_early_service_fee_krw from public.pricing_settings");
}
function boxChangeCount(): number {
  return Number(psql("select count(*) from public.pricing_setting_changes where item in ('box_service_fee', 'box_early_service_fee')"));
}

beforeAll(() => {
  const [regular, early] = feesNow().split("/").map(Number);
  start = { regular, early };
  changesBefore = boxChangeCount();
  lastIdBefore = Number(psql("select coalesce(max(id), 0) from public.pricing_setting_changes"));
});

afterAll(() => {
  psql(
    [
      "begin;",
      `update public.pricing_settings set box_service_fee_krw = ${start.regular}, box_early_service_fee_krw = ${start.early};`,
      "set local session_replication_role = replica;",
      `delete from public.pricing_setting_changes where id > ${lastIdBefore} and item in ('box_service_fee', 'box_early_service_fee');`,
      "commit;",
    ].join(" "),
  );
});

describe("선물함 서비스료 칸 — 앱 읽기·저장 (INV-GB14·GB15)", () => {
  it("직원 운영자도 지금 값을 읽는다", async () => {
    const staff = await signedInClient("fankkuk_staff");
    expect(await readAdminBoxServiceFees(staff)).toEqual({ regularKrw: start.regular, earlyKrw: start.early });
  });

  it("대표가 저장하면 두 값이 바뀌고 바뀐 칸마다 기록 한 줄", async () => {
    const owner = await signedInClient("fankkuk_admin");
    const next = { regular_krw: start.regular + 100, early_krw: start.early + 50 };
    expect(await saveBoxServiceFees(owner, next)).toEqual({ status: 200, body: { ok: true } });
    expect(feesNow()).toBe(`${next.regular_krw}/${next.early_krw}`);
    expect(boxChangeCount()).toBe(changesBefore + 2);
    expect(await readAdminBoxServiceFees(owner)).toEqual({ regularKrw: next.regular_krw, earlyKrw: next.early_krw });
  });

  it("INV-K2 (실패경로): 직원 운영자가 저장하면 403, 값·기록 그대로", async () => {
    const staff = await signedInClient("fankkuk_staff");
    const before = feesNow();
    const count = boxChangeCount();
    expect((await saveBoxServiceFees(staff, { regular_krw: 900, early_krw: 100 })).status).toBe(403);
    expect(feesNow()).toBe(before);
    expect(boxChangeCount()).toBe(count);
  });

  it("실패경로: 초기 크리에이터 > 정가면 400, 값 그대로", async () => {
    const owner = await signedInClient("fankkuk_admin");
    const before = feesNow();
    expect((await saveBoxServiceFees(owner, { regular_krw: 500, early_krw: 600 })).status).toBe(400);
    expect(feesNow()).toBe(before);
  });
});
