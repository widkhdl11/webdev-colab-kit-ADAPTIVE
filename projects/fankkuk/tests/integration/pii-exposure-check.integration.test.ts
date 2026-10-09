import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertReadOnlyGet, piiFindings, runPiiExposureCheck, scanAppGets } from "../../scripts/pii-exposure.mjs";
import { psql, signedInClient } from "./helpers";

// 배포 전 개인정보 노출 검사(scripts/pii-exposure.mjs)가 실제로 잡는지 — address-protection INV-P9 · S9.
// 「0건」은 검사가 안 돈 것과 겉이 같으므로, 위반을 일부러 심고 그 위반이 잡히는지 본다. 심은 것은 시험마다 지운다.

const apiUrl = () => process.env.FK_TEST_API_URL ?? "";
const anonKey = () => process.env.FK_TEST_ANON_KEY ?? "";
const FAN: [string, string] = ["byeolbit_fan@fankkuk.test", "fankkuk-local-1234"];
const CREATOR: [string, string] = ["haru_creator@fankkuk.test", "fankkuk-local-1234"];
const sql = (q: string) => psql(q);
const check = (logins: [string, string][] = [FAN, CREATOR]) => runPiiExposureCheck({ apiUrl: apiUrl(), anonKey: anonKey(), logins, sql });

const PLANTED = ["pii_check_planted", "pii_check_planted_fn", "pii_check_planted_arg", "pii_check_planted_pii", "pii_check_planted_via", "pii_check_planted_fault"];

/** 데이터 API 가 표·함수 목록을 다시 읽을 때까지 */
async function reloadApi(name: string, present: boolean): Promise<void> {
  psql("notify pgrst, 'reload schema'");
  for (let i = 0; i < 50; i++) {
    // 서비스 키 목록은 모든 표·함수를 보인다 — 심은 것이 누구에게 열렸든 다시 읽혔는지 알 수 있다
    const key = process.env.FK_TEST_SERVICE_KEY ?? "";
    const r = await fetch(`${apiUrl()}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: "application/openapi+json" } });
    if ((await r.text()).includes(`/${name}"`) === present) return;
    await new Promise((res) => setTimeout(res, 100));
  }
  throw new Error(`데이터 API 가 ${name} 를 ${present ? "보이지" : "감추지"} 않는다`);
}

/** 로그인 사용자에게만 열린 함수를 심는다 */
async function plantFunction(name: string, signature: string, body: string, returns = "jsonb"): Promise<void> {
  // 「p_order_no text」 → 「text」 — revoke·grant 는 인자 타입만 받는다
  const types = signature.replace(/(\w+) (\w+)/g, "$2");
  psql(
    `create function public.${name}(${signature}) returns ${returns} language sql stable as $$ ${body} $$; revoke all on function public.${name}(${types}) from public, anon; grant execute on function public.${name}(${types}) to authenticated`,
  );
  await reloadApi(`rpc/${name}`, true);
}

afterEach(async () => {
  psql(
    `drop view if exists public.pii_check_planted; ${PLANTED.slice(1)
      .map((n) => `drop function if exists public.${n} cascade;`)
      .join(" ")}`,
  );
  await reloadApi("rpc/pii_check_planted_fn", false);
});

describe("INV-P9 S9: 배포 전 개인정보 노출 검사 — 응답", () => {
  it("INV-P9 S9: 지금 로컬 DB 는 익명·팬·크리에이터 어느 권한으로 열린 표·함수를 모두 불러도 개인정보 꼴이 0건이고, 구조 검사도 통과한다", async () => {
    const r = await check();
    expect(r.problems).toEqual([]);
    expect(r.roles.map((x) => x.label)).toEqual(["익명", "byeolbit_fan", "haru_creator"]);
    // 검사가 실제로 돌았다 — 로그인 권한에서 성공한 호출이 수십 개, 구조 검사가 허용 목록의 함수를 찾았다
    expect(r.roles[1]!.called).toBeGreaterThan(40);
    expect(r.touching).toContain("my_account");
  });

  it("INV-P9 S9 (실패경로): 익명에게 열린 뷰에 심은 전화번호·실명 칸을 잡고, 구조 검사도 그 칸 이름을 잡는다", async () => {
    psql(
      "create view public.pii_check_planted as select 'FC-PLANT'::text as order_no, '홍길동'::text as real_name, '010-1234-5678'::text as memo; grant select on public.pii_check_planted to anon",
    );
    await reloadApi("pii_check_planted", true);
    const r = await check();
    expect(r.problems).toEqual(
      expect.arrayContaining([
        "익명 표 pii_check_planted $[0].real_name 칸 이름",
        "익명 표 pii_check_planted $[0].memo 전화번호 꼴(13자)",
        "구조: public 표 칸 pii_check_planted.real_name — 개인정보는 pii 구역에만 둔다",
      ]),
    );
    // 출력에는 값을 찍지 않는다(INV-P10)
    expect(r.problems.join("\n")).not.toContain("010-1234-5678");
    expect(r.problems.join("\n")).not.toContain("홍길동");
  });

  it("INV-P9 S9 (실패경로): 로그인 사용자에게 열린 함수가 돌려준 주소 꼴 값을 팬·크리에이터 권한 모두에서 잡는다", async () => {
    await plantFunction("pii_check_planted_fn", "", "select jsonb_build_object('note', '서울시 마포구 어딘가 12')");
    const r = await check();
    expect(r.problems).toEqual(expect.arrayContaining(["byeolbit_fan 함수 pii_check_planted_fn $.note 주소 꼴(14자)", "haru_creator 함수 pii_check_planted_fn $.note 주소 꼴(14자)"]));
  });

  it("INV-P9 S9 (실패경로): 인자가 필요한 함수도 앞선 응답의 값(주문번호)으로 채워 불러서 잡는다", async () => {
    await plantFunction("pii_check_planted_arg", "p_order_no text", "select case when p_order_no like 'FC-%' then jsonb_build_object('memo', '010.9876.5432') else '{}'::jsonb end");
    const r = await check();
    expect(r.problems).toContain("byeolbit_fan 함수 pii_check_planted_arg $.memo 전화번호 꼴(13자)");
  });

  it("INV-P9 (실패경로): 함수가 DB 내부 오류(XX000)로 끝나면 확인하지 못한 것이라 실패다 — 함수가 스스로 낸 거부(P0002 등)는 아니다", async () => {
    psql(
      "create function public.pii_check_planted_fault() returns jsonb language plpgsql stable as $$ begin raise exception 'boom' using errcode = 'XX000'; end $$; revoke all on function public.pii_check_planted_fault() from public, anon; grant execute on function public.pii_check_planted_fault() to authenticated",
    );
    await reloadApi("rpc/pii_check_planted_fault", true);
    const r = await check([CREATOR]);
    expect(r.problems).toContain("haru_creator 함수 pii_check_planted_fault: 서버 오류 500 XX000");
    expect(r.problems.filter((p) => p.includes("서버 오류"))).toHaveLength(1);
    // 실패한 호출은 「부름」이 아니라 거부로 센다 — 실패해도 성공으로 세면 아무것도 못 본 검사가 통과한다
    const creator = r.roles.find((x) => x.label === "haru_creator")!;
    expect(creator.refused).toContain("pii_check_planted_fault:XX000");
  });
});

describe("INV-P9: 배포 전 개인정보 노출 검사 — 구조(쓰기 함수는 응답을 볼 수 없다)", () => {
  it("INV-P9 (실패경로): 로그인 키로 열린 함수가 개인정보 구역에 닿으면(다른 함수를 거쳐도) 허용 목록에 없을 때 잡는다", async () => {
    await plantFunction("pii_check_planted_pii", "", "select count(*)::int from pii.account_contacts", "integer");
    await plantFunction("pii_check_planted_via", "", "select public.pii_check_planted_pii()", "integer");
    const r = await check();
    expect(r.problems).toEqual(
      expect.arrayContaining([
        "구조: 로그인 키로 부를 수 있는 pii_check_planted_pii 가 개인정보 구역에 닿는다 — 무엇을 돌려주는지 보고 허용 목록에 올린다",
        "구조: 로그인 키로 부를 수 있는 pii_check_planted_via 가 개인정보 구역에 닿는다 — 무엇을 돌려주는지 보고 허용 목록에 올린다",
      ]),
    );
  });

  it("INV-P9 (실패경로): 허용 목록의 함수가 로그인 키에 닫히면 목록이 낡았다고 잡는다", async () => {
    psql("revoke execute on function public.my_creator_address_status() from authenticated");
    try {
      const r = await check([FAN, CREATOR]);
      expect(r.problems).toContain("구조: 허용 목록의 my_creator_address_status 는 이제 개인정보 구역에 닿지 않거나 로그인 키에 닫혔다 — 목록에서 뺀다");
    } finally {
      psql("grant execute on function public.my_creator_address_status() to authenticated");
    }
  });
});

describe("INV-P9: 배포 전 개인정보 노출 검사 — 끝까지 확인하지 못하면 실패", () => {
  it("INV-P9 (실패경로): 로그인 계정이나 DB 연결 없이 돌리면 아무것도 부르지 않고 실패다", async () => {
    const noLogin = await check([]);
    expect(noLogin.problems[0]).toMatch(/로그인 계정이 없다/);
    expect(noLogin.roles).toEqual([]);
    const noSql = await runPiiExposureCheck({ apiUrl: apiUrl(), anonKey: anonKey(), logins: [FAN] });
    expect(noSql.problems[0]).toMatch(/DB 연결이 없다/);
    expect(noSql.roles).toEqual([]);
  });

  it("INV-P9 (실패경로): 읽기 전용을 확인할 크리에이터 계정이 없으면 검사 전체가 멈춘다", async () => {
    await expect(check([FAN])).rejects.toThrow(/확인하지 못했다/);
    const creator = await signedInClient("haru_creator");
    const token = (await creator.auth.getSession()).data.session!.access_token;
    await expect(assertReadOnlyGet(apiUrl(), anonKey(), [token])).resolves.toBeUndefined();
  });
});

describe("INV-P9: 배포 전 개인정보 노출 검사 — 앱 GET 경로", () => {
  it("INV-P9 (실패경로): 앱 GET 경로의 본문과 돌려보내는 주소에 든 개인정보 꼴을 잡고, 동적 구간 경로는 못 부름으로 센다", async () => {
    const appDir = mkdtempSync(join(tmpdir(), "pii-app-"));
    for (const [dir, code] of [
      ["api/leak", "export async function GET() {}"],
      ["api/bounce", "export async function GET() {}"],
      ["api/write", "export async function POST() {}"],
      ["api/[id]", "export async function GET() {}"],
    ] as const) {
      mkdirSync(join(appDir, dir), { recursive: true });
      writeFileSync(join(appDir, dir, "route.ts"), code);
    }
    const server = createServer((req, res) => {
      if (req.url === "/api/leak") return res.end(JSON.stringify({ recipient_name: "홍길동" }));
      if (req.url === "/api/bounce") {
        res.writeHead(307, { location: "/done?to=010-2222-3333" });
        return res.end();
      }
      res.statusCode = 404;
      res.end();
    });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    try {
      const r = await scanAppGets(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, appDir);
      expect(r.routes).toBe(3);
      expect(r.called).toBe(2);
      expect(r.skipped).toEqual(["/api/[id]"]);
      expect([...r.findings].sort()).toEqual(["익명 앱 GET /api/bounce 돌려보내는 주소 $ 전화번호 꼴(22자)", "익명 앱 GET /api/leak $.recipient_name 칸 이름"]);
    } finally {
      server.close();
      rmSync(appDir, { recursive: true, force: true });
    }
  });
});

describe("INV-P9: 개인정보 꼴 판정", () => {
  it("INV-P9: 칸 이름 갈래마다 — 주소·암호문·봉인 주소·받는 사람·우편번호·이메일 칸을 잡는다", () => {
    for (const key of ["address", "ciphertext", "wrapped_key", "envelope", "recipient", "zip_code", "postcode", "email", "phone", "mobile", "real_name"]) {
      expect(piiFindings({ [key]: "x" }), key).toEqual([`$.${key} 칸 이름`]);
    }
    // 원 송장 봉투 번호·참거짓 칸은 아니다
    expect(piiFindings({ has_address: true, envelope_no: "E-1" })).toEqual([]);
  });

  it("INV-P9: 값 꼴 — +82·점 구분 번호, 시 없는 「구 + 로 + 번지」 주소, 이메일을 잡고 id·송장번호 안의 숫자는 아니다", () => {
    expect(piiFindings({ a: "+82 10-1234-5678" })).toEqual(["$.a 전화번호 꼴(16자)"]);
    expect(piiFindings({ a: "010.1234.5678" })).toEqual(["$.a 전화번호 꼴(13자)"]);
    expect(piiFindings({ a: "마포구 월드컵로 12" })).toEqual(["$.a 주소 꼴(11자)"]);
    expect(piiFindings({ a: "me@example.com" })).toEqual(["$.a 이메일 꼴(14자)"]);
    expect(piiFindings({ id: "ef0160445216", waybill: "020194399903", order_no: "FC-7K3M9" })).toEqual([]);
  });

  it("INV-P9 · my-account INV-A2: 가린 번호·본인 이메일은 내 정보 응답에서 그 꼴일 때만 통과한다 — 다른 함수거나 전체 번호면 잡는다", () => {
    expect(piiFindings({ phone_masked: "010-****-5678", email: "me@example.com" }, "my_account")).toEqual([]);
    expect(piiFindings({ phone_masked: "010-1234-5678" }, "my_account")).toEqual(["$.phone_masked 칸 이름", "$.phone_masked 전화번호 꼴(13자)"]);
    expect(piiFindings({ phone_masked: "010-****-5678" }, "list_creators")).toEqual(["$.phone_masked 칸 이름"]);
  });
});
