// 주소 봉인용 공개키(PEM, SPKI) 설정 읽기. 공개키라 브라우저에 내려가도 된다 — 푸는 비밀키는 KMS(지금은 개발용 키 쌍)에만 있다.
// 이름에 공개 접두어(NEXT_PUBLIC_)를 쓰지 않는다: 서버 화면이 읽어 필요한 화면에만 넘긴다.
// 설정이 없거나 PEM 꼴이 아니면 null — 주소 입력 화면은 받기를 막고 안내만 보여 준다.

const PEM = /^-----BEGIN PUBLIC KEY-----[A-Za-z0-9+/=\s]+-----END PUBLIC KEY-----\s*$/;

export function readSealingPublicKeyPem(env: Record<string, string | undefined>): string | null {
  const raw = env.ADDRESS_SEALING_PUBLIC_KEY?.replaceAll("\\n", "\n").trim();
  return raw && PEM.test(raw) ? raw : null;
}
