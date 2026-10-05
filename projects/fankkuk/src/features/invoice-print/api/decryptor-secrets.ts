import { isProduction, type DeployEnv } from "@/shared/lib/env/is-production";

// 송장 출력 함수(주소를 여는 유일한 서버 코드) 자신의 설정. 앱 서버 설정(.env.local)이 아니라 이 함수만 읽는 파일에 있다:
// - DEV_ADDRESS_PRIVATE_KEY: 개발용 주소 복호화 비밀키(INV-P12 — KMS 연결 전 임시)
// - DECRYPT_DB_KEY: 복호화 전용 역할(address_decryptor)의 DB 토큰 — 열람 기록을 쓰고 출력 함수를 부르는 자격(INV-P7)
// - DECRYPT_OWNER_USER_ID: 대표 계정 ID(INV-P8 — DB 의 역할 컬럼이나 대표 설정이 아니라 이 값으로 판단한다)
// 운영 환경에서는 파일을 읽기 전에 실패한다(INV-P12 S12b). 오류에는 이름만 넣고 값은 넣지 않는다.

export type DecryptorSecrets = { privateKeyPem: string; dbKey: string; ownerUserId: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function valuesOf(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (!m) continue;
    let value = m[2]!.trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    out.set(m[1]!, value.replaceAll("\\n", "\n"));
  }
  return out;
}

export function readDecryptorSecrets(env: DeployEnv, readFile: () => string): DecryptorSecrets {
  if (isProduction(env)) {
    throw new Error("임시 복호화는 운영 환경에서 쓸 수 없다 — KMS 를 연결해야 한다");
  }
  const values = valuesOf(readFile());
  const need = (name: string): string => {
    const v = values.get(name) ?? "";
    if (v === "") throw new Error(`송장 출력 함수 설정에 ${name} 이 없다`);
    return v;
  };
  const privateKeyPem = need("DEV_ADDRESS_PRIVATE_KEY");
  const dbKey = need("DECRYPT_DB_KEY");
  const ownerUserId = need("DECRYPT_OWNER_USER_ID");
  if (!UUID.test(ownerUserId)) throw new Error("송장 출력 함수 설정의 DECRYPT_OWNER_USER_ID 가 계정 ID 꼴이 아니다");
  return { privateKeyPem, dbKey, ownerUserId };
}
