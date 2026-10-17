"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatStamp } from "@/shared/lib/format/datetime";
import { isStaleFailure } from "@/shared/lib/http/post-json-client";
import a from "@/shared/ui/admin.module.css";
import { postProcessCheck } from "../api/post-process-client";
import type { CreatorCheckChoiceRow } from "../model/process-check";

// 관리자 「들어온 상자」 위의 크리에이터가 고른 블루투스 상자·추적기 보관 상자 목록 (office-workflow INV-W13·W14). 크리에이터의 받기·거절은 선택일 뿐이고,
// 운영자가 여기서 처리 버튼을 눌러야 받기 선택은 검수 완료, 거절 선택은 반송 대기로 넘어간다. 버튼은 화면에 보이는 선택을 함께 보낸다 —
// 그사이 크리에이터가 취소하고 다르게 골랐으면 서버가 「바뀜」으로 거부하고 목록을 새로 읽는다. 기한(검수 완료 + 7일)이 지나면 자동 처리가 고른 쪽대로 한다.

// 추적기 보관 상자(office-workflow INV-W14)도 같은 목록 — 신고하기는 신고 보관, 신고하지 않기는 반송 대기로 넘어간다
const CHOICE_TEXT = { accept: "받기 선택", return: "거절 선택", report: "신고하기 선택", no_report: "신고하지 않기 선택" } as const;
const PROCESS_TEXT = { accept: "검수 완료로 처리", return: "반송으로 처리", report: "신고 보관으로 처리", no_report: "반송으로 처리" } as const;

export function CreatorCheckChoices({ rows }: { rows: readonly CreatorCheckChoiceRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function process(r: CreatorCheckChoiceRow) {
    if (busy) return;
    setBusy(r.qr);
    setError(null);
    const outcome = await postProcessCheck(r.qr, r.choice);
    setBusy(null);
    if (outcome.kind === "ok") {
      router.refresh();
      return;
    }
    setError(`${r.qr} — ${outcome.message}`);
    if (isStaleFailure(outcome)) router.refresh();
  }

  return (
    <section aria-labelledby="cc-choices">
      <div className={a.sectionH}>
        <h2 id="cc-choices">크리에이터가 고른 상자</h2>
        <span>{rows.length}건</span>
      </div>
      <div className={a.tblWrap}>
        <table className={a.tbl}>
          <caption className="sr-only">크리에이터가 고른 상자</caption>
          <thead>
            <tr>
              <th scope="col">QR</th>
              <th scope="col">주문·상자</th>
              <th scope="col">선택</th>
              <th scope="col">고른 때</th>
              <th scope="col">기한</th>
              <th scope="col" className={a.act}>
                처리
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className={a.empty}>
                  처리를 기다리는 상자가 없어요.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.qr}>
                  <td className={a.mono}>{r.qr}</td>
                  <td className={a.mono}>
                    {r.orderNo} · {r.boxSeq}
                  </td>
                  <td>
                    <span className={r.choice === "accept" ? `${a.tag} ${a.tagBrand}` : `${a.tag} ${a.tagWarn}`}>{CHOICE_TEXT[r.choice]}</span>
                  </td>
                  <td className={a.mono}>{formatStamp(r.chosenAt)}</td>
                  <td className={a.mono}>{formatStamp(r.dueAt)}</td>
                  <td className={a.act}>
                    <button
                      type="button"
                      className={`${a.btn} ${a.btnSm} ${a.btnInk}`}
                      aria-disabled={busy !== null}
                      aria-label={`${r.qr} ${CHOICE_TEXT[r.choice]}대로 처리`}
                      onClick={() => void process(r)}
                    >
                      {busy === r.qr ? "처리하는 중…" : PROCESS_TEXT[r.choice]}
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <div role="status">
        {error ? (
          <p className={a.errorLine}>
            <span className={a.errorMark} aria-hidden="true">
              !
            </span>
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
