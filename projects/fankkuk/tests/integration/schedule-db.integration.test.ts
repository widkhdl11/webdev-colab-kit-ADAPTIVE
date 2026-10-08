import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { anonClient, deleteTestOrders, psql, signedInClient } from "./helpers";
import { paidGift } from "./office-helpers";

// 5분마다 저절로 도는 일 (office-workflow INV-W11 S11·S11b · notifications INV-N16, 정책 질문 ⑪).
// 자동 처리는 DB 예약 작업이 DB 안에서 직접, 알림 발송은 DB 예약 작업이 앱의 예약 발송 입구를 비밀 값과 함께 부른다.

const VAULT_NAMES = ["fankkuk_app_origin", "fankkuk_schedule_secret"];
const inVault = `name in ('${VAULT_NAMES.join("','")}')`;

// 배포 준비로 보관소에 실제 값이 들어 있는 DB 에서도 돌 수 있게, 시험 동안만 이름을 바꿔 비켜 두고 끝나면 되돌린다
beforeEach(() => {
  psql(`select vault.update_secret(id, null, name || '__aside') from vault.secrets where ${inVault}`);
});

afterEach(() => {
  deleteTestOrders();
  psql(`delete from vault.secrets where ${inVault}`);
  psql(`select vault.update_secret(id, null, replace(name, '__aside', '')) from vault.secrets where name like '%\\_\\_aside'`);
});

const job = (name: string) => psql(`select schedule || '|' || command from cron.job where jobname = '${name}'`);

describe("자동 처리 예약 (INV-W11)", () => {
  it("INV-W11 (S11): 자동 처리 예약 작업이 5분 간격으로 하나 있고, 그 명령을 돌리면 7일 지난 미승인 주문이 반려된다", async () => {
    const [schedule, command] = job("fankkuk-expiry").split("|");
    expect(schedule).toBe("*/5 * * * *");
    expect(psql(`select count(*) from cron.job where jobname = 'fankkuk-expiry'`)).toBe("1");

    const g = await paidGift(1);
    psql(`update public.orders set registered_at = now() - interval '169 hours' where id = '${g.orderId}'`);
    // 예약 작업 실행자처럼 DB 에 직접 연결해 그 명령을 그대로 돌린다
    psql(command!);
    expect(psql(`select status from public.orders where id = '${g.orderId}'`)).toBe("expired");
  });

  it("INV-W11 (S11b, 실패경로): 팬·크리에이터·익명이 앱 경로로 자동 처리·예약 함수를 부르면 거부되고 아무것도 바뀌지 않는다", async () => {
    const g = await paidGift(1);
    psql(`update public.orders set registered_at = now() - interval '169 hours' where id = '${g.orderId}'`);
    const clients = [await signedInClient("byeolbit_fan"), await signedInClient("haru_creator"), anonClient()];
    for (const c of clients) {
      expect((await c.rpc("office_run_expiry", {})).error?.code).toBe("42501");
      expect((await c.rpc("office_run_scheduled")).error).not.toBeNull();
      expect((await c.rpc("schedule_dispatch_notifications")).error).not.toBeNull();
    }
    expect(psql(`select status from public.orders where id = '${g.orderId}'`)).toBe("registered");
  });
});

describe("알림 발송 예약 (INV-N16)", () => {
  it("INV-N16: 발송 예약 작업이 5분 간격으로 하나 있고, 명령에 비밀 값이 들어 있지 않다", () => {
    const [schedule, command] = job("fankkuk-notify").split("|");
    expect(schedule).toBe("*/5 * * * *");
    expect(command).toBe("select public.schedule_dispatch_notifications()");
  });

  it("INV-N16 (실패경로): 비밀 보관소에 값이 없거나 32자보다 짧으면 앱을 부르지 않는다", () => {
    expect(psql(`select count(*) from vault.secrets where name in ('${VAULT_NAMES.join("','")}')`)).toBe("0");
    expect(psql(`select coalesce(public.schedule_dispatch_notifications()::text, 'none')`)).toBe("none");
    psql(`select vault.create_secret('http://host.docker.internal:3000', 'fankkuk_app_origin', 'schedule-db test')`);
    psql(`select vault.create_secret('${"s".repeat(31)}', 'fankkuk_schedule_secret', 'schedule-db test')`);
    expect(psql(`select coalesce(public.schedule_dispatch_notifications()::text, 'none')`)).toBe("none");
  });

  it("INV-N16 (실패경로): 로컬 주소가 아닌 http 주소면 비밀 값이 암호화 없이 나가므로 부르지 않는다", () => {
    psql(`select vault.create_secret('http://fankkuk.example.com', 'fankkuk_app_origin', 'schedule-db test')`);
    psql(`select vault.create_secret('${"s".repeat(40)}', 'fankkuk_schedule_secret', 'schedule-db test')`);
    expect(psql(`select coalesce(public.schedule_dispatch_notifications()::text, 'none')`)).toBe("none");
  });

  it("INV-N16: 보관소에 주소와 32자 이상 비밀 값이 있으면 요청을 하나 보낸다", () => {
    psql(`select vault.create_secret('http://host.docker.internal:59999', 'fankkuk_app_origin', 'schedule-db test')`);
    psql(`select vault.create_secret('${"s".repeat(40)}', 'fankkuk_schedule_secret', 'schedule-db test')`);
    expect(psql(`select coalesce(public.schedule_dispatch_notifications()::text, 'none')`)).not.toBe("none");
  });
});
