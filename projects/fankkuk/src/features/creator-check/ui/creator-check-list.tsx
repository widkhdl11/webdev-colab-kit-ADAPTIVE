"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  checkTimeLeftLabel,
  CREATOR_CHECK_DAYS,
  detectedSignalText,
  type CreatorCheckAnswer,
  type CreatorCheckView,
} from "@/entities/parcel/model/creator-check";
import { formatDateTime } from "@/shared/lib/format/datetime";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import { statusTagClass } from "@/shared/ui/status-tone";
import { sendCheckAnswer } from "../api/send-check-answer";
import c from "./creator-check.module.css";

// 확인할 선물 (2026-10-12 (2) 문제집 D3 ②). 검수에서 블루투스·RF 반응이 나왔지만 직원이 위치 추적기가 아니라고 확인한 상자를
// 받을지 크리에이터가 정한다 — 받기 / 돌려보내기. 승인 요청과 같은 줄 모양이고, 주소를 여는 방향이 아니라 서명은 없다.
// 서버에 저장된 뒤에만 그 줄을 결과 문구로 바꾼다. 기한(검수 완료 + 7일)이 지나면 버튼을 두지 않는다 — 자동 처리가 돌려보낸다.

type Done = { answer: CreatorCheckAnswer };
const keyOf = (r: Pick<CreatorCheckView, "orderNo" | "boxSeq">) => `${r.orderNo}#${r.boxSeq}`;

export function CreatorCheckList({ checks, now }: { checks: readonly CreatorCheckView[]; now: string }) {
  const router = useRouter();
  const [done, setDone] = useState<Record<string, Done>>({});
  // 저장 뒤 새로 읽으면 답한 줄은 목록에서 빠진다. 결과 문구는 그 자리에 남아야 하므로 지금까지 본 줄을 붙들고,
  // 새로 읽은 목록에서 빠진 줄은 이 화면에서 답한 것만 남긴다(승인 요청 목록과 같은 방식).
  const [seen, setSeen] = useState(checks);
  const rows = useMemo(() => {
    const fresh = new Set(checks.map(keyOf));
    const kept = seen.filter((r) => fresh.has(keyOf(r)) || done[keyOf(r)] !== undefined);
    const keptKeys = new Set(kept.map(keyOf));
    return [...kept, ...checks.filter((r) => !keptKeys.has(keyOf(r)))];
  }, [checks, seen, done]);
  const rowKey = rows.map(keyOf).join(",");
  const seenKey = seen.map(keyOf).join(",");
  useEffect(() => {
    if (rowKey !== seenKey) setSeen(rows);
  }, [rowKey, seenKey, rows]);

  const [sheet, setSheet] = useState<{ answer: CreatorCheckAnswer; row: CreatorCheckView } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 답하면 버튼이 결과 문구로 바뀌어 사라진다 — 시트가 닫힌 뒤 포커스를 그 결과 문구로 옮긴다
  const [focusKey, setFocusKey] = useState<{ key: string } | null>(null);
  const resultRefs = useRef(new Map<string, HTMLParagraphElement>());
  useEffect(() => {
    if (focusKey) resultRefs.current.get(focusKey.key)?.focus();
  }, [focusKey]);

  const confirm = async (row: CreatorCheckView, answer: CreatorCheckAnswer) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    const r = await sendCheckAnswer(row.orderNo, row.boxSeq, answer);
    setSaving(false);
    if (r.kind === "ok") {
      setDone((prev) => ({ ...prev, [keyOf(row)]: { answer } }));
      setFocusKey({ key: keyOf(row) });
      setSheet(null);
      router.refresh(); // 탭의 수와 목록을 새로 읽는다
      return;
    }
    if (r.kind === "login") {
      router.push("/login");
      return;
    }
    setError(r.kind === "refused" ? r.message : "저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
  };

  return (
    <>
      <p className="sub">
        검수에서 무선 신호가 잡혔지만 위치 추적기는 아니라고 확인한 상자예요. 받을지 정해 주세요. {CREATOR_CHECK_DAYS}일 안에 정하지 않으면 보낸 분에게
        돌려보내요.
      </p>
      {rows.length === 0 ? (
        <p className={c.empty}>확인할 선물이 없어요.</p>
      ) : (
        <ul className={c.rows}>
          {rows.map((r, i) => {
            const key = keyOf(r);
            const d = done[key];
            const lapsed = Date.parse(r.dueAt) <= Date.parse(now);
            return (
              <li key={key} className={c.row}>
                <FaceAvatar index={i} />
                <div className={c.main}>
                  <p className={c.who}>
                    {r.senderNickname}님의 선물 · 상자 {r.boxSeq}
                  </p>
                  <p className={c.says}>
                    {r.itemKind} · {r.orderNo}
                  </p>
                  {d ? (
                    <p
                      ref={(el) => {
                        if (el) resultRefs.current.set(key, el);
                        else resultRefs.current.delete(key);
                      }}
                      tabIndex={-1}
                      className={c.result}
                    >
                      {d.answer === "accept" ? "받기로 했어요. 다른 상자와 같이 검수를 마치면 출고돼요" : "돌려보내기로 했어요. 보낸 분 주소로 돌려보내요"}
                    </p>
                  ) : (
                    <>
                      <p className={c.why}>{detectedSignalText(r)} 신호가 잡혔어요. 직원이 상자를 열어 보고 위치 추적기는 아니라고 확인했어요.</p>
                      <p className={c.meta}>
                        <span className={statusTagClass("warn")}>{checkTimeLeftLabel(r.dueAt, now)}</span>
                        <span className="sub">{formatDateTime(r.askedAt)} 검수</span>
                        {lapsed ? <span className="sub">기한이 지나 곧 보낸 분에게 돌려보내요.</span> : null}
                      </p>
                    </>
                  )}
                </div>
                {d ? (
                  <span className={statusTagClass(d.answer === "accept" ? "success" : "danger", c["done-tag"])}>
                    {d.answer === "accept" ? "받음" : "돌려보냄"}
                  </span>
                ) : lapsed ? null : (
                  <div className={c.act}>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        setError(null);
                        setSheet({ answer: "accept", row: r });
                      }}
                    >
                      받기
                    </button>
                    <button
                      className="btn btn--soft"
                      type="button"
                      onClick={() => {
                        setError(null);
                        setSheet({ answer: "return", row: r });
                      }}
                    >
                      돌려보내기
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <BottomSheet
        open={sheet !== null}
        title={sheet?.answer === "return" ? "이 상자를 돌려보낼까요?" : "이 상자를 받을까요?"}
        onClose={() => setSheet(null)}
      >
        {sheet ? (
          <>
            <p className="sub">
              {sheet.row.senderNickname}님의 선물({sheet.row.orderNo}) 상자 {sheet.row.boxSeq}.{" "}
              {sheet.answer === "return"
                ? "보낸 분 주소로 돌려보내요. 보낸 분에게는 검수를 통과하지 못했다고만 알리고, 크리에이터가 돌려보냈다는 것은 알리지 않아요."
                : "다른 상자와 같이 검수를 마치면 출고돼요. 아직 승인하지 않은 선물이면 승인해야 출고돼요."}
            </p>
            <p className={`sub ${c.reason}`}>한 번 정하면 바꿀 수 없어요.</p>
            {error ? (
              <p className={c.error} role="alert">
                <span className={c["error-mark"]} aria-hidden="true">
                  !
                </span>
                {error}
              </p>
            ) : null}
            <div className={c["sheet-btns"]}>
              <button className="btn btn--soft" type="button" onClick={() => setSheet(null)}>
                돌아가기
              </button>
              <button className="btn" type="button" disabled={saving} onClick={() => void confirm(sheet.row, sheet.answer)}>
                {saving ? "저장하는 중…" : sheet.answer === "return" ? "돌려보내기" : "받기"}
              </button>
            </div>
          </>
        ) : null}
      </BottomSheet>
    </>
  );
}
