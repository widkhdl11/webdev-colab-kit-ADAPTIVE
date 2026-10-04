"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { APPROVAL_DEADLINE_DAYS } from "@/entities/order/config/approval-deadline";
import type { ApprovalRequestView } from "@/entities/order/model/creator-view";
import type { DecidedOutcome, DecidedRequestView } from "@/entities/order/model/decided-request";
import { NOT_ACCEPTED_TEXT } from "@/entities/order/ui/fan-stage-copy";
import { formatDate, formatDateTime } from "@/shared/lib/format/datetime";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import { KakaoBubble } from "@/shared/ui/kakao-bubble";
import { sendDecline } from "../api/send-decline";
import { applyDecision, type LocalDecision } from "../model/local-decision";
import a from "./approval-request.module.css";

// 크리에이터 승인 요청 목록(시안 v4 creator-requests.html).
// 받지 않기(+차단)는 서버에 저장한다(decline-block). 승인 버튼은 아직 서명 대기 표시까지다 — 서버에 보내지 않는다.
//
// 승인 버튼은 승인하지 않는다. 카카오톡 인증서 서명 요청을 보내는 것까지이고, 승인은 서명이
// 서버 검증을 통과했을 때만 일어난다(INV-S7: 승인 상태를 바꾸는 경로는 서명 검증을 통과한 승인 처리 하나뿐).
// 그래서 예시에서도 버튼을 누른 결과는 "서명 대기"이지 "승인됨"이 아니다. 전체 승인 버튼은 없다.
// 거절은 주소를 여는 방향이 아니라 서명 없이 로그인 세션으로 한다(승인 서명 스펙 비범위).

type TabKey = "wait" | "done";
const TABS: readonly TabKey[] = ["wait", "done"];

// 처리 뒤 포커스를 옮길 곳. 같은 줄을 두 번 처리해도 effect 가 다시 돌게 매번 새 객체로 둔다.
type FocusTarget = { orderNo: string; where: "result" | "approve" };

const DECIDED_TAG: Record<DecidedOutcome, { text: string; brand: boolean }> = {
  approved: { text: "승인함", brand: true },
  declined: { text: "받지 않음", brand: false },
  blocked: { text: "차단함", brand: false },
  expired: { text: "자동 반려", brand: false },
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
}: {
  requests: readonly ApprovalRequestView[];
  decided: readonly DecidedRequestView[];
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
  const rowKey = rows.map((r) => r.orderNo).join(",");
  const seenKey = seen.map((r) => r.orderNo).join(",");
  useEffect(() => {
    if (rowKey !== seenKey) setSeen(rows);
  }, [rowKey, seenKey, rows]);
  const [sheet, setSheet] = useState<{ kind: "approve" | "decline"; req: ApprovalRequestView } | null>(null);
  const [block, setBlock] = useState(false);
  const [saving, setSaving] = useState(false);
  const [declineError, setDeclineError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("wait");
  const tabRefs = useRef(new Map<TabKey, HTMLButtonElement>());

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
      router.refresh(); // 처리한 요청 탭과 머리글의 대기 수를 새로 읽는다
      return;
    }
    if (r.kind === "login") {
      router.push("/login");
      return;
    }
    setDeclineError(r.kind === "refused" ? r.message : "저장하지 못했어요. 잠시 뒤 다시 해 주세요.");
  };
  const cancelSigning = (req: ApprovalRequestView) => {
    setStates((prev) => ({ ...prev, [req.orderNo]: { kind: "pending" } }));
    setFocusTarget({ orderNo: req.orderNo, where: "approve" });
  };

  const waitingCount = rows.filter((r) => {
    const k = stateOf(r.orderNo).kind;
    return k === "pending" || k === "signing";
  }).length;

  // 탭 — 좌우 화살표·Home·End 로 옮기고, 고른 탭만 Tab 순서에 남긴다
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const i = TABS.indexOf(tab);
    let next: TabKey | null = null;
    if (e.key === "ArrowRight") next = TABS[(i + 1) % TABS.length] ?? null;
    else if (e.key === "ArrowLeft") next = TABS[(i - 1 + TABS.length) % TABS.length] ?? null;
    else if (e.key === "Home") next = TABS[0] ?? null;
    else if (e.key === "End") next = TABS[TABS.length - 1] ?? null;
    if (!next) return;
    e.preventDefault();
    setTab(next);
    tabRefs.current.get(next)?.focus();
  };
  const tabProps = (key: TabKey) => ({
    ref: (el: HTMLButtonElement | null) => {
      if (el) tabRefs.current.set(key, el);
      else tabRefs.current.delete(key);
    },
    className: a.tab,
    role: "tab",
    type: "button" as const,
    id: `t-${key}`,
    "aria-selected": tab === key,
    "aria-controls": `p-${key}`,
    tabIndex: tab === key ? 0 : -1,
    onClick: () => setTab(key),
    onKeyDown: onTabKey,
  });

  return (
    <>
      <div className={a["tabs-row"]} role="tablist" aria-label="요청 구분">
        <button {...tabProps("wait")}>
          승인 대기 <span>{waitingCount}</span>
        </button>
        <button {...tabProps("done")}>처리한 요청</button>
      </div>

      <div role="tabpanel" id="p-wait" aria-labelledby="t-wait" hidden={tab !== "wait"}>
        {rows.length === 0 ? (
          <p className={a.empty}>기다리는 승인 요청이 없어요.</p>
        ) : (
          <ul className={a.rows}>
            {rows.map((r, i) => {
              const st = stateOf(r.orderNo);
              const requested = `${formatDateTime(r.registeredAt)} 요청`;
              return (
                <li key={r.orderNo} className={a.req}>
                  <FaceAvatar index={i} />
                  <div className={a.main}>
                    <p className={a.who}>{r.fanNickname}님의 선물</p>
                    <p className={a.says}>
                      {r.itemKind} · 상자 {r.boxCount}개 · {r.orderNo}
                    </p>

                    {st.kind === "pending" ? (
                      <p className={a.meta}>
                        {r.receivedAt ? <span className="tag tag--brand">{formatDateTime(r.receivedAt)} 사무실 도착</span> : null}
                        {r.hasElectronicsOrMetal ? <span className="tag">전자기기·금속 있음</span> : null}
                        <span className="sub">{requested}</span>
                      </p>
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
                          <span className={a.sg}>
                            <HourglassGlyph />
                          </span>
                          <strong>카카오톡에서 서명을 기다리고 있어요</strong>
                        </p>
                        <p className={a.meta}>
                          <span className="sub">서명을 마치기 전에는 아무것도 바뀌지 않아요. · {requested}</span>
                        </p>
                      </>
                    ) : (
                      <p
                        ref={(el) => {
                          if (el) resultRefs.current.set(r.orderNo, el);
                          else resultRefs.current.delete(r.orderNo);
                        }}
                        tabIndex={-1}
                        className={a.result}
                      >
                        {st.kind === "blocked_elsewhere"
                          ? `${r.fanNickname}님을 차단해서 이 선물도 받지 않아요`
                          : st.blocked
                            ? `받지 않기로 했어요. ${r.fanNickname}님의 선물은 앞으로 등록되지 않아요`
                            : "받지 않기로 했어요"}
                      </p>
                    )}
                  </div>

                  {st.kind === "pending" ? (
                    <div className={a.act}>
                      <button
                        ref={(el) => {
                          if (el) approveRefs.current.set(r.orderNo, el);
                          else approveRefs.current.delete(r.orderNo);
                        }}
                        className="btn btn--kakao"
                        type="button"
                        onClick={() => setSheet({ kind: "approve", req: r })}
                      >
                        <KakaoBubble />
                        카카오톡으로 승인
                      </button>
                      <button
                        className="btn btn--soft"
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
                  ) : st.kind === "signing" ? (
                    <div className={a.act}>
                      <button className="btn btn--soft" type="button" onClick={() => cancelSigning(r)}>
                        서명 요청 취소
                      </button>
                    </div>
                  ) : (
                    <span className={`tag ${a["done-tag"]}`}>{st.kind === "declined" && !st.blocked ? "받지 않음" : "차단함"}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div role="tabpanel" id="p-done" aria-labelledby="t-done" hidden={tab !== "done"}>
        {decided.length === 0 ? (
          <p className={a.empty}>아직 처리한 요청이 없어요.</p>
        ) : (
          <ul className={a.rows}>
            {decided.map((d, i) => {
              const tag = DECIDED_TAG[d.outcome];
              return (
                <li key={d.orderNo} className={a.req}>
                  <FaceAvatar index={i} />
                  <div className={a.main}>
                    <p className={a.who}>{d.fanNickname}님의 선물</p>
                    <p className={a.says}>
                      {d.itemKind} · 상자 {d.boxCount}개 · {d.orderNo}
                    </p>
                    <p className={a.meta}>
                      <span className="sub">
                        <DecidedNote d={d} />
                      </span>
                    </p>
                  </div>
                  <span className={`tag ${tag.brand ? "tag--brand" : ""} ${a["done-tag"]}`}>{tag.text}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <BottomSheet open={sheet?.kind === "approve"} title="카카오톡으로 서명해 주세요" onClose={() => setSheet(null)}>
        {sheet?.kind === "approve" ? (
          <>
            <p className="sub">
              {sheet.req.fanNickname}님의 {sheet.req.itemKind}({sheet.req.orderNo}) 한 건을 승인합니다. 카카오톡 인증서로 서명해야
              승인이 끝나요.
            </p>
            <p className={`sub ${a.reason}`}>승인한 선물만 송장을 출력할 때 주소가 열리고, 그 기록은 열람 기록에서 볼 수 있어요.</p>
            <div className={a["sheet-btns"]}>
              <button className="btn btn--soft" type="button" onClick={() => setSheet(null)}>
                돌아가기
              </button>
              <button className="btn btn--kakao" type="button" onClick={() => decide(sheet.req, { kind: "signing" })}>
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
                <small>차단한 팬은 선물을 보낼 수 없어요. 승인 대기 중인 이 팬의 다른 선물도 함께 받지 않아요. 풀 때는 주소와 설정에서 해요.</small>
              </span>
            </label>
            <p className={`sub ${a.reason}`}>
              팬에게는 이유를 알리지 않아요. {sheet.req.fanNickname}님에게는 &ldquo;{NOT_ACCEPTED_TEXT}&rdquo;만 전해져요.
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
