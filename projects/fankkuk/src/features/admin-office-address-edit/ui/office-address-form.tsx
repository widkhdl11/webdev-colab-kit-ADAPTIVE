"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { normalizeOfficeAddress, OFFICE_ADDRESS_MAX, officeAddressProblem } from "@/entities/order/model/office-address";
import a from "@/shared/ui/admin.module.css";
import { postOfficeAddress } from "../api/post-office-address-client";

// 팬꾹 주소 입력 (admin-console INV-K19, design-rules 8절 「대표만 하는 동작은 직원에게 버튼 자체가 보이지 않는다」).
// 대표(editable)만 입력칸·저장 버튼이 있다. 저장 권한과 값 검사는 서버·DB 가 다시 판정한다.

type Props = { address: string; editable: boolean };

export function OfficeAddressForm({ address, editable }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState(address);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // 저장 뒤 서버 값이 바뀌면 입력칸을 새 값으로 맞춘다 — 폼을 다시 만들지 않아 「저장했어요」가 남는다
  const [seen, setSeen] = useState(address);
  if (seen !== address) {
    setSeen(address);
    setDraft(address);
  }

  const problem = officeAddressProblem(draft);
  const changed = normalizeOfficeAddress(draft) !== address;
  const canSave = problem === null && changed && !busy;
  let saveLabel = "주소 저장";
  if (busy) saveLabel = "저장하는 중…";
  else if (problem) saveLabel = "주소를 확인해 주세요";
  else if (!changed) saveLabel = "바뀐 곳이 없어요";
  // 입력칸에 이어 읽히는 문제 문구 — 버튼 글자로만 알리지 않는다
  const problemText = problem === "control" ? "줄을 바꾸거나 보이지 않는 문자를 넣지 말고 한 줄로 넣어 주세요." : problem === "length" ? `5~${OFFICE_ADDRESS_MAX}자로 넣어 주세요.` : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setBusy(true);
    const outcome = await postOfficeAddress({ address: normalizeOfficeAddress(draft) });
    setBusy(false);
    if (outcome.kind === "ok") {
      setMessage({ ok: true, text: "저장했어요." });
      router.refresh(); // 서버 값과 기록을 다시 읽는다
    } else {
      setMessage({ ok: false, text: outcome.message });
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <section aria-labelledby="h-office-address">
        <div className={a.sectionH}>
          <h2 id="h-office-address">지금 주소</h2>
          <span>받는 사람 이름은 「팬꾹」 그대로예요</span>
        </div>
        {editable ? (
          <div className={a.field}>
            <label htmlFor="office-address">주소</label>
            {/* 120자가 한눈에 보이게 두 줄 칸 — 주소는 한 줄 값이라 Enter 로 줄을 바꾸지 않는다 */}
            <textarea
              id="office-address"
              className={a.textarea}
              style={{ minHeight: 0 }}
              rows={2}
              autoComplete="off"
              maxLength={OFFICE_ADDRESS_MAX + 20}
              aria-invalid={problem !== null}
              aria-describedby={problemText ? "office-address-count office-address-problem" : "office-address-count"}
              value={draft}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.preventDefault();
              }}
              onChange={(e) => {
                setDraft(e.target.value);
                setMessage(null);
              }}
            />
            <span className={a.count} id="office-address-count">
              {[...normalizeOfficeAddress(draft)].length}/{OFFICE_ADDRESS_MAX}
            </span>
            {problemText ? (
              <p className={a.errorLine} id="office-address-problem">
                {problemText}
              </p>
            ) : null}
          </div>
        ) : (
          <p className={a.card} style={{ overflowWrap: "anywhere" }}>
            <b>{address}</b>
          </p>
        )}
      </section>

      {editable && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", alignItems: "end", gap: 20, marginTop: 12 }}>
          <div>
            {/* 알림 칸은 늘 두고 글자만 바꾼다 — 새로 붙은 알림 칸은 화면 낭독기가 읽지 않을 수 있다 */}
            <p role="status" style={{ fontSize: 14, fontWeight: 700, color: message?.ok ? "var(--brand-ink)" : "var(--ink)" }}>
              {message?.text ?? ""}
            </p>
          </div>
          <div className={a.btnRow}>
            <button
              type="button"
              className={`${a.btn} ${a.btnLine}`}
              onClick={() => {
                setDraft(address);
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
