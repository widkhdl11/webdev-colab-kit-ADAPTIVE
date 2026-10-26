"use client";

import { useId, useState } from "react";
import { CopyButton } from "@/shared/ui/copy-button";
import { receivingAddressText } from "./receiving-address";
import s from "./box-waybill.module.css";

// 팬 선물 상세의 상자별 팬꾹 주소 (inbound-address-code INV-C2·C3) — 시안 v41-user-fixes/s/detail-after.html .addr3, design-rules 33절.
// 6자리를 「팬꾹 주소 6자리」 이름표 + 한 글자씩 흰 칸으로 따로 크게 보인다. 동작은 ReceivingAddress 와 같다:
// - 6자리는 기본으로 가려 두고 「6자리 보기」를 눌러야 보인다(INV-C2 — 어깨 너머·화면 공유로 새지 않게).
// - 「주소 한 번에 복사」는 가려져 있어도 6자리를 포함한 전체 주소를 복사한다.
// - 부르는 쪽이 DB 가 준 6자리가 있을 때만 그린다(6자리 빠진 기본 사무실 주소는 그리지 않는다).
// 받은 역조공 쪽(revgift-sent)은 이번 결정 밖이라 ReceivingAddress 를 그대로 쓴다.

type Props = {
  /** 사무실 주소(6자리 앞부분) */
  officeAddress: string;
  /** 이 상자의 6자리 */
  code: string;
  /** 화면 낭독기용 상자 이름(예: 상자 1) */
  boxName: string;
};

const MASK = "••••••";

export function BoxAddressCode({ officeAddress, code, boxName }: Props) {
  const id = useId();
  const [shown, setShown] = useState(false);
  const full = receivingAddressText(officeAddress, code);
  const cells = shown ? [...code] : [...MASK];
  return (
    <div className={s.addr3} role="group" aria-label={`${boxName} 팬꾹 주소`} data-box-address="">
      <div className={s.codebox}>
        <p className={s["code-lab"]} id={`${id}-lab`}>
          팬꾹 주소 6자리
        </p>
        <p className={shown ? s.code6 : `${s.code6} ${s.masked}`} data-code6="">
          {cells.map((c, i) => (
            <span key={i} aria-hidden="true">
              {c}
            </span>
          ))}
          <span className="sr-only">{shown ? code : "끝 6자리 가려짐"}</span>
        </p>
        <button type="button" className="btn btn--line btn--sm" aria-label={`${boxName} 팬꾹 주소 끝 6자리 ${shown ? "가리기" : "보기"}`} onClick={() => setShown((v) => !v)}>
          {shown ? "6자리 가리기" : "6자리 보기"}
        </button>
      </div>
      <dl className={s.addr3dl}>
        <div>
          <dt>받는 곳</dt>
          <dd>
            {officeAddress}{" "}
            {shown ? (
              <span className={s.tail}>{code}</span>
            ) : (
              <>
                <span className={s.tail} aria-hidden="true">
                  {MASK}
                </span>
                <span className="sr-only">끝 6자리 가려짐</span>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>받는 사람</dt>
          <dd>팬꾹</dd>
        </div>
      </dl>
      <div className={s.acts}>
        <CopyButton
          className="btn btn--sm"
          text={full}
          label="전체 주소 복사"
          ariaLabel={`${boxName} 전체 주소 복사`}
          copiedMessage="끝 6자리를 포함한 전체 주소가 복사되었습니다."
          failedMessage="주소를 복사하지 못했습니다. ‘6자리 보기’를 누르고 전체 주소를 직접 입력해 주세요."
        />
      </div>
      <ul className={s.pts}>
        <li>주소 끝 6자리는 상자를 확인하는 데 필요합니다. 빠짐없이 입력하고 다른 사람에게 공유하지 마세요.</li>
        <li>송장의 ‘보내는 분’에는 팬꾹 닉네임을 입력해 주세요.</li>
      </ul>
    </div>
  );
}
