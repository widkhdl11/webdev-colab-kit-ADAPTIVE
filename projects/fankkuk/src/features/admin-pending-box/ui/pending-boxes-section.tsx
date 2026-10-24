"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { TIER_LABEL } from "@/entities/parcel/model/office-labels";
import type { PendingBox } from "@/entities/payment/model/pending-boxes";
import { formatStamp } from "@/shared/lib/format/datetime";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import a from "@/shared/ui/admin.module.css";
import { postClosePendingBox } from "../api/post-close-pending-box-client";

// 거절·반려·취소 때 아직 안 온 상자 (payment INV-M18). 결제 완료부터 720시간(2026-10-21) 안에 안 오면 자동 처리가 닫고, 그 전에 대표가 확인해 「도착하지 않음」으로 닫을 수도 있다.
// 닫으면 그 상자 금액 전액이 위 표의 환불 대기로 올라온다. 직원에게는 목록만 보이고 닫기 버튼은 대표에게만 그린다(최종 판정은 DB).
// 그 사이 상자가 도착하면 그 주문 상자로 입고돼 반송되고, 닫기는 거부된다.

const won = new Intl.NumberFormat("ko-KR");
const SECTION_ID = "pending-boxes";

type Props = { boxes: readonly PendingBox[]; access: "staff" | "owner" };

export function PendingBoxesSection({ boxes, access }: Props) {
  // 닫기가 거부되면(그 사이 상자가 도착함) 목록을 새로 읽을 때 그 줄과 확인 창이 함께 사라진다 — 안내는 줄 밖, 섹션 머리에 둔다
  const [failure, setFailure] = useState<string | null>(null);
  return (
    <section className={a.card} aria-labelledby={`${SECTION_ID}-title`}>
      <div className={a.sectionH}>
        <h2 id={`${SECTION_ID}-title`} tabIndex={-1}>
          끝난 선물의 아직 안 온 상자
        </h2>
      </div>
      <p className={a.hint} style={{ margin: "0 0 12px" }}>
        거절·자동 반려·취소 때 아직 도착하지 않은 상자예요. 택배비를 뺀 금액은 이미 환불 대기로 올라갔어요. 늦게 도착하면 그 선물의 상자로 입고해
        돌려보내요. 결제하고 30일 안에 오지 않으면 자동으로 닫히고 남겨 둔 택배비가 환불 대기로 올라와요. 그 전에 팬이 보내지 않았다고 알려 오면 「도착하지 않음 처리」를 눌러 주세요.
      </p>
      <div role="status">
        {failure && (
          <p className={a.errorLine}>
            <span className={a.errorMark} aria-hidden="true">
              !
            </span>
            {failure}
          </p>
        )}
      </div>
      <div className={a.tblWrap}>
        <table className={a.tbl}>
          <caption className="sr-only">끝난 선물의 아직 안 온 상자</caption>
          <thead>
            <tr>
              <th scope="col">상자</th>
              <th scope="col">보낸 팬</th>
              <th scope="col">구간</th>
              <th scope="col" className={a.num}>
                상자 금액
              </th>
              <th scope="col">거절·반려 시각</th>
              <th scope="col">팬이 넣은 송장번호</th>
              <th scope="col" className={a.stickyEnd}>
                <span className="sr-only">도착하지 않음 처리</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {boxes.length === 0 ? (
              <tr>
                <td colSpan={7} className={a.empty}>
                  기다리는 상자가 없어요.
                </td>
              </tr>
            ) : (
              boxes.map((b) => (
                <tr key={b.boxId}>
                  <td className={`${a.mono} ${a.nowrap}`}>
                    <strong>{b.label}</strong>
                  </td>
                  <td>{b.fanNickname}</td>
                  <td>{TIER_LABEL[b.tier]}</td>
                  <td className={`${a.num} ${a.mono}`}>{won.format(b.amountKrw)}원</td>
                  <td className={`${a.mono} ${a.nowrap}`}>{formatStamp(b.endedAt)}</td>
                  <td className={a.mono}>{b.trackingNo ?? <span className={a.faint}>—</span>}</td>
                  <td className={`${a.act} ${a.stickyEnd}`}>{access === "owner" && <CloseButton box={b} onDone={setFailure} />}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CloseButton({ box, onDone }: { box: PendingBox; onDone: (failure: string | null) => void }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = `close-box-title-${box.boxId}`;

  function open() {
    setError(null);
    dialog.current?.showModal();
  }

  function close() {
    if (busy) return;
    dialog.current?.close();
  }

  async function confirm() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const outcome = await postClosePendingBox({ boxId: box.boxId });
    setBusy(false);
    if (outcome.kind !== "ok" && !isStaleFailure(outcome)) {
      setError(outcome.message); // 일시적인 실패는 창 안에 — 다시 누를 수 있다
      return;
    }
    // 닫혔거나(성공) 닫을 수 없게 됐으면(409·404 — 그 사이 도착·이미 닫힘) 이 줄은 목록에서 사라진다.
    // 창을 닫고 결과는 섹션 머리에 알리고, 포커스는 남아 있는 섹션 제목으로 보낸다
    dialog.current?.close();
    onDone(outcome.kind === "ok" ? null : outcome.message);
    document.getElementById(`${SECTION_ID}-title`)?.focus();
    router.refresh();
  }

  return (
    <>
      <button type="button" className={`${a.btn} ${a.btnSm} ${a.btnLine}`} onClick={open} aria-label={`${box.label} 도착하지 않음 처리`}>
        도착하지 않음 처리
      </button>
      <dialog
        ref={dialog}
        className={a.dialog}
        aria-labelledby={titleId}
        onCancel={(e) => {
          if (busy) e.preventDefault(); // 처리 중에는 Esc 로도 닫히지 않는다
        }}
      >
        <div className={a.dlgBody}>
          <h2 id={titleId}>이 상자를 「도착하지 않음」으로 처리할까요?</h2>
          <dl className={a.kv}>
            <dt>상자</dt>
            <dd className={a.mono}>{box.label}</dd>
            <dt>보낸 팬</dt>
            <dd>{box.fanNickname}</dd>
          </dl>
          <div className={a.amount}>
            <span className={a.amountLabel}>환불 대기로 올라갈 금액 (그 상자 금액 전액)</span>
            <b className={a.mono}>{won.format(box.amountKrw)}원</b>
          </div>
          <p className={a.hint}>
            팬이 상자를 보내지 않았는지 확인한 뒤에 눌러 주세요. 처리하면 이 상자의 팬꾹 주소 6자리가 무효가 되고, 그 뒤에 상자가 오면 보류 상자로 운영자 확인 목록에
            올라가 원래 송장 주소로 착불 반송돼요. 되돌릴 수 없어요.
          </p>
          <div role="status">
            {error && (
              <p className={a.errorLine}>
                <span className={a.errorMark} aria-hidden="true">
                  !
                </span>
                {error}
              </p>
            )}
          </div>
        </div>
        <div className={a.dlgFoot}>
          <button type="button" className={`${a.btn} ${a.btnLine}`} onClick={close} aria-disabled={busy}>
            닫기
          </button>
          <button type="button" className={a.btn} onClick={confirm} aria-disabled={busy}>
            {busy ? "처리하는 중…" : "도착하지 않음 처리"}
          </button>
        </div>
      </dialog>
    </>
  );
}
