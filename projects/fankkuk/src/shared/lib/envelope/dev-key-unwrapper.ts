// 감싼 데이터 키를 푸는 쪽의 경계. 운영에서는 KMS 가 이 일을 하고 비밀키는 KMS 밖으로 나오지 않는다.
export interface KeyUnwrapper {
  unwrap(wrappedKeyBase64: string): Promise<Uint8Array>;
}

type EnvLike = { NODE_ENV?: string; VERCEL_ENV?: string };

function isProduction(env: EnvLike): boolean {
  return env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
}

/**
 * KMS 연결 전 개발용 임시 복호화. 비밀키를 앱 프로세스가 직접 들고 있으므로
 * 운영 환경에서는 만드는 순간 실패한다 (INV-P12 — 그렇지 않으면 INV-P2·P3 가 무너진다).
 */
export function createDevKeyUnwrapper(opts: { privateKeyPem: string; env: EnvLike }): KeyUnwrapper {
  if (isProduction(opts.env)) {
    throw new Error("임시 복호화는 운영 환경에서 쓸 수 없다 — KMS 를 연결해야 한다");
  }
  const body = opts.privateKeyPem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  if (body === "") throw new Error("개발용 비밀키가 비어 있다");

  const keyPromise = crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(body), (c) => c.charCodeAt(0)),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["decrypt"],
  );

  return {
    async unwrap(wrappedKeyBase64) {
      const wrapped = Uint8Array.from(atob(wrappedKeyBase64), (c) => c.charCodeAt(0));
      return new Uint8Array(await crypto.subtle.decrypt({ name: "RSA-OAEP" }, await keyPromise, wrapped));
    },
  };
}
