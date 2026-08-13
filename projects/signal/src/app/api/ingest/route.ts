import { NextResponse } from "next/server";
import { SOURCES } from "@/entities/source";
import { createIngestPorts, runIngest } from "@/features/ingestion";

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

  const report = await runIngest({
    sources: SOURCES,
    ports: createIngestPorts(),
    now: new Date(),
  });

  // 실패가 있어도 200 이다 — 일부 소스가 죽는 건 정상 경로다(INV-C4).
  // 무엇이 실패했는지는 본문에 담아 Cron 로그에서 보이게 한다.
  return NextResponse.json(report);
}
