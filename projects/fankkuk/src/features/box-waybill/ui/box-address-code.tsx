"use client";

import { useId, useState } from "react";
import { CopyButton } from "@/shared/ui/copy-button";
import s from "./box-address-code.module.css";

// 팬 선물 상세의 상자별 팬꾹 주소 (inbound-address-code INV-C2·C3).
// 2026-11-17 모양을 「택배 접수 작성 예시」로 — 시안 docs/design/previews/shipping-label-20261114/kraft-shipping-guide.png
// (사용자: 크라프트 상자 느낌, 보내는 분 왼쪽 위 · 받는 분 오른쪽 아래, 받는 곳 상세주소 끝에 6자리를 적는 위치가 핵심).
// 시안의 주소·코드는 예시라 실제 값을 넣는다. 동작은 그대로다:
// - 6자리는 기본으로 가려 두고 「6자리 보기」를 눌러야 보인다(INV-C2 — 어깨 너머·화면 공유로 새지 않게).
// - 「전체 주소 복사」는 가려져 있어도 6자리를 포함한 전체 주소를 복사한다.
// - 부르는 쪽이 DB 가 준 6자리가 있을 때만 그린다(6자리 빠진 기본 사무실 주소는 그리지 않는다).
// 2026-11-17 크리에이터 쪽(보낸 역조공 팬별 칸 · 선물함 보내기)도 이 부품을 쓴다(사용자 「응」, 시안 mockups/creator-kraft-address-20261117). 옛 하늘 면 ReceivingAddress 는 지웠다.
// 보내는 분·받는 분은 이름 없는 일반 칸(div) — 상자가 여럿이면 이름 붙은 영역이 상자 이름 없이 겹친다(ui 리뷰 2026-11-17). 묶음 이름은 바깥 그룹 하나.

type Props = {
  /** 사무실 주소(6자리 앞부분) — 운영자가 정한 한 줄(admin-console INV-K19) */
  officeAddress: string;
  /** 이 상자의 6자리 */
  code: string;
  /** 화면 낭독기용 상자 이름(예: 상자 1) */
  boxName: string;
  /** 보내는 분 이름 예시에 넣을 내 닉네임 — 시안처럼 「별빛 (팬꾹 닉네임)」. 없으면 「팬꾹 닉네임」 */
  senderName?: string;
  /** 한 화면에 같은 칸이 여럿(보낸 역조공 팬별 칸)일 때 — 제목·부제·안내 두 줄은 묶음 안내에 한 번만 두고 여기서는 뺀다(제목은 낭독기용으로만 남김, ui 리뷰 2026-11-17) */
  compact?: boolean;
};

const MASK = "••••••";

/**
 * 6자리 글자 — 보일 때는 6자리 한 번만, 가렸을 때는 점 여섯 개에 낭독기 이름 「끝 6자리 가려짐」.
 * 2026-11-18 사용자: 6자리를 끌어 선택해 복사하면 「C9JDD4C9JDD4」로 두 번 붙었다 — 화면 글자와 낭독기용 숨은 글자(sr-only)가
 * 둘 다 있어서 선택 복사에 둘 다 들어갔다. 숨은 글자를 따로 두지 않고 글자 하나(가렸을 때는 role=img 이름)로 둔다.
 */
function CodeText({ shown, code }: { shown: boolean; code: string }) {
  if (shown) return <>{code}</>;
  return (
    <span role="img" aria-label="끝 6자리 가려짐">
      {MASK}
    </span>
  );
}

/** 받는 주소 전체 — 사무실 주소 상세 끝에 6자리 */
export function receivingAddressText(officeAddress: string, code: string): string {
  return `${officeAddress} ${code}`;
}

/**
 * 팬꾹 주소 한 줄을 택배 접수 화면의 「기본주소 · 상세주소」로 나눈다 — 첫 쉼표 앞이 도로명 주소, 뒤가 층·이름.
 * 쉼표가 없으면 전부 기본주소이고 상세주소에는 6자리만 들어간다. 복사하는 전체 주소는 나누기와 상관없이 같다.
 */
export function splitOfficeAddress(officeAddress: string): { base: string; detail: string } {
  const i = officeAddress.indexOf(",");
  if (i <= 0) return { base: officeAddress.trim(), detail: "" };
  return { base: officeAddress.slice(0, i).trim(), detail: officeAddress.slice(i + 1).trim() };
}

export function BoxAddressCode({ officeAddress, code, boxName, senderName, compact = false }: Props) {
  const id = useId();
  const [shown, setShown] = useState(false);
  // 복사 결과 문구는 주소 띠 아래에 띠 폭 전체로 — 버튼 묶음 안에 두면 묶음 폭을 넓혀 배치가 바뀌거나, 버튼 폭에 묶여 여러 줄로 접혔다(2026-11-18)
  const [copyMessage, setCopyMessage] = useState("");
  const full = receivingAddressText(officeAddress, code);
  const { base, detail } = splitOfficeAddress(officeAddress);
  const codeMark = (
    <span className={s.hl} data-code6="">
      <CodeText shown={shown} code={code} />
    </span>
  );
  return (
    <div className={compact ? `${s.kraft} ${s.compact}` : s.kraft} role="group" aria-labelledby={`${id}-t`} data-box-address="">
      <p className={compact ? "sr-only" : s.title} id={`${id}-t`}>
        택배를 보낼 때 이렇게 입력하세요<span className="sr-only"> · {boxName}</span>
      </p>
      {compact ? null : <p className={s.sub}>택배 접수 화면 예시</p>}
      <div className={s.paper}>
        <p className={s.paperHead}>택배 접수 · 작성 예시</p>
        <div className={s.grid}>
          <div className={s.from}>
            <p className={s.partH}>
              보내는 분 <span className={s.ex}>예시</span>
            </p>
            <dl className={s.rows}>
              <div>
                <dt>이름</dt>
                <dd>{senderName ? `${senderName} (팬꾹 닉네임)` : "팬꾹 닉네임"}</dd>
              </div>
              <div>
                <dt>주소</dt>
                <dd>보내는 분의 주소</dd>
              </div>
              <div>
                <dt>연락처</dt>
                <dd>보내는 분의 연락처</dd>
              </div>
            </dl>
          </div>
          <div className={s.to}>
            <p className={s.toHead}>
              받는 분
            </p>
            <dl className={s.rows}>
              <div>
                <dt>이름</dt>
                <dd>팬꾹</dd>
              </div>
              <div>
                <dt>기본주소</dt>
                <dd>{base}</dd>
              </div>
              <div className={s.key}>
                <dt>상세주소</dt>
                <dd>
                  <span className={s.detailBox}>
                    {detail ? `${detail} ` : null}
                    {codeMark}
                  </span>
                  <span className={s.callout}>
                    <span aria-hidden="true">↑ </span>상세주소 맨 끝에 6자리를 붙여 주세요
                  </span>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
      <div className={s.bar}>
        <p className={s.barText}>
          <span className={s.barLab}>받는 곳 상세주소</span> {detail ? `${detail} ` : null}
          <span className={s.barCode}>
            <CodeText shown={shown} code={code} />
          </span>
        </p>
        <div className={s.barActs}>
          <button type="button" className={s.ghost} aria-label={`${boxName} 팬꾹 주소 끝 6자리 ${shown ? "가리기" : "보기"}`} onClick={() => setShown((v) => !v)}>
            {shown ? "6자리 가리기" : "6자리 보기"}
          </button>
          <CopyButton
            className={s.copy}
            text={full}
            label="전체 주소 복사"
            ariaLabel={`${boxName} 전체 주소 복사`}
            copiedMessage="끝 6자리를 포함한 전체 주소가 복사되었습니다."
            failedMessage="주소를 복사하지 못했습니다. ‘6자리 보기’를 누르고 전체 주소를 직접 입력해 주세요."
            onMessage={setCopyMessage}
          />
        </div>
      </div>
      <p className={`hint ${s.copyMsg}`} role="status">
        {copyMessage}
      </p>
      {compact ? null : (
        <ul className={s.notes}>
          <li>보내는 분 이름에는 팬꾹 닉네임을 적어 주세요.</li>
          <li>6자리는 상자를 확인하는 데 필요합니다. 빠짐없이 입력하고 다른 사람에게 공유하지 마세요.</li>
        </ul>
      )}
    </div>
  );
}
