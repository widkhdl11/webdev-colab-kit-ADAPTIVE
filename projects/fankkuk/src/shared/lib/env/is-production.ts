// 운영 환경 판정의 정본. Vercel 운영 배포 표시나 운영 빌드 표시 중 하나라도 있으면 운영이다.
export type DeployEnv = { NODE_ENV?: string; VERCEL_ENV?: string };

export function isProduction(env: DeployEnv): boolean {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}
