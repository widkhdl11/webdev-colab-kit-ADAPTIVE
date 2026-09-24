import { NextResponse, after } from "next/server";
import { SOURCES } from "@/entities/source";
import { selfBaseUrl } from "@/shared/api/server-env";
import {
  CHAIN_PARAM,
  buildChainRequest,
  createIngestPorts,
  parseChainIndex,
  runIngest,
  saveIngestRunReport,
  sendChainRequest,
  shouldChain,
} from "@/features/ingestion";
import { runWeeklyReview } from "@/features/verdict-review";
import { createReviewStore } from "@/features/verdict-review/api/supabase-store";

/** 판정 검토 주간 실행의 상한. 평소 몇 초다 — 넘으면 기다리지 않고 수집으로 간다(실행은 after 로 끝까지 돈다). */
const WEEKLY_REVIEW_TIMEOUT_MS = 15_000;

/**
 * 수집 진입점 (Cron).
 *
 * 이 라우트는 **아무 판단도 하지 않는다** — 포트를 만들고 파이프라인을 부를 뿐이다.
 * 격리·재시도 규칙(INV-C4·S2·S3)은 전부 runIngest 안에 있고 오프라인 테스트가 잡는다.
 *
 * **GET 인 이유**: Vercel Cron 은 GET 으로만 부른다. POST 로 두면 Cron 이 405 를 받고,
 * Vercel 은 실패한 Cron 을 재시도하지 않으므로 증상이 "수집이 조용히 0" 으로만 나타난다.
 * 진입점을 하나로 두는 것도 같은 이유다 — 로컬(`npm run ingest`)이 도는 길과 Cron 이 도는
 * 길이 갈리면 로컬 성공이 배포 성공을 뜻하지 않게 된다. tests/ingest-route.test.ts 가 붙든다.
 *
 * GET 이지만 캐시되지 않는다(`force-dynamic`). 캐시된 응답은 Cron 로그에도 안 남는다.
 */

export const dynamic = "force-dynamic";
// 소스가 늘면 오래 걸린다. 기본(10초)으로는 중간에 끊긴다.
// Hobby 플랜의 상한도 300초라 이 값이 최대치다.
export const maxDuration = 300;

export async function GET(request: Request) {
  // 아무나 부를 수 있으면 남이 우리 Claude 비용을 태울 수 있다.
  // CRON_SECRET 이 없으면 **열어 두지 않고 막는다** — 설정을 빼먹은 것이 곧 공개가 되면 안 된다.
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET 이 설정되지 않았다" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // 몇 번째 이어달리기인가 (INV-CB5). 쿼리 문자열은 남이 보낸 값이라 범위를 확인하고 쓴다 —
  // 읽을 수 없거나 범위 밖이면 첫 번째로 본다.
  const chainIndex = parseChainIndex(new URL(request.url).searchParams.get(CHAIN_PARAM));

  // 판정 검토 주간 실행 — 이어달리기의 **첫 바퀴에서만**, 수집보다 먼저(verdict-review INV-VR2·VR8).
  // 할 일 없는 날은 조회 한 번이다. 실패해도 던지지 않고 자기 기록에 남긴다 — 수집이 실패로 보이면 안 된다.
  // 시간 상한을 따로 둔다: 수집 예산(240초) 밖의 여유 60초를 이것이 다 먹으면 안 된다.
  if (chainIndex === 1) {
    // 저장소 만들기(키 읽기)도 던질 수 있어서 통째로 감싼다 — 인자를 만드는 중에 던지면 .catch 가 못 잡는다.
    const weekly = (async () => {
      try {
        await runWeeklyReview({ store: createReviewStore(), now: new Date() });
      } catch {
        // runWeeklyReview 는 던지지 않는다. 여기 오는 것은 저장소를 못 만든 경우뿐이고, 수집은 그대로 간다.
      }
    })();
    // 상한을 넘기면 수집으로 넘어가되, 남은 주간 실행은 응답 뒤에도 끝까지 돌게 등록한다(after) —
    // 등록하지 않으면 서버리스 함수가 끝날 때 주 만들기 도중에 끊길 수 있다.
    after(() => weekly);
    await Promise.race([weekly, new Promise((resolve) => setTimeout(resolve, WEEKLY_REVIEW_TIMEOUT_MS))]);
  }

  const runId = crypto.randomUUID();
  const startedAt = new Date();
  const report = await runIngest({
    sources: SOURCES,
    ports: createIngestPorts(),
    now: startedAt,
    runId,
  });
  const elapsedMs = Date.now() - startedAt.getTime();

  // 개발자용 대시보드 기록. 실패해도 삼킨다 — 수집 자체는 이미 끝났으니 관측이 죽었다고
  // Cron 까지 실패로 보이면 안 된다(saveIngestRunReport 의 문서 참고).
  try {
    await saveIngestRunReport({ runId, startedAt, elapsedMs, report });
  } catch {
    // 조용히 넘어간다 — 위 이유.
  }

  // 시간이 떨어져 남은 일이 있으면 **다음 호출 하나**를 부른다 (INV-CB1~CB5).
  //
  // 목적지는 설정에 적힌 주소뿐이고 경로는 코드 상수다 — 수집이 읽은 어떤 값(피드 제목·
  // 원문 주소)도 목적지에 닿지 않는다. 그 설정이 없으면 **아무 데도 안 부른다**:
  // 요청 헤더의 호스트로 대신 부르면 그건 남이 보낸 값이라 목적지를 남이 고르는 것이 된다.
  //
  // 저장(saveIngestRunReport) **뒤에** 부르는 것이 중요하다 — 다음 호출이 오늘 쓴 돈을
  // 저장된 기록에서 읽기 때문이다(INV-CB6). 먼저 부르면 이 바퀴 지출이 안 보인 채로
  // 다음 바퀴가 상한을 잰다.
  const baseUrl = selfBaseUrl();
  // http 주소는 로컬 개발 서버에서만 받는다 — 배포 환경에서는 시크릿이 평문으로 나간다.
  const allowHttp = process.env.NODE_ENV !== "production";
  const willChain = shouldChain(report);
  const chainRequest = willChain
    ? buildChainRequest({ baseUrl, secret: expected, chainIndex, allowHttp })
    : null;
  await sendChainRequest(chainRequest);

  // 목적지를 **알고 있기는 한가** — 이어달릴 이유가 있었는지와 따로 본다.
  // 판정을 여기서 다시 쓰지 않고 같은 함수에 1번째를 물어본다: 규칙이 둘로 갈리면
  // 진단 칸이 "부를 수 있다"고 말하는데 실제로는 못 부르는 날이 온다.
  const hasTarget =
    buildChainRequest({ baseUrl, secret: expected, chainIndex: 1, allowHttp }) !== null;

  // 실패가 있어도 200 이다 — 일부 소스가 죽는 건 정상 경로다(INV-C4).
  // 무엇이 실패했는지는 본문에 담아 Cron 로그에서 보이게 한다.
  //
  // `chain` 을 같이 싣는 이유는 요금 상한을 리포트에 남기는 이유와 같다 (INV-CB8 의 취지):
  // 안 남기면 **"부를 데가 없어 안 했다"와 "불렀는데 안 닿았다"가 같은 모양이 된다.**
  // 둘 다 "다음 바퀴가 안 돌았다"로만 보이는데, 고칠 자리는 설정과 네트워크로 전혀 다르다.
  // 2026-09-22 에 실제로 그 구별이 안 돼서 원인을 좁히지 못했다.
  return NextResponse.json({
    ...report,
    chain: {
      /** 이번이 몇 번째 호출인가 (1 = 예약 실행이 시작한 첫 바퀴). */
      index: chainIndex,
      /** 시간이 떨어져 남은 일이 있었나 — 이어달릴 이유가 있었나. */
      needed: willChain,
      /**
       * 실제로 요청을 만들어 보냈나. `needed` 가 참인데 이것이 거짓이면 이유는 둘뿐이다 —
       * 목적지 설정이 없거나(INV-CB2), 길이 상한에 닿았거나(INV-CB5).
       */
      dispatched: chainRequest !== null,
      /**
       * 부를 데를 알고 있나. **`needed` 와 무관하게 채운다** — 상한에 안 걸린 날에는
       * `dispatched` 가 항상 거짓이라, 이 칸이 없으면 설정이 빠진 것을 사고가 나는
       * 날까지 모른다. 2026-09-22 배포 확인이 정확히 여기서 멈췄다.
       */
      hasTarget,
    },
  });
}
