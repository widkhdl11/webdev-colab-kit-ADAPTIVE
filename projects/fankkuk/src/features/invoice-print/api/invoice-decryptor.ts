import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chooseApprovalSigner } from "@/shared/api/approval-signer/signer";
import { readSupabaseConfig } from "@/shared/api/supabase/config";
import type { DeployEnv } from "@/shared/lib/env/is-production";
import { createDevKeyUnwrapper, type KeyUnwrapper } from "@/shared/lib/envelope/dev-key-unwrapper";
import { readDecryptorSecrets } from "./decryptor-secrets";
import { printCreatorLabel, type CreatorLabelResult } from "./print-creator-label";
import { printReturnLabel, type ReturnLabelResult } from "./print-return-label";
import { printShareLabel } from "./print-share-label";

// 송장 출력 함수를 조립한다. 조립은 두 곳에서 한다:
// - 로컬: 복호화 키·DB 자격·대표 ID 를 이 함수만 읽는 설정 파일에서 읽고 개발용 키로 푼다(scripts/dev-sealing-keys.mjs 가 만든다).
//   운영 환경이면 파일을 읽기 전에 실패한다(INV-P12).
// - 서명 게이트웨이(sign.fankkuk.com): 같은 판정 코드를 게이트웨이가 돌리고 키 풀기는 KMS 가 한다(address-protection 「복호화 함수」).
//   앱 서버는 로그인 토큰과 QR 만 보내고 라벨 칸을 돌려받는다(gateway-client.ts).

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

/** 송장 출력 함수의 재료. 설정을 어디서 읽고 키를 무엇으로 푸는지는 부르는 쪽(로컬·게이트웨이)이 정한다. */
export type DecryptorWiring = {
  env: DecryptorEnv;
  /** 복호화 전용 역할(address_decryptor)의 DB 토큰 */
  dbKey: string;
  /** 대표 계정 ID(INV-P8) */
  ownerUserId: string;
  unwrapper: KeyUnwrapper;
  newWaybill: () => string;
  /** DB·로그인 확인 요청을 보낼 통로. 게이트웨이는 허용 목록을 거치는 통로를 넣는다 — 없으면 기본 fetch */
  fetch?: typeof fetch;
};

export function wireDecryptorDeps(w: DecryptorWiring) {
  const { url, anonKey } = readSupabaseConfig(w.env);
  const noSession = { persistSession: false, autoRefreshToken: false } as const;
  const global = w.fetch ? { fetch: w.fetch } : undefined;
  // DB 는 복호화 전용 역할 토큰으로 부른다. 게이트웨이가 받는 공개 키는 익명 키 그대로 두고, 역할은 토큰이 정한다.
  const db = createClient(url, anonKey, { auth: noSession, global, accessToken: async () => w.dbKey });
  const auth = createClient(url, anonKey, { auth: noSession, global });
  const signer = chooseApprovalSigner(w.env);

  return {
    db,
    verifyRequester: async (token: string) => {
      const { data, error } = await auth.auth.getUser(token);
      return error ? null : (data.user?.id ?? null);
    },
    ownerUserId: w.ownerUserId,
    unwrapper: w.unwrapper,
    signer,
    newWaybill: w.newWaybill,
  };
}

export type DecryptorDeps = ReturnType<typeof wireDecryptorDeps>;

function decryptorDeps(env: DecryptorEnv, readFile: () => string, newWaybill: () => string): DecryptorDeps {
  const secrets = readDecryptorSecrets(env, readFile);
  const unwrapper = createDevKeyUnwrapper({ privateKeyPem: secrets.privateKeyPem, env });
  return wireDecryptorDeps({ env, dbKey: secrets.dbKey, ownerUserId: secrets.ownerUserId, unwrapper, newWaybill });
}

/** 송장 출력과 같은 설정 파일·같은 복호화 역할로 반송 송장 출력 함수를 조립한다. 운영 환경이면 파일을 읽기 전에 실패한다(INV-P12). */
export function createReturnLabelPrinter(env: DecryptorEnv, readFile: () => string, newWaybill: () => string): ReturnLabelPrinter {
  return returnLabelPrinterFrom(decryptorDeps(env, readFile, newWaybill));
}

export function createInvoiceDecryptor(env: DecryptorEnv, readFile: () => string, newWaybill: () => string): InvoiceDecryptor {
  return invoiceDecryptorFrom(decryptorDeps(env, readFile, newWaybill));
}

/** 반송 송장 출력 함수를 재료로 만든다. */
export function returnLabelPrinterFrom(deps: DecryptorDeps): ReturnLabelPrinter {
  const { signer: _signer, ...rest } = deps;
  return (input) => printReturnLabel(rest, input);
}

/** 송장 출력 함수를 재료로 만든다. */
export function invoiceDecryptorFrom(deps: DecryptorDeps): InvoiceDecryptor {
  // 상자 종류는 각 출력 함수가 DB 판정 재료로 가린다 — 팬 선물 함수가 「팬 선물 상자가 아님」이라고 하면 역조공 함수로 간다.
  return async (input) => {
    const gift = await printCreatorLabel(deps, input);
    if (gift.kind !== "not_gift") return gift;
    const share = await printShareLabel(deps, input);
    // 두 함수가 서로 「내 상자가 아님」이라고 하면 판정 재료가 엇갈린 것이다 — 아무것도 열지 않고 실패로 끝낸다
    return share.kind === "not_share" ? { kind: "failed" } : share;
  };
}
