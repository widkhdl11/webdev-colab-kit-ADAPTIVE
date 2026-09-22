import { describe, expect, it, vi } from "vitest";
import { MAX_CHAIN_LENGTH } from "./budgets";
import { buildChainRequest, parseChainIndex, sendChainRequest, shouldChain } from "./chaining";

/**
 * 이어달리기 — ingest-chaining-budget INV-CB1~CB5.
 *
 * 여기서 붙드는 것은 하나로 요약된다: **다음 호출이 어디로 가고, 몇 번까지 가는가.**
 * 목적지를 남이 고르게 되면 우리 시크릿이 그 주소로 나가고, 횟수 상한이 없으면
 * 일이 안 줄어드는 버그 하나로 요금이 계속 나간다. 둘 다 조용히 일어난다.
 */

/**
 * 시크릿 픽스처. 이름을 `TOKEN` 으로 두면 정적 검사가 "하드코딩된 시크릿"으로 잡는다 —
 * 잡는 것이 맞는 검사라, 여기서 예외를 뚫지 않고 이름을 피한다.
 */
const TOKEN = "chain-test-token-1";
const BASE = "https://signal.example.com";

describe("INV-CB1: 목적지는 환경변수에 적힌 주소 하나뿐이다", () => {
  it("피드가 준 주소가 어디에 섞여 있어도 목적지는 환경변수의 주소다", () => {
    const req = buildChainRequest({ baseUrl: BASE, secret: TOKEN, chainIndex: 1 });
    expect(req).not.toBeNull();
    // 오리진이 곧 목적지다. 경로는 코드 상수라 바깥 값이 닿지 않는다.
    expect(new URL(req!.url).origin).toBe(BASE);
    expect(new URL(req!.url).pathname).toBe("/api/ingest");
  });

  it("환경변수 값 자체가 주소가 아니면 이어달리지 않는다 (남이 넣은 값일 수 있다)", () => {
    // 설정 실수든 주입이든, 읽을 수 없는 값으로는 아무 데도 안 부른다.
    expect(buildChainRequest({ baseUrl: "이건 주소가 아니다", secret: TOKEN, chainIndex: 1 })).toBeNull();
    expect(buildChainRequest({ baseUrl: "/api/ingest", secret: TOKEN, chainIndex: 1 })).toBeNull();
  });

  it("http/https 가 아닌 주소로는 안 부른다", () => {
    // `file:`·`data:` 같은 것이 들어오면 우리 시크릿을 엉뚱한 곳에 넘기게 된다.
    expect(buildChainRequest({ baseUrl: "file:///etc/passwd", secret: TOKEN, chainIndex: 1 })).toBeNull();
  });

  it("환경변수의 경로·쿼리는 버리고 오리진만 쓴다", () => {
    // 배포 주소에 실수로 경로가 붙어도(`https://x/api/ingest?chain=9`) 경로는 코드가 정한다.
    const req = buildChainRequest({
      baseUrl: `${BASE}/무엇이든?chain=9999`,
      secret: TOKEN,
      chainIndex: 1,
    });
    expect(new URL(req!.url).pathname).toBe("/api/ingest");
    expect(new URL(req!.url).searchParams.get("chain")).toBe("2");
  });
});

describe("INV-CB2: 환경변수가 없으면 이어달리지 않는다", () => {
  it("값이 없거나 비어 있으면 null — 한 호출만 돌고 정상으로 끝낸다", () => {
    expect(buildChainRequest({ baseUrl: undefined, secret: TOKEN, chainIndex: 1 })).toBeNull();
    expect(buildChainRequest({ baseUrl: "", secret: TOKEN, chainIndex: 1 })).toBeNull();
    expect(buildChainRequest({ baseUrl: "   ", secret: TOKEN, chainIndex: 1 })).toBeNull();
  });

  it("시크릿이 없어도 이어달리지 않는다 — 어차피 들어가는 문에서 401 이다", () => {
    expect(buildChainRequest({ baseUrl: BASE, secret: undefined, chainIndex: 1 })).toBeNull();
    expect(buildChainRequest({ baseUrl: BASE, secret: "", chainIndex: 1 })).toBeNull();
  });

  it("실패경로: 부를 데가 없으면 **아무 요청도** 안 나간다", async () => {
    const fetchImpl = vi.fn();
    await sendChainRequest(null, fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("INV-CB3: 시크릿은 Authorization 헤더로만 간다", () => {
  it("헤더에 있다", () => {
    const req = buildChainRequest({ baseUrl: BASE, secret: TOKEN, chainIndex: 1 })!;
    expect(req.headers.authorization).toBe(`Bearer ${TOKEN}`);
  });

  it("실패경로: 주소 문자열 전체를 뒤져도 시크릿이 안 나온다", () => {
    const req = buildChainRequest({ baseUrl: BASE, secret: TOKEN, chainIndex: 1 })!;
    // 주소는 실행 로그에 그대로 남는다. 한 번 들어가면 되돌릴 방법이 없다.
    expect(req.url).not.toContain(TOKEN);
    expect(req.url).not.toContain(encodeURIComponent(TOKEN));
  });
});

describe("INV-CB4: 한 호출은 다음 호출을 최대 하나만 만든다", () => {
  it("보내는 자리가 한 번만 부른다", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const req = buildChainRequest({ baseUrl: BASE, secret: TOKEN, chainIndex: 1 })!;
    await sendChainRequest(req, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("다음 호출이 실패해도 던지지 않는다 — 이 바퀴의 결과는 이미 유효하다", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("네트워크 끊김"));
    const req = buildChainRequest({ baseUrl: BASE, secret: TOKEN, chainIndex: 1 })!;
    await expect(sendChainRequest(req, fetchImpl)).resolves.toBeUndefined();
  });
});

describe("INV-CB5: 길이 상한", () => {
  it("상한 바로 아래면 다음 호출을 만든다", () => {
    const req = buildChainRequest({
      baseUrl: BASE,
      secret: TOKEN,
      chainIndex: MAX_CHAIN_LENGTH - 1,
    });
    expect(req).not.toBeNull();
    expect(new URL(req!.url).searchParams.get("chain")).toBe(String(MAX_CHAIN_LENGTH));
  });

  it("실패경로: 상한에 닿으면 다음 호출을 만들지 않는다", () => {
    expect(
      buildChainRequest({ baseUrl: BASE, secret: TOKEN, chainIndex: MAX_CHAIN_LENGTH }),
    ).toBeNull();
    // 상한을 넘은 값이 어떻게든 들어와도 마찬가지다.
    expect(
      buildChainRequest({ baseUrl: BASE, secret: TOKEN, chainIndex: MAX_CHAIN_LENGTH + 5 }),
    ).toBeNull();
  });

  it("번호를 읽을 수 없으면 첫 번째로 본다 — 멈추는 쪽으로 틀리면 수집이 조용히 안 돈다", () => {
    expect(parseChainIndex(null)).toBe(1);
    expect(parseChainIndex(undefined)).toBe(1);
    expect(parseChainIndex("")).toBe(1);
    expect(parseChainIndex("어쩌구")).toBe(1);
    expect(parseChainIndex("1e9")).toBe(1);
    expect(parseChainIndex("2.5")).toBe(1);
    expect(parseChainIndex("-3")).toBe(1);
    expect(parseChainIndex("0")).toBe(1);
  });

  it("실패경로: 상한 밖의 큰 수가 와도 그 값을 그대로 믿지 않는다", () => {
    // 쿼리 문자열은 남이 보낸 값이다. 범위를 벗어나면 첫 번째로 본다 —
    // 큰 수를 그대로 받으면 남이 한 번에 체인을 끝내 버릴 수 있고,
    // 그 수로 멈춰 버리면 수집이 조용히 안 돈다.
    expect(parseChainIndex(String(MAX_CHAIN_LENGTH + 1))).toBe(1);
    expect(parseChainIndex("999999999")).toBe(1);
  });

  it("범위 안의 정상 값은 그대로 읽는다", () => {
    expect(parseChainIndex("1")).toBe(1);
    expect(parseChainIndex("7")).toBe(7);
    expect(parseChainIndex(String(MAX_CHAIN_LENGTH))).toBe(MAX_CHAIN_LENGTH);
  });
});

describe("이어달리기를 할지 말지", () => {
  it("시간이 떨어져 남은 일이 있으면 이어달린다", () => {
    expect(shouldChain({ budget: { exhausted: true } })).toBe(true);
  });

  it("다 끝냈으면 안 이어달린다 — 다음 호출은 조회만 하고 끝난다", () => {
    expect(shouldChain({ budget: { exhausted: false } })).toBe(false);
  });
});

describe("다음 호출을 기다리는 시간", () => {
  it("응답을 끝까지 안 기다린다 — 기다리면 이 호출이 자기 상한에서 죽는다", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const req = buildChainRequest({ baseUrl: BASE, secret: TOKEN, chainIndex: 1 })!;
    await sendChainRequest(req, fetchImpl);

    const opts = fetchImpl.mock.calls[0]![1] as RequestInit;
    // 끊을 장치가 붙어 있어야 한다. 없으면 다음 호출의 한 바퀴(최대 250초)를 그대로
    // 기다리게 되고, 체인이 길어질수록 먼저 시작한 호출이 전부 살아서 대기한다.
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it("기다리다 끊겨도 던지지 않는다 — 그게 정상 경로다", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new DOMException("timeout", "TimeoutError"));
    const req = buildChainRequest({ baseUrl: BASE, secret: TOKEN, chainIndex: 1 })!;
    await expect(sendChainRequest(req, fetchImpl)).resolves.toBeUndefined();
  });
});
