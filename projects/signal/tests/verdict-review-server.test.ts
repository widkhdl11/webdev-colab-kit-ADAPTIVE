import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, appendFileSync, readdirSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * 판정 검토의 쓰기 경로 — docs/specs/verdict-review.md INV-VR3·VR4·VR5 의 서버 쪽.
 *
 * 실제 대시보드 서버(scripts/report-serve.mjs)를 임시 폴더로 띄워서 요청을 보낸다.
 * 이 PC 안의 127.0.0.1 만 쓰므로 오프라인 유닛과 같이 돈다(외부 네트워크 없음).
 * 거부 사례마다 **파일이 한 글자도 안 바뀌었는지**를 바이트로 본다.
 */

const SERVER = resolve(process.cwd(), "../../scripts/report-serve.mjs");
const PORT = 43000 + Math.floor(Math.random() * 1000);
const WEEK = "2026-W40";

let dir = "";
let proc: ChildProcess;

const sampleFile = () => join(dir, "review-samples", `${WEEK}.json`);

function freshSample(extractedAt = new Date().toISOString()) {
  return {
    week: WEEK,
    extracted_at: extractedAt,
    items: [
      { id: "11", title: "핫", source: "a", verdict: { hot: true, true_questions: ["변화"], reasons: {} } },
      { id: "22", title: "아님", source: "b", verdict: { hot: false, true_questions: [], reasons: {} } },
    ],
    answers: {},
  };
}

interface Res { status: number; body: string }

function post(path: string, body: string, headers: Record<string, string> = {}): Promise<Res> {
  return new Promise((ok, fail) => {
    const req = request(
      {
        host: "127.0.0.1", port: PORT, path, method: "POST",
        headers: {
          host: `localhost:${PORT}`, origin: `http://localhost:${PORT}`, "content-type": "application/json",
          "content-length": Buffer.byteLength(body), ...headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => ok({ status: res.statusCode ?? 0, body: data }));
      },
    );
    req.on("error", fail);
    req.end(body);
  });
}

const answer = (b: object, headers?: Record<string, string>) =>
  post(`/api/review-samples/${WEEK}`, JSON.stringify(b), headers);

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "verdict-review-"));
  mkdirSync(join(dir, "review-samples"));
  proc = spawn(process.execPath, [SERVER, "--project", "signal", "--report-dir", dir, "--port", String(PORT), "--no-open"], { stdio: "pipe" });
  let stderr = "";
  await new Promise<void>((ok, fail) => {
    const t = setTimeout(() => fail(new Error(`서버가 안 떴다: ${stderr}`)), 5000);
    proc.stderr?.on("data", (d) => (stderr += String(d)));
    proc.stdout?.on("data", (d) => { if (String(d).includes("대시보드")) { clearTimeout(t); ok(); } });
    // 포트가 우연히 잡혀 있으면 서버가 바로 끝난다 — 5초 기다리지 않고 원인과 함께 실패한다.
    proc.on("exit", (c) => { clearTimeout(t); fail(new Error(`서버가 끝났다(exit ${c}, 포트 ${PORT}): ${stderr}`)); });
  });
});

afterAll(() => {
  proc?.kill();
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  writeFileSync(sampleFile(), JSON.stringify(freshSample(), null, 2));
  rmSync(join(dir, "review-summary.jsonl"), { force: true });
});

/** 거부 사례: 상태 코드와 **파일 불변**을 같이 본다. */
async function expectRejected(res: Promise<Res>, status: number) {
  const before = readFileSync(sampleFile());
  const r = await res;
  expect(r.status).toBe(status);
  expect(readFileSync(sampleFile()).equals(before)).toBe(true);
}

describe("쓰기 경로 — 받는 것", () => {
  it("INV-VR3: 답을 누르면 표본 파일에 바로 저장되고, 다시 읽어도 남는다", async () => {
    const r = await answer({ id: "11", answer: "correct" });
    expect(r.status).toBe(200);
    const saved = JSON.parse(readFileSync(sampleFile(), "utf8"));
    expect(saved.answers["11"].answer).toBe("correct");
    expect(typeof saved.first_answer_at).toBe("string");
    // 새로고침 = 같은 파일을 정적 경로로 다시 읽는 것
    const again = await new Promise<string>((ok) => {
      request({ host: "127.0.0.1", port: PORT, path: `/review-samples/${WEEK}.json`, headers: { host: `localhost:${PORT}` } },
        (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => ok(d)); }).end();
    });
    expect(JSON.parse(again).answers["11"].answer).toBe("correct");
  });

  it("INV-VR3: 틀리다 + 방향은 direction 으로, 방향 없이 닫으면 방향 미상으로 저장된다", async () => {
    await answer({ id: "11", answer: "wrong", direction: "wrong_reason" });
    expect(JSON.parse(readFileSync(sampleFile(), "utf8")).answers["11"].direction).toBe("wrong_reason");
    await answer({ id: "11", answer: "wrong" });
    expect(JSON.parse(readFileSync(sampleFile(), "utf8")).answers["11"].direction).toBe("unknown");
  });

  it("INV-VR3: 아님 글의 틀리다는 고를 방향이 하나라 핫이슈여야 함으로 저장된다", async () => {
    await answer({ id: "22", answer: "wrong" });
    expect(JSON.parse(readFileSync(sampleFile(), "utf8")).answers["22"].direction).toBe("should_be_hot");
  });

  it("INV-VR2: 답을 적어도 표본 칸은 그대로고, 첫 답 시각은 처음 한 번만 적힌다", async () => {
    const before = JSON.parse(readFileSync(sampleFile(), "utf8"));
    await answer({ id: "11", answer: "correct" });
    const first = JSON.parse(readFileSync(sampleFile(), "utf8"));
    const { answers: _a, first_answer_at: f1, ...rest } = first;
    const { answers: _b, ...restBefore } = before;
    expect(rest).toEqual(restBefore);
    await answer({ id: "22", answer: "unsure" });
    const second = JSON.parse(readFileSync(sampleFile(), "utf8"));
    expect(second.first_answer_at).toBe(f1);
    // 전부 답이 생긴 순간이 한 번 적히고, 그 뒤 고쳐도 안 바뀐다 — 걸린 시간의 끝이다.
    expect(typeof second.completed_at).toBe("string");
    await answer({ id: "22", answer: "correct" });
    expect(JSON.parse(readFileSync(sampleFile(), "utf8")).completed_at).toBe(second.completed_at);
  });

  it("INV-VR3: 재답은 마지막 답이 유효하다", async () => {
    await answer({ id: "11", answer: "wrong", direction: "should_not_be_hot" });
    await answer({ id: "11", answer: "correct" });
    const a = JSON.parse(readFileSync(sampleFile(), "utf8")).answers["11"];
    expect(a.answer).toBe("correct");
    expect(a.direction).toBeUndefined();
  });

  it("INV-VR4: 동시에 여러 답이 와도 하나도 안 사라진다", async () => {
    // 서로 다른 글 30건에 한꺼번에 답한다. 쓰기를 줄 세우지 않으면 여러 요청이 같은 옛 내용을
    // 읽고 각자 써서 앞의 답이 지워진다 — 30건이 다 남는지로 본다.
    const ids = Array.from({ length: 30 }, (_, i) => `c${i}`);
    writeFileSync(sampleFile(), JSON.stringify({
      ...freshSample(),
      items: ids.map((id) => ({ id, title: id, source: "a", verdict: { hot: false, true_questions: [], reasons: {} } })),
    }, null, 2));
    const res = await Promise.all(ids.map((id) => answer({ id, answer: "correct" })));
    expect(res.map((r) => r.status)).toEqual(ids.map(() => 200));
    const a = JSON.parse(readFileSync(sampleFile(), "utf8")).answers;
    expect(Object.keys(a).sort()).toEqual([...ids].sort());
    // 반쯤 쓴 임시 파일이 남지 않는다
    expect(readdirSync(join(dir, "review-samples")).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });

  it("INV-VR4: 임시 파일에 먼저 쓴다 — 그 자리가 막히면 실패하고 원본은 그대로, 다음 답은 다시 받는다", async () => {
    const tmp = `${sampleFile()}.${proc.pid}.tmp`;
    mkdirSync(tmp); // 임시 파일 자리를 폴더로 막는다. 원본에 바로 쓰는 구현이면 여기서 200 이 난다.
    try {
      await expectRejected(answer({ id: "11", answer: "correct" }), 500);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
    // 쓰기 한 번이 실패해도 줄이 막히지 않는다
    expect((await answer({ id: "11", answer: "correct" })).status).toBe(200);
  });
});

describe("읽기 경로", () => {
  it("DNS 재바인딩한 외부 페이지는 활동 기록을 못 읽는다 (Host 가 다르면 403)", async () => {
    writeFileSync(join(dir, "activity.jsonl"), '{"tool":"Bash"}\n');
    const get = (host: string) => new Promise<number>((ok) => {
      request({ host: "127.0.0.1", port: PORT, path: "/activity.jsonl", headers: { host } }, (res) => { res.resume(); ok(res.statusCode ?? 0); }).end();
    });
    expect(await get(`evil.example:${PORT}`)).toBe(403);
    expect(await get(`localhost:${PORT}`)).toBe(200);
  });

  it("다른 사이트가 이 화면을 틀에 넣지 못한다", async () => {
    const headers = await new Promise<Record<string, unknown>>((ok) => {
      request({ host: "127.0.0.1", port: PORT, path: `/review-samples/${WEEK}.json`, headers: { host: `localhost:${PORT}` } },
        (res) => { res.resume(); ok(res.headers); }).end();
    });
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(String(headers["content-security-policy"])).toContain("frame-ancestors 'none'");
  });
});

describe("쓰기 경로 — 거부하고 파일에 손대지 않는 것", () => {
  it("INV-VR3: 판정과 맞지 않는 방향 (아님 글에 근거가 엉뚱함)", () =>
    expectRejected(answer({ id: "22", answer: "wrong", direction: "wrong_reason" }), 400));
  it("INV-VR3: 핫이슈 글에 핫이슈여야 함", () =>
    expectRejected(answer({ id: "11", answer: "wrong", direction: "should_be_hot" }), 400));
  it("INV-VR3: 맞다에 방향이 붙음", () =>
    expectRejected(answer({ id: "11", answer: "correct", direction: "unknown" }), 400));
  it("INV-VR3: 스키마 위반 — 모르는 칸", () =>
    expectRejected(answer({ id: "11", answer: "correct", note: "x" }), 400));
  it("INV-VR3: 스키마 위반 — 모르는 답", () =>
    expectRejected(answer({ id: "11", answer: "maybe" }), 400));
  it("INV-VR3: 스키마 위반 — JSON 아님", () =>
    expectRejected(post(`/api/review-samples/${WEEK}`, "id=11&answer=correct"), 400));
  it("INV-VR3: 없는 id", () =>
    expectRejected(answer({ id: "999", answer: "correct" }), 404));
  it("INV-VR3: 다른 파일 경로 — 주차 형식이 아님", () =>
    expectRejected(post("/api/review-samples/..%2Fstate", JSON.stringify({ id: "11", answer: "correct" })), 400));
  it("INV-VR3: 다른 파일 경로 — 쓰기 경로가 아닌 곳", () =>
    expectRejected(post("/state.json", JSON.stringify({ id: "11", answer: "correct" })), 405));
  it("INV-VR3: 외부 사이트에서 온 요청 (Origin 이 다름)", () =>
    expectRejected(answer({ id: "11", answer: "correct" }, { origin: "https://evil.example" }), 403));
  it("INV-VR3: DNS 재바인딩 (Host 가 다름)", () =>
    expectRejected(answer({ id: "11", answer: "correct" }, { host: `evil.example:${PORT}` }), 403));
  it("INV-VR3: Origin 이 null 인 요청 (샌드박스 틀·파일에서 연 페이지)", () =>
    expectRejected(answer({ id: "11", answer: "correct" }, { origin: "null" }), 403));
  it("INV-VR3: Origin 이 없는 요청", () =>
    expectRejected(answer({ id: "11", answer: "correct" }, { origin: "" }), 403));
  it("INV-VR3: JSON 이 아닌 content-type (브라우저 폼 전송)", () =>
    expectRejected(answer({ id: "11", answer: "correct" }, { "content-type": "text/plain" }), 415));

  it("INV-VR5: 7일이 지난 주는 답을 받지 않는다", async () => {
    writeFileSync(sampleFile(), JSON.stringify(freshSample(new Date(Date.now() - 7 * 86_400_000 - 1000).toISOString()), null, 2));
    await expectRejected(answer({ id: "11", answer: "correct" }), 409);
  });

  it("INV-VR5: 주간 실행이 닫기 시작한 주(닫힘 표지)는 답을 받지 않는다", async () => {
    const marker = join(dir, "review-samples", `${WEEK}.closing`);
    writeFileSync(marker, "x");
    try {
      await expectRejected(answer({ id: "11", answer: "correct" }), 409);
    } finally {
      rmSync(marker, { force: true });
    }
  });

  it("INV-VR5: 집계 줄이 있는 주(닫힌 주)는 답을 받지 않는다", async () => {
    appendFileSync(join(dir, "review-summary.jsonl"), JSON.stringify({ week: WEEK, status: "reviewed" }) + "\n");
    await expectRejected(answer({ id: "11", answer: "correct" }), 409);
  });
});
