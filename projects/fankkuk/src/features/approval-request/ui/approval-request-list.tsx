"use client";

import { statusTagClass, type StatusTone } from "@/shared/ui/status-tone";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { APPROVAL_DEADLINE_DAYS } from "@/entities/order/config/approval-deadline";
import { approvalTimeLeftLabel, isApprovalDeadlinePassed } from "@/entities/order/model/approval-time-left";
import type { ApprovalRequestView } from "@/entities/order/model/creator-view";
import type { DecidedOutcome, DecidedRequestView } from "@/entities/order/model/decided-request";
import { formatDate, formatDateTime } from "@/shared/lib/format/datetime";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import { KakaoBubble } from "@/shared/ui/kakao-bubble";
import { sendApprove } from "../api/send-approve";
import { sendDecline } from "../api/send-decline";
import { applyDecision, decidedBelow, type LocalDecision } from "../model/local-decision";
import { PROMISE } from "@/shared/config/site-copy";
import a from "./approval-request.module.css";

// 크리에이터 승인 요청 목록(시안 v11 creator-requests.html — 승인 대기 · 처리한 요청을 위아래 두 구간, 같은 크기 카드 2열. v4 의 안쪽 탭은 v11 에서 없앴다).
// 받지 않기(+차단)는 서버에 저장한다(decline-block). 승인도 서버에 보낸다 — 카카오 연결 전에는 로컬에서만 가짜 서명 창구가
// 서명을 대신하고(INV-S11, 카드 d28), 운영에서는 서버가 거부한다. 저장된 뒤에만 그 줄을 「승인함」으로 바꾼다.
//
// 승인 버튼은 승인하지 않는다. 카카오톡 인증서 서명 요청을 보내는 것까지이고, 승인은 서명이
// 서버 검증을 통과했을 때만 일어난다(INV-S7: 승인 상태를 바꾸는 경로는 서명 검증을 통과한 승인 처리 하나뿐).
// 그래서 예시에서도 버튼을 누른 결과는 "서명 대기"이지 "승인됨"이 아니다. 전체 승인 버튼은 없다.
// 거절은 주소를 여는 방향이 아니라 서명 없이 로그인 세션으로 한다(승인 서명 스펙 비범위).


// 처리 뒤 포커스를 옮길 곳. 같은 줄을 두 번 처리해도 effect 가 다시 돌게 매번 새 객체로 둔다.
type FocusTarget = { orderNo: string; where: "result" | "approve" };

const DECIDED_TAG: Record<DecidedOutcome, { text: string; tone: StatusTone }> = {
  approved: { text: "승인함", tone: "success" },
  declined: { text: "받지 않음", tone: "danger" },
  blocked: { text: "차단함", tone: "danger" },
  expired: { text: "자동 반려", tone: "danger" },
};

function HourglassGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M5 2h14v5a6 6 0 0 1-2.4 4.8L14.5 12l2.1.2A6 6 0 0 1 19 17v5H5v-5a6 6 0 0 1 2.4-4.8L9.5 12l-2.1-.2A6 6 0 0 1 5 7V2Z"
      />
    </svg>
  );
}

function DecidedNote({ d }: { d: DecidedRequestView }) {
  const day = formatDate(d.decidedAt);
  if (d.outcome === "approved") return <>{day} 처리 · 카카오톡 서명으로 승인했어요.</>;
  if (d.outcome === "declined") return <>{day} 처리 · 팬에게는 이유를 알리지 않았어요.</>;
  if (d.outcome === "expired") return <>{day} 자동 처리 · {APPROVAL_DEADLINE_DAYS}일 안에 정하지 않아 자동으로 받지 않음 처리됐어요.</>;
  return (
    <>
      {day} 처리 · 앞으로 이 팬의 선물은 받지 않아요. 풀려면{" "}
      <Link className={a["link-in"]} href="/creator/settings#blocked">
        주소와 설정
      </Link>
      에서 해요.
    </>
  );
}

export function ApprovalRequestList({
  requests,
  decided,
  now,
}: {
  requests: readonly ApprovalRequestView[];
  decided: readonly DecidedRequestView[];
  now: string;
}) {
  const router = useRouter();
  const [states, setStates] = useState<Record<string, LocalDecision>>({});
  // 저장 뒤 새로 읽으면(router.refresh) 거절된 줄은 대기 목록에서 빠진다. 결과 문구는 그 자리에 남아야 하므로
  // 지금까지 본 줄을 순서대로 붙들고, 새로 읽은 목록에서 빠진 줄은 이 화면에서 처리한 것만 남긴다. 새 요청은 뒤에 붙인다.
  const [seen, setSeen] = useState(requests);
  const rows = useMemo(() => {
    const fresh = new Set(requests.map((r) => r.orderNo));
    const kept = seen.filter((r) => fresh.has(r.orderNo) || (states[r.orderNo]?.kind ?? "pending") !== "pending");
    const keptNos = new Set(kept.map((r) => r.orderNo));
    return [...kept, ...requests.filter((r) => !keptNos.has(r.orderNo))];
  }, [requests, seen, states]);
  // 줄 구성이 바뀔 때만 붙들어 둔다 — 매번 새 배열을 넣으면 rows 가 다시 계산돼 끝없이 돈다
  const below = decidedBelow(decided, states);
  const rowKey = rows.map((r) => r.orderNo).join(",");
  const seenKey = seen.map((r) => r.orderNo).join(",");
  useEffect(() => {
    if (rowKey !== seenKey) setSeen(rows);
  }, [rowKey, seenKey, rows]);
  const [sheet, setSheet] = useState<{ kind: "approve" | "decline"; req: ApprovalRequestView } | null>(null);
  const [block, setBlock] = useState(false);
  const [saving, setSaving] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);
  const [approveError, setApproveError] = useState<string | null>(null);

  // 결정하면 버튼이 결과 문구로 바뀌어 사라진다 — 시트가 닫힌 뒤 포커스를 그 결과 문구로 옮긴다.
  // 서명 요청을 취소하면 다시 생긴 「카카오톡으로 승인」 버튼으로 옮긴다.
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const resultRefs = useRef(new Map<string, HTMLParagraphElement>());
  const approveRefs = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    if (!focusTarget) return;
    const map = focusTarget.where === "result" ? resultRefs.current : approveRefs.current;
    map.get(focusTarget.orderNo)?.focus();
  }, [focusTarget]);

  const stateOf = (orderNo: string): LocalDecision => states[orderNo] ?? { kind: "pending" };
  const decide = (req: ApprovalRequestView, st: LocalDecision, alsoDeclined: ReadonlySet<string> = new Set()) => {
    setStates((prev) => applyDecision(prev, req.orderNo, st, alsoDeclined));
    setFocusTarget({ orderNo: req.orderNo, where: "result" });
    setSheet(null);
  };
  // 서버에 저장된 뒤에만 화면을 바꾼다. 실패하면 창을 닫지 않고 이유를 보인다.
  const confirmDecline = async (req: ApprovalRequestView) => {
    if (saving) return;
    setSaving(true);
    setDeclineError(null);
    const r = await sendDecline(req.requestId, block);
    setSaving(false);
    if (r.kind === "ok") {
      decide(req, { kind: "declined", blocked: block }, new Set(r.alsoDeclinedOrderNos));
      router.refresh(); // 처리한 요청 구간과 머리글의 대기 수를 새로 읽는다
      return;
    }
    if (r.kind === "login") {
      router.push("/login");
      return;
    }
    setDeclineError(r.kind === "refused" ? r.message : "저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
  };
  // 서명 창구를 거쳐 서버가 승인을 저장한 뒤에만 화면을 바꾼다. 실패하면 창을 닫지 않고 이유를 보인다.
  const confirmApprove = async (req: ApprovalRequestView) => {
    if (saving) return;
    setSaving(true);
    setApproveError(null);
    const r = await sendApprove(req.requestId);
    setSaving(false);
    if (r.kind === "ok") {
      decide(req, { kind: "approved" });
      router.refresh();
      return;
    }
    if (r.kind === "login") {
      router.push("/login");
      return;
    }
    setApproveError(r.kind === "refused" ? r.message : "승인하지 못했어요. 잠시 뒤 다시 해 주세요.");
  };
  const cancelSigning = (req: ApprovalRequestView) => {
    setStates((prev) => ({ ...prev, [req.orderNo]: { kind: "pending" } }));
    setFocusTarget({ orderNo: req.orderNo, where: "approve" });
  };

  const waitingCount = rows.filter((r) => {
    const k = stateOf(r.orderNo).kind;
    return k === "pending" || k === "signing";
  }).length;

  return (
    <>
      <section id="wait" className={a.sec} aria-labelledby="wait-h">
        <h2 className="t-card" id="wait-h">
          승인 대기 {waitingCount}
        </h2>
        {rows.length === 0 ? (
          <p className="empty">기다리는 승인 요청이 없어요.</p>
        ) : (
          <ul className="grid cols-2">
            {rows.map((r, i) => {
              const st = stateOf(r.orderNo);
              const requested = `${formatDateTime(r.registeredAt)} 요청`;
              const lapsed = isApprovalDeadlinePassed(r.registeredAt, now);
              return (
                <li key={r.orderNo} className="card card-col">
                  <div className="who">
                    <FaceAvatar index={i} />
                    <div>
                      <p className="t-card">{r.fanNickname}님의 선물</p>
                      <p className="t-meta">
                        {r.itemKind} · 상자 {r.boxCount}개 · {r.orderNo}
                      </p>
                    </div>
                  </div>

                  {st.kind === "pending" ? (
                    <>
                      <p className="tags">
                        <span className={statusTagClass("warn")}>{approvalTimeLeftLabel(r.registeredAt, now)}</span>
                        {r.receivedAt ? <span className="tag">{formatDateTime(r.receivedAt)} 사무실 도착</span> : null}
                        {r.hasElectronicsOrMetal ? <span className="tag">전자기기·금속 있음</span> : null}
                      </p>
                      <p className="t-meta">{requested}</p>
                      {lapsed ? <p className="t-meta">기한이 지나 승인할 수 없어요. 곧 자동으로 받지 않음 처리돼요.</p> : null}
                      <div className="btn-col push">
                        {lapsed ? null : (
                          <button
                            ref={(el) => {
                              if (el) approveRefs.current.set(r.orderNo, el);
                              else approveRefs.current.delete(r.orderNo);
                            }}
                            className="btn btn--kakao"
                            type="button"
                            onClick={() => {
                              setApproveError(null);
                              setSheet({ kind: "approve", req: r });
                            }}
                          >
                            <KakaoBubble />
                            카카오톡으로 승인
                          </button>
                        )}
                        <button
                          className="btn btn--line"
                          type="button"
                          onClick={() => {
                            setBlock(false);
                            setDeclineError(null);
                            setSheet({ kind: "decline", req: r });
                          }}
                        >
                          받지 않기
                        </button>
                      </div>
                    </>
                  ) : st.kind === "signing" ? (
                    <>
                      <p
                        ref={(el) => {
                          if (el) resultRefs.current.set(r.orderNo, el);
                          else resultRefs.current.delete(r.orderNo);
                        }}
                        tabIndex={-1}
                        className={a.signing}
                      >
                        <HourglassGlyph />
                        <strong>카카오톡에서 서명을 기다리고 있어요</strong>
                      </p>
                      <p className="t-meta">서명을 마치기 전에는 아무것도 바뀌지 않아요. · {requested}</p>
                      <div className="push">
                        <button className="btn btn--line btn--block" type="button" onClick={() => cancelSigning(r)}>
                          서명 요청 취소
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p
                        ref={(el) => {
                          if (el) resultRefs.current.set(r.orderNo, el);
                          else resultRefs.current.delete(r.orderNo);
                        }}
                        tabIndex={-1}
                        className={a.result}
                      >
                        {st.kind === "approved"
                          ? "승인했어요. 검수를 마치면 출고돼요"
                          : st.kind === "blocked_elsewhere"
                          ? `${r.fanNickname}님을 차단해서 이 선물도 받지 않아요`
                          : st.blocked
                            ? `받지 않기로 했어요. ${r.fanNickname}님의 선물은 앞으로 등록되지 않아요`
                            : "받지 않기로 했어요"}
                      </p>
                      <p className="push">
                        <span className={statusTagClass(st.kind === "approved" ? "success" : "danger")}>
                          {st.kind === "approved" ? "승인함" : st.kind === "declined" && !st.blocked ? "받지 않음" : "차단함"}
                        </span>
                      </p>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section id="done" className={a.sec} aria-labelledby="done-h">
        <h2 className="t-card" id="done-h">
          처리한 요청
        </h2>
        {below.length === 0 ? (
          <p className="empty">아직 처리한 요청이 없어요.</p>
        ) : (
          <ul className="grid cols-2">
            {below.map((d, i) => {
              const tag = DECIDED_TAG[d.outcome];
              return (
                <li key={d.orderNo} className="card card-col">
                  <p>
                    <span className={statusTagClass(tag.tone)}>{tag.text}</span>
                  </p>
                  <div className="who">
                    <FaceAvatar index={i} />
                    <div>
                      <p className="t-card">{d.fanNickname}님의 선물</p>
                      <p className="t-meta">
                        {d.itemKind} · 상자 {d.boxCount}개 · {d.orderNo}
                      </p>
                    </div>
                  </div>
                  <p className="t-meta">
                    <DecidedNote d={d} />
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <BottomSheet open={sheet?.kind === "approve"} title="카카오톡으로 서명해 주세요" onClose={() => setSheet(null)}>
        {sheet?.kind === "approve" ? (
          <>
            <p className="sub">
              {sheet.req.fanNickname}님의 {sheet.req.itemKind}({sheet.req.orderNo}) 한 건을 승인합니다. 카카오톡 인증서로 서명해야
              승인이 끝나요.
            </p>
            <p className={`sub ${a.reason}`}>
              {PROMISE.address} 승인한 뒤에도 송장을 출력할 때만 열리고, 열린 기록은 열람 기록에서 볼 수 있어요.
            </p>
            {approveError ? (
              <p className={a.error} role="alert">
                <span className={a["error-mark"]} aria-hidden="true">
                  !
                </span>
                {approveError}
              </p>
            ) : null}
            <div className={a["sheet-btns"]}>
              <button className="btn btn--soft" type="button" onClick={() => setSheet(null)}>
                돌아가기
              </button>
              <button className="btn btn--kakao" type="button" disabled={saving} onClick={() => void confirmApprove(sheet.req)}>
                <KakaoBubble />
                서명 요청 보내기
              </button>
            </div>
          </>
        ) : null}
      </BottomSheet>

      <BottomSheet
        open={sheet?.kind === "decline"}
        title={`${sheet?.req.fanNickname ?? ""}님의 선물을 받지 않을까요?`}
        onClose={() => setSheet(null)}
      >
        {sheet?.kind === "decline" ? (
          <>
            <p className="sub">받지 않는 데에는 카카오톡 서명이 필요 없어요.</p>
            <label className={a["check-row"]}>
              <input type="checkbox" checked={block} onChange={(e) => setBlock(e.target.checked)} />
              <span>
                이 팬의 선물을 앞으로 받지 않기(차단)
                <small>차단한 팬은 선물을 보낼 수 없어요. 승인 대기 중인 이 팬의 다른 선물도 함께 받지 않고, 이미 승인한 선물은 그대로 받아요. 풀 때는 주소와 설정에서 해요.</small>
              </span>
            </label>
            <p className={`sub ${a.reason}`}>
              {sheet.req.fanNickname}님에게는 선물을 원하지 않는다는 것만 전해지고, 이유와 차단 여부는 알리지 않아요.
            </p>
            {declineError ? (
              <p className={a.error} role="alert">
                <span className={a["error-mark"]} aria-hidden="true">
                  !
                </span>
                {declineError}
              </p>
            ) : null}
            <div className={a["sheet-btns"]}>
              <button className="btn btn--soft" type="button" onClick={() => setSheet(null)}>
                돌아가기
              </button>
              <button className="btn" type="button" disabled={saving} onClick={() => void confirmDecline(sheet.req)}>
                {saving ? "저장하는 중…" : "받지 않기"}
              </button>
            </div>
          </>
        ) : null}
      </BottomSheet>
    </>
  );
}
