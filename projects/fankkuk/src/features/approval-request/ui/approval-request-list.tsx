"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import type { DecidedOutcome, DecidedRequestView } from "@/entities/order/api/sample-decided-requests";
import type { ApprovalRequestView } from "@/entities/order/model/creator-view";
import { NOT_ACCEPTED_TEXT } from "@/entities/order/ui/fan-stage-copy";
import { formatDate, formatDateTime } from "@/shared/lib/format/datetime";
import { BottomSheet } from "@/shared/ui/bottom-sheet";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import { KakaoBubble } from "@/shared/ui/kakao-bubble";
import a from "./approval-request.module.css";

// 크리에이터 승인 요청 목록(시안 v4 creator-requests.html). 지금은 예시 — 서버에 아무것도 보내지 않는다.
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
  if (d.outcome === "expired") return <>{day} 자동 처리 · 7일 안에 정하지 않아 자동으로 받지 않음 처리됐어요.</>;
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
  const [states, setStates] = useState<Record<string, LocalState>>({});
  const [sheet, setSheet] = useState<{ kind: "approve" | "decline"; req: ApprovalRequestView } | null>(null);
  const [block, setBlock] = useState(false);
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
    setFocusTarget({ orderNo: req.orderNo, where: "result" });
    setSheet(null);
  };
  const cancelSigning = (req: ApprovalRequestView) => {
    setStates((prev) => ({ ...prev, [req.orderNo]: { kind: "pending" } }));
    setFocusTarget({ orderNo: req.orderNo, where: "approve" });
  };

  const waitingCount = requests.filter((r) => {
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
        {requests.length === 0 ? (
          <p className={a.empty}>기다리는 승인 요청이 없어요.</p>
        ) : (
          <ul className={a.rows}>
            {requests.map((r, i) => {
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
                        className={`btn ${a.kakao}`}
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
              <button className={`btn ${a.kakao}`} type="button" onClick={() => decide(sheet.req, { kind: "signing" })}>
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
                <small>차단한 팬은 선물을 보낼 수 없어요. 풀 때는 주소와 설정에서 카카오톡 서명을 해요.</small>
              </span>
            </label>
            <p className={`sub ${a.reason}`}>
              팬에게는 이유를 알리지 않아요. {sheet.req.fanNickname}님에게는 &ldquo;{NOT_ACCEPTED_TEXT}&rdquo;만 전해져요.
            </p>
            <div className={a["sheet-btns"]}>
              <button className="btn btn--soft" type="button" onClick={() => setSheet(null)}>
                돌아가기
              </button>
              <button className="btn" type="button" onClick={() => decide(sheet.req, { kind: "declined", blocked: block })}>
                받지 않기
              </button>
            </div>
          </>
        ) : null}
      </BottomSheet>
    </>
  );
}
