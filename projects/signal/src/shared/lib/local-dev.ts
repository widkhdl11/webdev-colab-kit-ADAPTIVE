/**
 * 개발자 화면(/dev/*)을 열어도 되는 요청인가 — **이 PC 의 개발 서버에서, 이 PC 의 주소로 온 것만.**
 *
 * 막는 것 셋 (verdict-review INV-VR9, 2026-09-24 보안 리뷰):
 *  - 배포본: `NODE_ENV=production` 이거나 Vercel 위에서 돌면 거부한다. NODE_ENV 한 값에만 기대지 않는다.
 *  - 같은 와이파이의 다른 기기: `next dev` 는 모든 네트워크에 열린다. 그 기기는 `Host: 192.168.x.x:3000` 으로 온다.
 *  - DNS 재바인딩: 외부 도메인이 127.0.0.1 로 풀리게 하면 `Host: evil.example:3000` 으로 온다. Next 의 서버 액션
 *    검사는 Origin 과 Host 가 **서로 같은지**만 보므로 이것을 못 막는다.
 * 그래서 `Host` 가 localhost·127.0.0.1·[::1] 중 하나(포트는 무엇이든)여야 한다.
 */
export function isLocalDevRequest(host: string | null, env: { nodeEnv: string | undefined; vercel: string | undefined }): boolean {
  if (env.nodeEnv === "production" || env.vercel !== undefined) return false;
  if (host === null) return false;
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d{1,5})?$/i.test(host.trim());
}
