"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { canCancelReview, type ReviewCancelStatus, type ReviewPayment, type ReviewSource } from "@/entities/payment/model/review-payments";
import { formatStamp } from "@/shared/lib/format/datetime";
import { splitPgError } from "@/shared/lib/format/pg-error-text";
import a from "@/shared/ui/admin.module.css";
import { postReviewCancel } from "../api/post-review-cancel-client";

// 「확인 필요」 결제 (payment INV-M19·M20). 결제사는 승인됐다는데 금액이 기록과 다르거나 부분 취소된 결제다.
// 업계 표준대로 전액 취소하고 결제는 실패로 닫는다 — 팬에게 다시 결제하라는 알림이 간다(역조공은 알림 없음).
// 직원에게는 목록만 보이고 「전액 취소」는 대표에게만 그린다(최종 판정은 DB). 금액은 결제사 조회가 알려 준 취소 가능 금액이고 바꿀 수 없다.

const won = new Intl.NumberFormat("ko-KR");
const SECTION_ID = "review-payments";

const SOURCE_LABEL: Record<ReviewSource, string> = { initial: "선물 결제", difference: "차액", revgift: "역조공" };
const CANCEL_TAG: Record<ReviewCancelStatus, { text: string; className: string } | null> = {
  none: null,
  requesting: { text: "취소 처리 중", className: a.tagWarn },
  failed: { text: "취소 실패", className: a.tagInk },
  done: { text: "취소 완료", className: a.tagBrand },
};

type Props = { rows: readonly ReviewPayment[]; access: "staff" | "owner" };

export function ReviewPaymentsSection({ rows, access }: Props) {
  // 취소가 끝나면 그 줄은 목록에서 사라지고(결제가 실패로 닫힘), 실패해도 다시 읽은 줄의 버튼이 사라질 수 있다(처리 중) —
  // 결과는 줄 밖, 섹션 머리에 둔다
  const [notice, setNotice] = useState<string | null>(null);
  const now = new Date();
  return (
    <section className={a.card} aria-labelledby={`${SECTION_ID}-title`}>
      <div className={a.sectionH}>
        <h2 id={`${SECTION_ID}-title`} tabIndex={-1}>
          확인 필요 결제
        </h2>
      </div>
      <p className={a.hint} style={{ margin: "0 0 12px" }}>
        결제사는 승인됐다는데 금액이 기록과 다르거나 일부가 취소된 결제예요. 결제사 관리 화면에서 확인한 뒤 「전액 취소」를 눌러 주세요. 결제는 실패로 닫히고, 팬에게는
        결제를 취소했으니 다시 결제해 달라는 알림이 가요. 취소할 금액을 모르는 줄은 결제사 관리 화면에서 처리해요.
      </p>
      <div role="status">
        {notice && (
          <p className={a.errorLine}>
            <span className={a.errorMark} aria-hidden="true">
              !
            </span>
            {notice}
          </p>
        )}
      </div>
      <div className={a.tblWrap}>
        <table className={a.tbl}>
          <caption className="sr-only">확인 필요 결제</caption>
          <thead>
            <tr>
              <th scope="col">주문번호</th>
              <th scope="col">종류</th>
              <th scope="col">결제한 사람</th>
              <th scope="col" className={a.num}>
                기록한 금액
              </th>
              <th scope="col" className={a.num}>
                취소할 금액
              </th>
              <th scope="col">표시 시각</th>
              <th scope="col">취소 상태</th>
              <th scope="col" className={a.stickyEnd}>
                <span className="sr-only">전액 취소</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className={a.empty}>
                  확인할 결제가 없어요.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const tag = CANCEL_TAG[r.cancelStatus];
                return (
                  <tr key={r.tossOrderId}>
                    <td className={`${a.mono} ${a.nowrap}`}>
                      <strong>{r.orderNo}</strong>
                    </td>
                    <td>{SOURCE_LABEL[r.source]}</td>
                    <td>{r.payerNickname}</td>
                    <td className={`${a.num} ${a.mono}`}>{won.format(r.amountKrw)}원</td>
                    <td className={`${a.num} ${a.mono}`}>{r.balanceKrw === null ? <span className={a.faint}>모름</span> : `${won.format(r.balanceKrw)}원`}</td>
                    <td className={`${a.mono} ${a.nowrap}`}>{formatStamp(r.reviewAt)}</td>
                    <td>
                      {tag ? <span className={`${a.tag} ${tag.className}`}>{tag.text}</span> : <span className={a.faint}>—</span>}
                      {r.cancelStatus === "failed" && r.cancelError && <PgErrorText raw={r.cancelError} />}
                    </td>
                    <td className={`${a.act} ${a.stickyEnd}`}>
                      {access === "owner" && r.balanceKrw !== null && canCancelReview(r, now) && (
                        <CancelButton row={r} balanceKrw={r.balanceKrw} onDone={setNotice} />
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// 결제사 답은 사람 말을 먼저, 코드는 결제사 문의용으로 뒤에 흐리게(같은 화면의 환불 실패와 같다)
function PgErrorText({ raw }: { raw: string }) {
  const { message, code } = splitPgError(raw);
  return (
    <span className={a.sub} style={{ display: "block", marginTop: 2 }}>
      {message}
      {code && <span className={a.faint}> · 결제사 코드 {code}</span>}
    </span>
  );
}

function CancelButton({ row, balanceKrw, onDone }: { row: ReviewPayment; balanceKrw: number; onDone: (notice: string | null) => void }) {
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = `review-cancel-title-${row.tossOrderId}`;
  const retry = row.cancelStatus !== "none";

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
    const outcome = await postReviewCancel(row.source, row.tossOrderId);
    setBusy(false);
    if (outcome.kind !== "ok" && outcome.status >= 500 && outcome.status !== 502) {
      setError(outcome.message); // 서버가 결과를 정하지 못한 일시적인 실패 — 창 안에 남기고 다시 누를 수 있다(목록은 그대로)
      return;
    }
    // 끝났거나(성공), 결제사가 거절했거나 결과를 모르거나(502), 다른 요청이 먼저 처리했으면(409·404) 목록을 새로 읽는다.
    // 다시 읽은 줄의 버튼이 사라질 수 있으니(처리 중) 창을 닫고 결과는 섹션 머리에, 포커스는 섹션 제목으로
    dialog.current?.close();
    onDone(outcome.kind === "ok" ? null : outcome.message);
    document.getElementById(`${SECTION_ID}-title`)?.focus();
    router.refresh();
  }

  return (
    <>
      <button type="button" className={`${a.btn} ${a.btnSm} ${a.btnLine}`} onClick={open} aria-label={`${row.orderNo} ${retry ? "전액 취소 다시 시도" : "전액 취소"}`}>
        {retry ? "다시 시도" : "전액 취소"}
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
          <h2 id={titleId}>{retry ? "전액 취소를 다시 시도할까요?" : "이 결제를 전액 취소할까요?"}</h2>
          <dl className={a.kv}>
            <dt>주문번호</dt>
            <dd className={a.mono}>{row.orderNo}</dd>
            <dt>결제한 사람</dt>
            <dd>{row.payerNickname}</dd>
          </dl>
          <div className={a.amount}>
            <span className={a.amountLabel}>취소할 금액 (결제사가 알려 준 남은 금액)</span>
            <b className={a.mono}>{won.format(balanceKrw)}원</b>
          </div>
          <p className={a.hint}>
            결제사 관리 화면에서 이 결제를 확인한 뒤에 눌러 주세요. 결제는 실패로 닫히고 되돌릴 수 없어요. 두 번 눌러도 결제사 취소는 한 번만 일어나요. 취소가 실패하면
            「취소 실패」로 남고 다시 시도할 수 있어요.
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
            {busy ? "취소하는 중…" : retry ? "다시 시도" : "전액 취소"}
          </button>
        </div>
      </dialog>
    </>
  );
}
