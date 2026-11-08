"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { boxServiceFeesProblem, type BoxServiceFees } from "@/entities/payment/model/box-service-fees";
import a from "@/shared/ui/admin.module.css";
import { postBoxServiceFees } from "../api/post-box-service-fees-client";
import { formatWon, parseWon } from "../model/price-input";

// 선물함 서비스료 — 기본·초기 크리에이터 (revgift-box INV-GB13~GB15, ux pages/admin-pricing.md).
// 대표(editable)만 입력칸·저장 버튼이 있다. 저장 권한과 범위는 서버·DB 가 다시 판정한다.

type Draft = { regular: string; early: string };

function draftOf(fees: BoxServiceFees): Draft {
  return { regular: formatWon(fees.regularKrw), early: formatWon(fees.earlyKrw) };
}

const FIELDS = [
  { key: "regular", id: "box-fee-regular", label: "기본", note: "" },
  { key: "early", id: "box-fee-early", label: "초기 크리에이터", note: "채널 확인 순서로 앞선 50명, 3개월 동안 한 달 30건까지" },
] as const;

type Props = { fees: BoxServiceFees; editable: boolean };

export function BoxServiceFeeForm({ fees, editable }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => draftOf(fees));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const next: BoxServiceFees = { regularKrw: parseWon(draft.regular), earlyKrw: parseWon(draft.early) };
  const problem = boxServiceFeesProblem(next);
  const changed = next.regularKrw !== fees.regularKrw || next.earlyKrw !== fees.earlyKrw;
  const canSave = problem === null && changed && !busy;
  let saveLabel = "서비스료 저장";
  if (busy) saveLabel = "저장하는 중…";
  else if (problem === "early_above_regular") saveLabel = "초기 크리에이터 값이 기본보다 커요";
  else if (problem) saveLabel = "금액을 확인해 주세요";
  else if (!changed) saveLabel = "바뀐 곳이 없어요";

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    const outcome = await postBoxServiceFees({ regular_krw: next.regularKrw, early_krw: next.earlyKrw });
    setBusy(false);
    if (outcome.kind === "ok") {
      setMessage({ ok: true, text: "저장했어요." });
      router.refresh(); // 서버 값을 다시 읽는다
    } else {
      setMessage({ ok: false, text: outcome.message });
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <section aria-labelledby="h-box-fees">
        <div className={a.sectionH}>
          <h2 id="h-box-fees">선물함 서비스료</h2>
          <span>이미 만든 명세서는 그대로예요</span>
        </div>
        <div className={a.tblWrap}>
          <table className={a.tbl} style={{ minWidth: 480 }}>
            <caption className="sr-only">선물함 서비스료</caption>
            <thead>
              <tr>
                <th scope="col">구분</th>
                <th scope="col" className={a.num}>
                  팬 한 명당
                </th>
              </tr>
            </thead>
            <tbody>
              {FIELDS.map((f) => {
                const saved = f.key === "regular" ? fees.regularKrw : fees.earlyKrw;
                return (
                  <tr key={f.key}>
                    <th scope="row">
                      {f.label} {f.note && <span className={a.faint}>{f.note}</span>}
                    </th>
                    <td className={a.num}>
                      {editable ? (
                        <>
                          <label className="sr-only" htmlFor={f.id}>
                            선물함 서비스료 {f.label}
                          </label>
                          <input
                            id={f.id}
                            className={`${a.input} ${a.num}`}
                            style={{ width: 104 }}
                            inputMode="numeric"
                            autoComplete="off"
                            value={draft[f.key]}
                            onChange={(e) => {
                              const v = e.target.value;
                              setDraft((d) => ({ ...d, [f.key]: v }));
                              setMessage(null);
                            }}
                          />{" "}
                          원
                        </>
                      ) : (
                        <>
                          <b className={a.mono}>{formatWon(saved)}</b> 원
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editable && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "end", gap: 20, marginTop: 12 }}>
          <div>
            {message && (
              <p role="status" style={{ fontSize: 14, fontWeight: 700, color: message.ok ? "var(--brand-ink)" : "var(--ink)" }}>
                {message.text}
              </p>
            )}
          </div>
          <div className={a.btnRow}>
            <button
              type="button"
              className={`${a.btn} ${a.btnLine}`}
              onClick={() => {
                setDraft(draftOf(fees));
                setMessage(null);
              }}
            >
              되돌리기
            </button>
            <button type="submit" className={`${a.btn} ${a.btnLg}`} aria-disabled={!canSave}>
              {saveLabel}
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
