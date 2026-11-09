// 배송 조회 서비스(택배API, deliveryapi.co.kr) 서버 설정 읽기 — 서버 전용.
// 값이 없으면 null 로 돌려줄 뿐 던지지 않는다 — 설정 없이 띄운 서버도 시작한다(delivery-status INV-DS12).
// 근거: https://www.deliveryapi.co.kr/docs (2026-11-09 읽음) — 인증 머리 `Authorization: Bearer {키}:{시크릿}`.

type EnvLike = Record<string, string | undefined>;

/** 구독·조회에 쓰는 키 둘. 둘 다 있어야 설정된 것으로 본다 */
export type DeliveryApiCredentials = { apiKey: string; apiSecret: string };

export function readDeliveryApiCredentials(env: EnvLike): DeliveryApiCredentials | null {
  const apiKey = env.DELIVERY_API_KEY?.trim();
  const apiSecret = env.DELIVERY_API_SECRET?.trim();
  if (!apiKey || !apiSecret) return null;
  return { apiKey, apiSecret };
}

/** 웹훅 주소 등록 때 받은 주소 번호 — 시크릿이 아니다. 없으면 구독해도 웹훅이 오지 않으므로 구독하지 않는다 */
export function readDeliveryApiEndpointId(env: EnvLike): string | null {
  const v = env.DELIVERY_API_ENDPOINT_ID?.trim();
  return v ? v : null;
}

/** 웹훅 서명 키(등록 때 한 번만 평문으로 받는 값). 없으면 웹훅을 모두 거부한다 */
export function readDeliveryApiWebhookSecret(env: EnvLike): string | null {
  const v = env.DELIVERY_API_WEBHOOK_SECRET?.trim();
  return v ? v : null;
}
