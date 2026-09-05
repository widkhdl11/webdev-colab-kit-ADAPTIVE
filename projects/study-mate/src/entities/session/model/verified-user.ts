// 세션 판정은 검증된 클레임으로만 한다.
// 근거: docs/specs/auth-session.md — INV-A3

export type VerifiedUser = { readonly id: string };

/**
 * 세션을 읽는 두 경로를 **둘 다** 드러내는 포트.
 *
 * 한쪽만 노출하면 INV-A3 이 타입으로 자명해져서, 우리가 어느 쪽을 골랐는지를
 * 테스트가 더는 붙들지 못한다. 원본 프로젝트에서 주석과 실제 호출이 어긋나 있던
 * 자리라서, 고른 쪽이 검증한다는 사실을 테스트가 붙들게 둔다.
 *
 * - getClaims: 토큰을 검증한 뒤 클레임을 준다. 이쪽만 쓴다. 검증 방식은 프로젝트의
 *   서명키에 따라 갈린다 — 비대칭 키면 대개 네트워크 없이 로컬에서, 대칭 시크릿이면
 *   매 요청 Auth 서버에 물어서. 후자면 일시적 네트워크 장애가 아래 catch 를 타고
 *   "비로그인"이 되어 로그인한 사용자가 로그인 페이지로 튕긴다(안전한 방향이지만
 *   증상이 헷갈린다). 이 프로젝트가 어느 쪽인지는 아직 확인되지 않았다.
 * - getSession: 저장매체(쿠키)에 있는 값을 그대로 돌려준다. 서버에서 믿지 않는다.
 */
export type SessionSource = {
  readonly getClaims: () => Promise<{
    readonly data: { readonly claims: { readonly sub?: unknown } } | null;
    readonly error: unknown;
  }>;
  readonly getSession: () => Promise<unknown>;
};

export async function readVerifiedUser(
  source: SessionSource,
): Promise<VerifiedUser | null> {
  let result: Awaited<ReturnType<SessionSource["getClaims"]>>;
  try {
    result = await source.getClaims();
  } catch (cause) {
    // 검증을 못 한 것과 검증에 성공한 것은 다르다. 못 했으면 비로그인이다.
    // 흔적을 남기는 이유: 이 경로를 타면 로그인한 사용자도 로그인 페이지로 튕기는데,
    // 로그가 없으면 "인증이 고장났다"와 "아무도 로그인 안 했다"가 겉이 같다.
    console.warn("[session] 토큰 검증에 실패해 비로그인으로 처리한다", cause);
    return null;
  }

  // getClaims 는 검증에 실패하면 반드시 data: null 을 함께 돌려준다(반환 타입이 그렇게 갈라져 있다).
  // 그래서 error 를 따로 보지 않는다 — 어떤 테스트도 붙들지 못하는 겹친 검사였다.
  if (result.data === null) return null;

  const sub = result.data.claims.sub;
  if (typeof sub !== "string" || sub.length === 0) return null;

  return { id: sub };
}
