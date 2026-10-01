"use client";

import { useEffect, useRef, useState } from "react";
import type { ApprovalRequestView } from "@/entities/order/model/creator-view";
import { NOT_ACCEPTED_TEXT } from "@/entities/order/ui/fan-stage-copy";
import { formatDateTime } from "@/shared/lib/format/datetime";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import s from "@/shared/ui/screen.module.css";
import a from "./approval-request.module.css";

// 크리에이터 승인 요청 목록. 지금은 예시 — 서버에 아무것도 보내지 않는다.
//
// 승인 버튼은 승인하지 않는다. 카카오톡 인증서 서명 요청을 보내는 것까지이고, 승인은 서명이
// 서버 검증을 통과했을 때만 일어난다(INV-S7: 승인 상태를 바꾸는 경로는 서명 검증을 통과한 승인 처리 하나뿐).
// 그래서 예시에서도 버튼을 누른 결과는 "서명 대기"이지 "승인됨"이 아니다. 전체 승인 버튼은 없다.
// 거절은 주소를 여는 방향이 아니라 서명 없이 로그인 세션으로 한다(승인 서명 스펙 비범위).

type LocalState =
  | { kind: "pending" }
  | { kind: "signing" }
  | { kind: "declined"; blocked: boolean }
  | { kind: "blocked_elsewhere" }; // 같은 팬의 다른 요청을 거절하며 차단했다

export function ApprovalRequestList({ requests }: { requests: readonly ApprovalRequestView[] }) {
  const [states, setStates] = useState<Record<string, LocalState>>({});
  const [sheet, setSheet] = useState<{ kind: "approve" | "decline"; req: ApprovalRequestView } | null>(null);
  const [block, setBlock] = useState(false);

  // 결정하면 버튼이 결과 문구로 바뀌어 사라진다 — 시트가 닫힌 뒤 포커스를 그 결과 문구로 옮긴다
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  const resultRefs = useRef(new Map<string, HTMLParagraphElement>());
  useEffect(() => {
    if (focusTarget) resultRefs.current.get(focusTarget)?.focus();
  }, [focusTarget]);

  const stateOf = (orderNo: string): LocalState => states[orderNo] ?? { kind: "pending" };
  const decide = (req: ApprovalRequestView, st: LocalState) => {
    setStates((prev) => {
      const next: Record<string, LocalState> = { ...prev, [req.orderNo]: st };
      // 차단은 팬 단위다 — 같은 팬이 기다리는 다른 요청도 더는 승인할 수 없다
      if (st.kind === "declined" && st.blocked) {
        for (const other of requests) {
          if (other.fanNickname === req.fanNickname && other.orderNo !== req.orderNo && (next[other.orderNo] ?? { kind: "pending" }).kind === "pending") {
            next[other.orderNo] = { kind: "blocked_elsewhere" };
          }
        }
      }
      return next;
    });
    setFocusTarget(req.orderNo);
    setSheet(null);
  };

  if (requests.length === 0) {
    return (
      <div className={s["card-tint"]}>
        <p>기다리는 승인 요청이 없어요.</p>
      </div>
    );
  }

  return (
    <>
      <ul className={s.list} role="list">
        {requests.map((r) => {
          const st = stateOf(r.orderNo);
          return (
            <li key={r.orderNo} className={s.card}>
              <div className={a.who}>
                <span className={a.avatar} aria-hidden="true">
                  {r.fanNickname.slice(0, 1)}
                </span>
                <div className={a["who-text"]}>
                  <span className={a.nickname}>{r.fanNickname}</span>
                  <span className={s.muted}>{formatDateTime(r.registeredAt)} 요청</span>
                </div>
              </div>

              <dl className={`${s.rows} ${a.facts}`}>
                <div>
                  <dt>선물</dt>
                  <dd>{r.itemKind}</dd>
                </div>
                <div>
                  <dt>상자</dt>
                  <dd>{r.boxCount}개</dd>
                </div>
                <div>
                  <dt>주문번호</dt>
                  <dd>{r.orderNo}</dd>
                </div>
              </dl>

              <div className={a.tags}>
                {r.hasElectronicsOrMetal ? <span className={s["pill-plain"]}>전자기기·금속 있음</span> : null}
                {r.receivedAt ? <span className={s.pill}>{formatDateTime(r.receivedAt)} 사무실 도착</span> : null}
              </div>

              {st.kind === "pending" ? (
                <div className={`${s["button-row"]} ${a.actions}`}>
                  <button
                    type="button"
                    className={s["button-quiet"]}
                    onClick={() => {
                      setBlock(false);
                      setSheet({ kind: "decline", req: r });
                    }}
                  >
                    거절
                  </button>
                  <button type="button" className={s.button} onClick={() => setSheet({ kind: "approve", req: r })}>
                    승인
                  </button>
                </div>
              ) : (
                <p
                  ref={(el) => {
                    if (el) resultRefs.current.set(r.orderNo, el);
                    else resultRefs.current.delete(r.orderNo);
                  }}
                  tabIndex={-1}
                  className={`${a.result} ${st.kind === "signing" ? a["result-signing"] : ""}`}
                >
                  {st.kind === "signing"
                    ? "카카오톡에서 서명을 마치면 승인돼요"
                    : st.kind === "blocked_elsewhere"
                      ? `${r.fanNickname}님을 차단해서 이 선물도 받지 않아요`
                      : st.blocked
                        ? `받지 않기로 했어요. ${r.fanNickname}님의 선물은 앞으로 등록되지 않아요`
                        : "받지 않기로 했어요"}
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <BottomSheet
        open={sheet?.kind === "approve"}
        title="카카오톡으로 서명해 주세요"
        onClose={() => setSheet(null)}
      >
        {sheet?.kind === "approve" ? (
          <>
            <p className={s.muted}>
              {sheet.req.fanNickname}님의 {sheet.req.itemKind}({sheet.req.orderNo}) 한 건을 승인합니다. 카카오톡 인증서로 서명해야
              승인이 끝나요.
            </p>
            <p className={s.note}>승인한 선물만 송장을 출력할 때 주소가 열리고, 그 기록은 열람 기록에서 볼 수 있어요.</p>
            <button
              type="button"
              className={s.button}
              onClick={() => decide(sheet.req, { kind: "signing" })}
            >
              카카오톡으로 서명 요청 보내기
            </button>
            <button type="button" className={s["button-quiet"]} onClick={() => setSheet(null)}>
              닫기
            </button>
          </>
        ) : null}
      </BottomSheet>

      <BottomSheet open={sheet?.kind === "decline"} title="이 선물을 받지 않을까요?" onClose={() => setSheet(null)}>
        {sheet?.kind === "decline" ? (
          <>
            <p className={s.muted}>
              거절한 이유는 팬에게 알리지 않아요. {sheet.req.fanNickname}님에게는 &ldquo;{NOT_ACCEPTED_TEXT}&rdquo;만 전해져요.
            </p>
            <label className={a.check}>
              <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} />
              <span>
                <span className={a["check-title"]}>{sheet.req.fanNickname}님의 선물을 앞으로 받지 않기</span>
                <span className={s.muted}>차단하면 이 팬은 선물을 등록할 수 없어요. 해제할 때는 카카오톡 서명이 필요해요.</span>
              </span>
            </label>
            <button
              type="button"
              className={s.button}
              onClick={() => decide(sheet.req, { kind: "declined", blocked: block })}
            >
              받지 않기
            </button>
            <button type="button" className={s["button-quiet"]} onClick={() => setSheet(null)}>
              닫기
            </button>
          </>
        ) : null}
      </BottomSheet>
    </>
  );
}
