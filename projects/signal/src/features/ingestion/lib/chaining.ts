import { MAX_CHAIN_LENGTH } from "./budgets";

/**
 * 이어달리기 — ingest-chaining-budget INV-CB1~CB5.
 *
 * 한 바퀴는 실행 환경의 300초 안에서 끝나야 하는데 지금은 못 끝낸다. 그래서 한 호출이
 * 시간까지만 일하고 **남은 일을 다음 호출에 넘긴다.** 새 호출이라야 300초를 새로 받는다.
 *
 * 이 파일이 따로 있는 이유: 자기를 부르는 구조는 두 가지가 조용히 잘못될 수 있다 —
 * **목적지를 남이 고르게 되는 것**(그 요청에는 우리 시크릿이 실린다)과 **안 멈추는 것**.
 * 둘 다 실행 환경 없이 확인할 수 있어야 해서 순수 함수로 갈라 뒀다. `api/ports.ts` 안에
 * 두면 `server-only` 라 유닛이 로드조차 못 한다(`ENRICH_POOL` 100→10 사건과 같은 자리).
 */

/** 다음 호출을 부를 준비가 된 요청 한 건. 시크릿은 헤더에만 있다 (INV-CB3). */
export interface ChainRequest {
  url: string;
  headers: Record<string, string>;
}

/**
 * 수집 진입점의 경로 — **코드 상수다** (INV-CB1).
 *
 * 환경변수에서는 오리진만 가져오고 경로는 여기서 붙인다. 환경변수에 경로가 섞여 들어와도
 * 목적지가 달라지지 않는다.
 */
const INGEST_PATH = "/api/ingest";

/** 이어달리기 번호를 나르는 쿼리 이름. 남이 보낸 값이라 범위를 확인하고 쓴다. */
export const CHAIN_PARAM = "chain";

/**
 * 몇 번째 호출인지 읽는다 (INV-CB5).
 *
 * **읽을 수 없거나 범위 밖이면 첫 번째로 본다.** 두 방향 다 이유가 있다:
 *   - 멈추는 쪽으로 틀리면(큰 수를 그대로 믿으면) 남이 `chain=999` 하나로 그날 수집을
 *     끝내 버릴 수 있고, 증상은 "수집이 조용히 안 돈다"뿐이다.
 *   - 1 로 보는 쪽으로 틀려도 상한은 그대로 걸린다 — 한 체인이 최대 `MAX_CHAIN_LENGTH`
 *     번 이어질 뿐이다.
 */
export function parseChainIndex(raw: string | null | undefined): number {
  if (raw === null || raw === undefined) return 1;
  // 정수 꼴만 받는다. `Number()` 는 `"1e9"`·`" 3 "`·`"0x10"` 도 숫자로 읽는다.
  if (!/^\d+$/.test(raw.trim())) return 1;
  const n = Number(raw.trim());
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_CHAIN_LENGTH) return 1;
  return n;
}

/**
 * 다음 호출 요청을 만든다. 만들지 않는 경우는 null 이다 (INV-CB1·CB2·CB5).
 *
 * **바깥 값이 닿는 인자가 없다**는 것이 이 함수의 전부다. 목적지는 `baseUrl`(환경변수)의
 * 오리진뿐이고, 경로는 코드 상수, 실리는 값은 번호 하나다. 피드가 준 제목·주소는 여기까지
 * 오지 않는다 — 올 자리가 없다.
 */
export function buildChainRequest(input: {
  /** 환경변수에 적힌 우리 배포 주소. 없거나 주소가 아니면 이어달리지 않는다 (INV-CB2). */
  baseUrl: string | undefined;
  /** 들어가는 문이 확인하는 시크릿. 없으면 불러 봐야 401 이라 만들지 않는다. */
  secret: string | undefined;
  /** 지금이 몇 번째인가. 다음은 이 값 + 1 이다. */
  chainIndex: number;
}): ChainRequest | null {
  const { baseUrl, secret, chainIndex } = input;
  if (!baseUrl || baseUrl.trim() === "") return null;
  if (!secret || secret.trim() === "") return null;
  // 상한에 닿았으면 여기서 끝이다. 범위 밖의 값이 들어와도 같다.
  if (!Number.isSafeInteger(chainIndex) || chainIndex < 1) return null;
  if (chainIndex >= MAX_CHAIN_LENGTH) return null;

  let origin: string;
  try {
    const parsed = new URL(baseUrl.trim());
    // `file:`·`data:` 같은 것에 시크릿을 넘기지 않는다.
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    // 오리진만 쓴다 — 환경변수에 경로·쿼리가 섞여 들어와도 목적지가 안 달라진다.
    origin = parsed.origin;
  } catch {
    // 주소로 읽을 수 없으면 추측하지 않는다 (INV-CB2 와 같은 이유).
    return null;
  }

  const url = new URL(INGEST_PATH, origin);
  url.searchParams.set(CHAIN_PARAM, String(chainIndex + 1));

  return {
    url: url.toString(),
    // 시크릿은 여기에만 싣는다 (INV-CB3). 주소는 실행 로그에 그대로 남는다.
    headers: { authorization: `Bearer ${secret}` },
  };
}

/**
 * 다음 호출이 **요청을 받았다는 것까지만** 기다리는 시간.
 *
 * 왜 짧은가: 다음 호출의 응답은 그 호출이 한 바퀴(최대 250초)를 다 돌아야 온다. 끝까지
 * 기다리면 이 호출이 자기 상한(300초)에서 죽고, 체인이 길어질수록 **먼저 시작한 호출들이
 * 전부 살아서 대기한다.** 우리가 기다려서 얻을 것은 없다 — 다음 호출은 자기 리포트를
 * 자기가 저장한다.
 *
 * 0 으로 두고 아예 안 기다릴 수는 없다: 서버리스 함수는 응답을 돌려주면 그 자리에서
 * 멈춰서, 보내기 전에 끝내면 요청 자체가 안 나간다. 5초는 요청이 나갈 만큼이다.
 */
const CHAIN_DISPATCH_TIMEOUT_MS = 5_000;

/**
 * 다음 호출을 **한 번만** 보낸다 (INV-CB4).
 *
 * 보내고 나면 끊는다(위 `CHAIN_DISPATCH_TIMEOUT_MS`). 끊는 것은 우리 쪽 기다림이고,
 * 이미 도착한 요청은 저쪽에서 자기 시간을 새로 받아 돈다.
 *
 * **던지지 않는다.** 다음 호출이 실패해도 이 바퀴가 이미 한 일은 유효하다 — 던지면
 * 방금 끝낸 수집이 500 으로 보이고, 저장된 리포트와 응답이 어긋난다. 시간이 다 돼
 * 끊긴 것도 여기서는 실패가 아니다(그게 정상 경로다).
 */
export async function sendChainRequest(
  request: ChainRequest | null,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (request === null) return;
  try {
    await fetchImpl(request.url, {
      method: "GET",
      headers: request.headers,
      signal: AbortSignal.timeout(CHAIN_DISPATCH_TIMEOUT_MS),
    });
  } catch {
    // 조용히 넘어간다 — 위 이유. 이어달리기가 끊기면 다음 예약 실행이 이어받는다
    // (남은 일은 DB 에서 다시 찾는다 — INV-CB9).
  }
}

/**
 * 이어달리기 판정이 보는 칸들 — **"무엇이 안 끝났나"** 하나만 담는다.
 *
 * 단계가 통째로 안 돈 것과 중간에 멈춘 것을 **따로 둔다.** 한 칸에 섞으면 "예산이 아예
 * 없었다"와 "여든 건 중 스물넷에서 멈췄다"가 같은 모양이 되고, 그건 리포트가 이미
 * 따로 세고 있는 구별이다.
 */
export interface RemainingWork {
  /** 손도 못 댄 소스. */
  skippedSources: readonly string[];
  /** 주제 판정을 못 건 항목 수. */
  skippedTopicChecks: number;
  /** 본문을 못 긁은 건수. */
  skippedExtractions: number;
  /** 요약·번역을 못 한 건수. */
  skippedEnrichments: number;
  /** 키워드 단계를 통째로 안 돌렸나. */
  skippedKeywords: boolean;
  /** 키워드 단계 안에서 멈춘 건수. */
  skippedKeywordItems: number;
  /** 핫이슈 단계를 통째로 안 돌렸나. */
  skippedHotIssue: boolean;
  /** 핫이슈 단계 안에서 멈춘 건수. */
  skippedHotIssueItems: number;
  /** 후보를 받아 오는 자리에서 잘렸나 — 잘렸으면 못 본 것이 더 있다. */
  poolTruncated: boolean;
}

/**
 * 이 바퀴가 다음 호출을 만들어야 하나 (INV-CB10).
 *
 * 기준은 **할 일이 남았는가** 하나다. 「시간이 떨어졌는가」가 아니다.
 *
 * 그 둘을 같은 것으로 보면 2026-09-22 의 사고가 난다: 한 바퀴가 처리하는 건수에 상한이
 * 따로 있으면 **시간이 남아도 일은 남는다.** 그날 요약이 매 바퀴 정확히 10건에서 끝났는데
 * 이어달리기는 「남은 일이 없다」로 판정했고, 예약 실행이 하루 한 번이라 나머지는 조용히
 * 다음 날로 넘어갔다. 다음 날이면 그 글들은 순위에서 밀려 영영 처리되지 않는다.
 *
 * 요금 상한에 걸린 것은 여기서 안 본다: 상한에 걸려도 주제·핫이슈 판정은 계속 도는데
 * (INV-CB8) 그 일이 밀렸다면 다음 호출이 이어받아야 한다. 대신 체인은
 * `MAX_CHAIN_LENGTH` 에서 반드시 끝난다(INV-CB5).
 *
 * 단계를 통째로 안 돌린 경우도 참이다. 그 단계에 실제로 밀린 글이 없을 수도 있지만,
 * 그때는 **다음 바퀴가 조회만 하고 아무것도 안 남겨서 거기서 체인이 끝난다** — 한 바퀴를
 * 더 도는 대가로 「안 돌렸는데 남은 게 없었다」를 확인한다. 반대로 틀리면 그날 일이 빠진다.
 *
 * **음수는 안 센다.** 어딘가의 셈이 틀려 음수가 와도 체인이 헛돌면 안 된다 —
 * 헛도는 체인은 요금이 계속 나가고, 증상은 "수집이 오래 걸린다"뿐이다.
 */
export function shouldChain(report: { budget: RemainingWork }): boolean {
  const b = report.budget;
  if (b.poolTruncated) return true;
  if (b.skippedKeywords || b.skippedHotIssue) return true;
  if (b.skippedSources.length > 0) return true;
  const counts = [
    b.skippedTopicChecks,
    b.skippedExtractions,
    b.skippedEnrichments,
    b.skippedKeywordItems,
    b.skippedHotIssueItems,
  ];
  return counts.some((n) => Number.isFinite(n) && n > 0);
}
