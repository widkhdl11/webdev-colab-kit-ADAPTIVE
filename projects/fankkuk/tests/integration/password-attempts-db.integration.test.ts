import { afterEach, describe, expect, it } from "vitest";
import { adminClient, anonClient, holdRowLock, psql, signedInClient } from "./helpers";

// 비밀번호 확인 횟수 (session-login INV-L14, S12~S12d). 아이디마다 10분에 5번 틀리면 마지막으로 틀린 때부터 15분 막는다.
// DB 함수만 본다 — 시작(password_attempt_begin)·결과(password_attempt_finish)·재설정 뒤 풀기(password_attempt_clear).
// 시험 아이디는 앞머리 pa_ 로 가려 지운다(시드 아이디의 기록을 남기지 않는다).

const KEY = "pa_byeolbit";

function cleanup(): void {
  psql("delete from public.password_attempts where login_key like 'pa\\_%'");
}
afterEach(cleanup);

async function begin(key = KEY): Promise<number | null> {
  const r = await adminClient().rpc("password_attempt_begin", { p_login_key: key });
  if (r.error) throw new Error(`password_attempt_begin 실패: ${r.error.code}`);
  return r.data as number | null;
}

async function finish(id: number, ok: boolean): Promise<void> {
  const r = await adminClient().rpc("password_attempt_finish", { p_id: id, p_ok: ok });
  if (r.error) throw new Error(`password_attempt_finish 실패: ${r.error.code}`);
}

async function fail(times: number, key = KEY): Promise<void> {
  for (let i = 0; i < times; i++) {
    const id = await begin(key);
    if (id === null) throw new Error("막히기 전에 막혔다");
    await finish(id, false);
  }
}

/** 그 아이디의 기록을 minutes 분 앞으로 옮긴다(시간이 흐른 것처럼). */
function rewind(minutes: number, key = KEY): void {
  psql(`update public.password_attempts set at = at - interval '${minutes} minutes' where login_key = '${key}'`);
}

describe("비밀번호 확인 횟수 (INV-L14)", () => {
  it("INV-L14 (S12): 5번 틀리면 6번째 시작은 막히고 기록도 남지 않는다 — 15분이 지나면 다시 된다", async () => {
    await fail(5);
    expect(await begin()).toBeNull();
    expect(psql(`select count(*) from public.password_attempts where login_key = '${KEY}'`)).toBe("5");
    rewind(14);
    expect(await begin()).toBeNull();
    rewind(2);
    const id = await begin();
    expect(id).not.toBeNull();
  });

  it("INV-L14 (S12b): 4번 틀린 뒤 맞으면 횟수가 지워진다 — 그 뒤 다시 5번까지", async () => {
    await fail(4);
    const ok = await begin();
    expect(ok).not.toBeNull();
    await finish(ok!, true);
    await fail(4);
    expect(await begin()).not.toBeNull(); // 맞은 뒤 4번 + 이번 시작(결과 전) = 5번째 시작까지는 된다
  });

  it("INV-L14: 10분 넘게 흩어진 실패는 막지 않는다", async () => {
    await fail(2);
    rewind(9);
    await fail(2);
    rewind(3); // 처음 둘은 12분 전, 다음 둘은 3분 전
    await fail(1);
    expect(await begin()).not.toBeNull();
  });

  it("INV-L14 (S12c): 없는 아이디도 똑같이 세고 막는다", async () => {
    await fail(5, "pa_nobody_here");
    expect(await begin("pa_nobody_here")).toBeNull();
  });

  it("INV-L14 (S12c): 재설정이 끝나면(clear) 막힘이 바로 풀린다", async () => {
    await fail(5);
    expect(await begin()).toBeNull();
    const r = await adminClient().rpc("password_attempt_clear", { p_login_key: KEY });
    expect(r.error).toBeNull();
    expect(await begin()).not.toBeNull();
  });

  it("INV-L14: 아이디는 앞뒤 공백을 떼고 소문자로 맞춰 센다", async () => {
    await fail(3, "PA_ByeolBit ");
    await fail(2, "pa_byeolbit");
    expect(await begin(" pa_BYEOLBIT")).toBeNull();
  });

  it("INV-L14 (S12d, 동시): 4번 틀린 뒤 동시에 3번 시작하면 1번만 허락된다 — 결과 전 시도도 틀린 것으로 센다", async () => {
    await fail(4);
    const ids = await Promise.all([begin(), begin(), begin()]);
    expect(ids.filter((x) => x !== null)).toHaveLength(1);
  });

  it("INV-L14 (S12d, 동시): 다섯 번째 시작이 아직 끝나지 않은 동안 들어온 시작은 그것을 기다렸다가 막힌다", async () => {
    await fail(4);
    // 다른 연결이 다섯 번째 시작을 부른 채 2초 동안 처리를 끝내지 않는다 — 그 사이에 여기서 시작을 부른다
    const held = await holdRowLock(`select public.password_attempt_begin('${KEY}')`, 2);
    expect(await begin()).toBeNull();
    await held.released;
  });

  it("INV-L14 (실패경로): 결과는 한 번만 — 이미 결과가 난 시도를 맞음으로 바꿔 횟수를 지울 수 없다", async () => {
    await fail(4);
    const id = await begin();
    await finish(id!, false);
    await finish(id!, true);
    expect(await begin()).toBeNull();
  });

  it("INV-L14 (실패경로): 로그인한 사람·손님 키로는 세 함수를 부를 수 없고 표도 직접 못 본다", async () => {
    const fan = await signedInClient("byeolbit_fan");
    for (const c of [anonClient(), fan]) {
      expect((await c.rpc("password_attempt_begin", { p_login_key: KEY })).error).not.toBeNull();
      expect((await c.rpc("password_attempt_finish", { p_id: 1, p_ok: true })).error).not.toBeNull();
      expect((await c.rpc("password_attempt_clear", { p_login_key: KEY })).error).not.toBeNull();
      expect((await c.from("password_attempts").select("id")).error).not.toBeNull();
    }
  });

  it("INV-L14: 하루 지난 기록은 시도가 시작될 때 지워진다 — 표가 끝없이 커지지 않게", async () => {
    await fail(2, "pa_old_one");
    rewind(25 * 60, "pa_old_one");
    await begin();
    expect(psql("select count(*) from public.password_attempts where login_key = 'pa_old_one'")).toBe("0");
  });

  it("INV-L14 (실패경로): 빈 아이디·101자 아이디는 거부", async () => {
    for (const key of ["", "   ", "a".repeat(101)]) {
      expect((await adminClient().rpc("password_attempt_begin", { p_login_key: key })).error?.code).toBe("22023");
    }
  });
});
