import { isProduction, type DeployEnv } from "./is-production";

// 시험 사이트 판정의 정본(test-site INV-TS1). 배포한 시험용 사이트에서만 가짜 확인 창구를 연다(INV-TS2).
// 두 조건을 모두 만족해야 한다 — 설정 하나가 실제 운영에 잘못 남아도 주소가 달라 열리지 않게.
// 요청 헤더(Host 등)는 보지 않는다. 요청 보내는 사람이 바꿀 수 있는 값이다.

/** 시험 사이트 주소. 실제 운영 주소는 여기 넣지 않는다. */
export const TEST_SITE_ORIGINS: readonly string[] = ["https://webdev-colab-kit-adaptive-xqne.vercel.app"];

export type TestSiteEnv = DeployEnv & { FANKKUK_TEST_SITE?: string; APP_ORIGIN?: string };

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

export function isTestSite(env: TestSiteEnv): boolean {
  if (env.FANKKUK_TEST_SITE !== "1") return false;
  const origin = originOf(env.APP_ORIGIN);
  return origin !== null && TEST_SITE_ORIGINS.includes(origin);
}

/** 가짜 확인 창구(본인 확인·승인 서명·채널 확인)를 열어도 되는가 — 로컬이거나 시험 사이트일 때만(INV-TS2). */
export function allowsFakeChannels(env: TestSiteEnv): boolean {
  return !isProduction(env) || isTestSite(env);
}
