import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chooseApprovalSigner } from "@/shared/api/approval-signer/signer";
import { readSupabaseConfig } from "@/shared/api/supabase/config";
import type { DeployEnv } from "@/shared/lib/env/is-production";
import { createDevKeyUnwrapper } from "@/shared/lib/envelope/dev-key-unwrapper";
import { readDecryptorSecrets } from "./decryptor-secrets";
import { printCreatorLabel, type CreatorLabelResult } from "./print-creator-label";
import { printReturnLabel, type ReturnLabelResult } from "./print-return-label";
import { printShareLabel } from "./print-share-label";

// 송장 출력 함수를 조립한다. 복호화 키·DB 자격·대표 ID 는 이 함수만 읽는 설정 파일에서 온다 —
// 앱 서버 설정에는 없다(scripts/dev-sealing-keys.mjs 가 만든다). 운영 환경이면 파일을 읽기 전에 실패한다(INV-P12).
// 클라우드 KMS·따로 배포하는 복호화 함수가 붙으면 이 조립이 그쪽으로 옮겨 가고, 앱 서버는 그 함수를 부르기만 한다.

/** 팬 선물 상자면 크리에이터 주소를, 역조공 상자면 팬 주소를 연다(address-protection INV-P4 · reverse-gift INV-R7). */
export type LabelPrintResult = Exclude<CreatorLabelResult, { kind: "not_gift" }>;
export type InvoiceDecryptor = (input: { qr: string; accessToken: string }) => Promise<LabelPrintResult>;

type DecryptorEnv = DeployEnv & Record<string, string | undefined>;

/** 이 함수 자신의 설정 파일 이름. Next 가 환경 변수로 읽는 이름(.env·.env.local·.env.development 등)이 아니다. */
const DECRYPT_FILE = [".env", "decrypt", "local"].join(".");

/** 이 함수 자신의 설정 파일을 읽는다. 앱 서버의 다른 코드는 이 파일을 읽지 않는다. */
export function readDecryptFile(): string {
  return readFileSync(join(process.cwd(), DECRYPT_FILE), "utf8");
}

/** 반송 송장 출력 함수 — 주문에 이어진 반송 대기 상자는 보낸 사람이 확인한 등록 주소(상자 복사본)를 연다(address-protection INV-P18).
 *  어느 주문에도 이어지지 않은 상자면 not_linked — 부르는 쪽이 봉투 번호 길로 간다(office-workflow INV-W15 S15f). */
export type ReturnLabelPrinter = (input: { qr: string; accessToken: string }) => Promise<ReturnLabelResult>;

/** 송장 출력과 같은 설정 파일·같은 복호화 역할로 반송 송장 출력 함수를 조립한다. 운영 환경이면 파일을 읽기 전에 실패한다(INV-P12). */
export function createReturnLabelPrinter(env: DecryptorEnv, readFile: () => string, newWaybill: () => string): ReturnLabelPrinter {
  const { signer: _signer, ...deps } = decryptorDeps(env, readFile, newWaybill);
  return (input) => printReturnLabel(deps, input);
}

function decryptorDeps(env: DecryptorEnv, readFile: () => string, newWaybill: () => string) {
  const secrets = readDecryptorSecrets(env, readFile);
  const unwrapper = createDevKeyUnwrapper({ privateKeyPem: secrets.privateKeyPem, env });
  const { url, anonKey } = readSupabaseConfig(env);
  const noSession = { persistSession: false, autoRefreshToken: false } as const;
  // DB 는 복호화 전용 역할 토큰으로 부른다. 게이트웨이가 받는 공개 키는 익명 키 그대로 두고, 역할은 토큰이 정한다.
  const db = createClient(url, anonKey, { auth: noSession, accessToken: async () => secrets.dbKey });
  const auth = createClient(url, anonKey, { auth: noSession });
  const signer = chooseApprovalSigner(env);

  return {
    db,
    verifyRequester: async (token: string) => {
      const { data, error } = await auth.auth.getUser(token);
      return error ? null : (data.user?.id ?? null);
    },
    ownerUserId: secrets.ownerUserId,
    unwrapper,
    signer,
    newWaybill,
  };
}

export function createInvoiceDecryptor(env: DecryptorEnv, readFile: () => string, newWaybill: () => string): InvoiceDecryptor {
  const deps = decryptorDeps(env, readFile, newWaybill);

  // 상자 종류는 각 출력 함수가 DB 판정 재료로 가린다 — 팬 선물 함수가 「팬 선물 상자가 아님」이라고 하면 역조공 함수로 간다.
  return async (input) => {
    const gift = await printCreatorLabel(deps, input);
    if (gift.kind !== "not_gift") return gift;
    const share = await printShareLabel(deps, input);
    // 두 함수가 서로 「내 상자가 아님」이라고 하면 판정 재료가 엇갈린 것이다 — 아무것도 열지 않고 실패로 끝낸다
    return share.kind === "not_share" ? { kind: "failed" } : share;
  };
}
