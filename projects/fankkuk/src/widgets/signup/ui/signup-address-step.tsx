"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CREATOR_HOME } from "@/entities/session/model/home-path";
import { AddressChangeForm } from "@/features/creator-address/ui/address-change-form";
import { ADDRESS_KEY_MISSING_TEXT } from "@/features/creator-address/ui/address-copy";
import { CREATOR_CHANNEL_CREATE_PATH } from "@/shared/config/creator-paths";
import s from "./signup.module.css";

// 크리에이터 가입 4단계 — 배송지 등록(signup INV-U22 · UX 명세 signup.md 「2026-11-17 크리에이터 4단계 배송지 등록」).
// 입력 칸·봉인·저장은 승인 창·설정과 같은 주소 입력 부품이다 — 가입 화면이라고 다른 저장 길을 만들지 않는다(address-protection INV-P13).
// 건너뛰는 버튼(「다음」·「나중에 하기」·「취소」)이 없다. 저장이 끝나면 화면을 다시 읽어 라우트가 5단계(채널 만들기)를 고른다.
// 봉인 공개키가 없으면(설정 누락) 저장할 수 없으므로 안내와 「나중에 하기」만 둔다 — 막힌 화면에 갇히지 않게.

const STEP_PATH = CREATOR_CHANNEL_CREATE_PATH;

export function SignupAddressStep({ creatorId, sealingKeyPem }: { creatorId: string; sealingKeyPem: string | null }) {
  const router = useRouter();
  return (
    <div className={`card ${s.chan}`}>
      <div className={`${s.step} ${s["chan-form"]}`}>
        <h2 className="t-card">배송지 등록</h2>
        {sealingKeyPem ? (
          <>
            <p className="sub">선물을 받을 주소를 등록해 주세요. 승인한 선물은 이 주소로 배송됩니다.</p>
            <p className="t-meta">주소는 이 브라우저에서 암호화해 전송합니다.</p>
            <AddressChangeForm
              creatorId={creatorId}
              sealingKeyPem={sealingKeyPem}
              approvalHint={false}
              onSaved={() => router.refresh()}
              onLoginExpired={() => router.push(`/login?next=${encodeURIComponent(STEP_PATH)}`)}
            />
          </>
        ) : (
          <>
            <p className="err" role="status">
              {ADDRESS_KEY_MISSING_TEXT}
            </p>
            <div className={`${s["step-actions"]} ${s["no-prev"]}`}>
              <Link className="btn btn--line" href={CREATOR_HOME}>
                나중에 하기
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
