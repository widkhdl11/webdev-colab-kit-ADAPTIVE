import Link from "next/link";
import { printLabelOf, type AddressAccessEntry } from "@/entities/address/model/access-log";
import { approvalTimeLeftLabel } from "@/entities/order/model/approval-time-left";
import { creatorProgressOf } from "@/entities/order/model/creator-progress";
import type { ApprovalRequestView } from "@/entities/order/model/creator-view";
import type { FanGiftView } from "@/entities/order/model/fan-view";
import { incomingNoteOf, isIncomingInProgress, type IncomingGiftView } from "@/entities/order/model/incoming-gift";
import { FAN_STEP_LABEL, fanBadge } from "@/entities/order/ui/fan-stage-copy";
import { formatDate, formatDateTime } from "@/shared/lib/format/datetime";
import { FaceAvatar } from "@/shared/ui/face-avatar";
import s from "./creator-home.module.css";

// 크리에이터 메인 — 로그인하면 먼저 나오는 첫 화면. 시안: docs/design/mockups/site/v4/creator-home.html (카드 d17)
// 구역: 1 오늘 승인할 선물 / 2 진행 중인 선물 / 3 최근 열람 기록 + 4 공지(PC 두 칸) / 5 내가 보낸 선물.
// 전체 승인 버튼은 없다. 이 화면에는 서명 버튼도 두지 않는다 — 승인은 승인 요청 화면에서 한 건씩 서명한다.
// 「진행 중인 선물」은 받은 선물 읽기(my_incoming_gifts, office-workflow INV-W9)로 그린다 — 결제 완료부터 배송중까지.
// 그 읽기에는 물품 종류·실명·주소·송장번호가 없다. 승인 여부는 승인 요청 목록에 그 주문이 있는지로 가른다.
// 헤더·푸터는 라우트(app)가 붙인다.

export type CreatorHomeNotice = { id: string; title: string; date: string };

type Props = {
  nickname: string;
  /** 승인 대기 요청, 오래 기다린 것부터. */
  requests: readonly ApprovalRequestView[];
  /** 최근 열람 기록, 최근 순(최대 CREATOR_HOME_LOG_ROWS 줄). */
  accessLog: readonly AddressAccessEntry[];
  notices: readonly CreatorHomeNotice[];
  /** 나에게 온 선물의 진행 단계, 최신 등록 순(끝난 것 포함 — 진행 중인 것만 이 화면이 고른다). */
  incoming: readonly IncomingGiftView[];
  /** 내가(로그인한 사람이) 보낸 선물, 최신 순. */
  sentGifts: readonly FanGiftView[];
  /** 승인 대기의 남은 기간을 세는 기준 시각 — 화면을 그리는 서버가 넘긴다 */
  now: string;
};

const MAX_ROWS = 3;

/** 「최근 열람 기록」에 보이는 줄 수 — 라우트가 이만큼만 읽는다. */
export const CREATOR_HOME_LOG_ROWS = MAX_ROWS;

/** "2026-09-28" → "09.28" */
const shortDate = (date: string) => date.slice(5).replace("-", ".");

function CheckGlyph({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WaitGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M5 2h14v5a6 6 0 0 1-2.4 4.8L14.5 12l2.1.2A6 6 0 0 1 19 17v5H5v-5a6 6 0 0 1 2.4-4.8L9.5 12l-2.1-.2A6 6 0 0 1 5 7V2Z"
      />
    </svg>
  );
}

const STEP_CLASS = { done: s["is-done"], current: s["is-now"], todo: undefined } as const;

function ProgressTrack({ gift, approvalWaiting }: { gift: IncomingGiftView; approvalWaiting: boolean }) {
  const p = creatorProgressOf(gift, approvalWaiting);
  const now = p.steps.find((st) => st.state === "current");
  const where = now ? `${FAN_STEP_LABEL[now.key]} 기다리는 중` : `${FAN_STEP_LABEL[p.steps[p.doneCount - 1]?.key ?? "registered"]}까지 끝남`;
  const approval = p.approval === "waiting" ? "승인 대기" : "승인 완료";
  return (
    <div
      className={s.track}
      role="progressbar"
      aria-label={`${gift.senderNickname}님의 선물 진행 단계`}
      aria-valuemin={0}
      aria-valuemax={p.steps.length}
      aria-valuenow={p.doneCount}
      aria-valuetext={`${p.steps.length}단계 중 ${p.doneCount}단계 완료, ${where}. ${approval}`}
    >
      <ul aria-hidden="true">
        {p.steps.map((st) => (
          <li key={st.key} className={STEP_CLASS[st.state]}>
            <span className={s.dot}>{st.state === "done" ? <CheckGlyph size={14} /> : null}</span>
            {FAN_STEP_LABEL[st.key]}
          </li>
        ))}
      </ul>
      <div className={`${s.fork} ${p.approval === "done" ? s["is-done"] : ""}`} aria-hidden="true">
        <span className={s["fork-chip"]}>
          {p.approval === "done" ? <CheckGlyph size={16} /> : <WaitGlyph />}
          {approval}
        </span>
      </div>
    </div>
  );
}

function logNote(e: AddressAccessEntry): string {
  if (e.result.kind === "denied") return "열리지 않았어요";
  return printLabelOf(e.result.printNo, e.result.released).text;
}

export function CreatorHomePage({ nickname, requests, accessLog, notices, incoming, sentGifts, now }: Props) {
  const waiting = requests.length;
  const waitingOrders = new Set(requests.map((r) => r.orderNo));
  const ongoing = incoming.filter(isIncomingInProgress);
  return (
    <main id="main">
      <section className={s.greet} aria-labelledby="hello-title">
        <div className="container">
          <h1 id="hello-title">
            {waiting > 0 ? (
              <>
                {nickname}님, 오늘 승인할
                <br />
                선물이 {waiting}개 있어요.
              </>
            ) : (
              <>
                {nickname}님, 오늘 승인할
                <br />
                선물은 없어요.
              </>
            )}
          </h1>
          <p className="lead">{waiting > 0 ? `승인을 기다리는 선물은 ${waiting}개예요.` : "새 승인 요청이 오면 여기에 먼저 보여 드려요."}</p>
        </div>
      </section>

      {/* 1 오늘 승인할 선물 */}
      <section className="block" aria-labelledby="todo-title">
        <div className="container">
          <div className={s.todo}>
            <div className={`block-head ${s["todo-head"]}`}>
              <h2 id="todo-title" className={s["todo-h"]}>
                오늘 승인할 선물 <span className="tag tag--brand">대기 {waiting}건</span>
              </h2>
            </div>
            <div className={s["rule-line"]}>
              <img className={`asset ${s.ico}`} src="/img/icon-approve.png" alt="" aria-hidden="true" width={56} height={56} />
              <p>
                <strong>승인은 한 건씩, 카카오톡 인증서로 서명해요.</strong>
              </p>
            </div>
            {waiting === 0 ? (
              <p className={s["todo-empty"]}>기다리는 승인 요청이 없어요.</p>
            ) : (
              <ul className={s["todo-rows"]} aria-label="승인 대기 선물, 남은 기간이 짧은 순서">
                {requests.slice(0, MAX_ROWS).map((r, i) => (
                  <li key={r.orderNo} className={s["todo-row"]}>
                    <FaceAvatar index={i} />
                    <div>
                      <p className={s.who}>{r.fanNickname}님의 선물</p>
                      <p className={s.says}>
                        {r.itemKind} · 상자 {r.boxCount}개 · {r.orderNo}
                      </p>
                      <p className={s.meta}>
                        <span className="tag tag--brand">{approvalTimeLeftLabel(r.registeredAt, now)}</span>
                        {r.receivedAt ? <span className="tag">{formatDateTime(r.receivedAt)} 사무실 도착</span> : null}
                        <span className="sub">{formatDateTime(r.registeredAt)} 요청</span>
                      </p>
                    </div>
                    <Link className={`link-arrow ${s.go}`} href="/creator/requests" aria-label={`${r.fanNickname}님의 선물 승인하러 가기`}>
                      승인하러 가기 ›
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className={s["todo-foot"]}>
              <p>{waiting > MAX_ROWS ? `나머지 ${waiting - MAX_ROWS}건은 승인 요청 화면에 있어요.` : "받지 않기도 승인 요청 화면에서 정해요."}</p>
              <Link className="btn" href="/creator/requests">
                승인 요청 전체 보기
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* 2 진행 중인 선물 — 6단계 + 검수·출고 사이 승인 갈래 */}
      <section className="block" aria-labelledby="prog-title">
        <div className="container">
          <div className="block-head">
            <h2 id="prog-title">진행 중인 선물</h2>
            {/* 시안은 선물 상세(gift.html)로 잇지만, 선물 상세(/gifts/[orderNo])는 보낸 사람 전용이라 받는 크리에이터가 열 수 있는
                상세가 아직 없다. 받은 선물을 한 건씩 보는 가장 가까운 화면인 승인 요청(대기·결정한 요청)으로 잇는다 — BACKLOG */}
            <Link className="link-arrow" href="/creator/requests" aria-label="받은 선물 전체 보기 — 승인 요청 화면">
              전체 보기
            </Link>
          </div>
          <p className={s["track-note"]}>승인은 출고 전에만 마치면 돼요. 입고나 검수 중에 먼저 해도 괜찮아요.</p>
          {ongoing.length === 0 ? (
            <p className={s.empty}>지금 진행 중인 선물이 없어요.</p>
          ) : (
            <ul className={s.rows}>
              {ongoing.slice(0, MAX_ROWS).map((g, i) => (
                <li key={g.orderNo} className={s["prog-row"]}>
                  <FaceAvatar index={i} />
                  <div>
                    <p className={s.who}>{g.senderNickname}님의 선물</p>
                    <p className={s.says}>
                      상자 {g.boxCount}개 · {g.orderNo} · {incomingNoteOf(g)}
                    </p>
                  </div>
                  <ProgressTrack gift={g} approvalWaiting={waitingOrders.has(g.orderNo)} />
                </li>
              ))}
            </ul>
          )}
          {ongoing.length > MAX_ROWS ? <p className={s["track-note"]}>진행 중인 선물 {ongoing.length}개 중 최근 {MAX_ROWS}개예요.</p> : null}
        </div>
      </section>

      {/* 3 최근 열람 기록 + 4 공지 */}
      <div className="container">
        <div className={s["two-col"]}>
          <section className="block" aria-labelledby="log-title">
            <div className="block-head">
              <h2 id="log-title">최근 열람 기록</h2>
              <Link className="link-arrow" href="/creator/log">
                전체 보기
              </Link>
            </div>
            <p className="sub">승인 없이는 저희 시스템이 주소를 열지 않아요. 열린 기록은 전부 보여 드려요.</p>
            {accessLog.length === 0 ? (
              <p className={s.empty}>아직 주소가 열린 적이 없어요. 송장을 출력할 때마다 여기에 남아요.</p>
            ) : (
              <ul className={s["log-rows"]} aria-label="최근 주소 열람 기록">
                {accessLog.slice(0, MAX_ROWS).map((e, i) => (
                  <li key={`${i}-${e.at}-${e.orderNo}`} className={s.lrow}>
                    <div className={s.top}>
                      <strong>{formatDateTime(e.at)}</strong>
                      {e.result.kind === "opened" ? <span className="tag tag--brand">열림</span> : <span className="tag">거부</span>}
                    </div>
                    <p className="sub">
                      {e.orderNo} · {e.requester === "owner" ? "대표 계정" : "대표가 아닌 계정"} · {logNote(e)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="block" aria-labelledby="notice-title">
            <div className="block-head">
              <h2 id="notice-title">공지사항</h2>
              <Link className="link-arrow" href="/notices">
                전체 보기
              </Link>
            </div>
            <p className="sub">서비스가 바뀌거나 점검이 있을 때 알려 드려요.</p>
            {notices.length === 0 ? (
              <p className={s.empty}>아직 공지가 없어요.</p>
            ) : (
              <ul className={s["notice-list"]}>
                {notices.map((n) => (
                  <li key={n.id}>
                    <Link href="/notices">
                      <span className={s.t}>{n.title}</span>
                      <span className={s.d}>{shortDate(n.date)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>

      {/* 5 내가 보낸 선물 */}
      <section className="block" aria-labelledby="sent-title">
        <div className="container">
          <div className="block-head">
            <h2 id="sent-title">내가 보낸 선물</h2>
            <Link className={`btn btn--sm ${s["head-btn"]}`} href="/gifts/new">
              선물 보내기
            </Link>
          </div>
          <p className={`sub ${s["sent-sub"]}`}>다른 크리에이터에게 보낸 선물이에요.</p>
          {sentGifts.length === 0 ? (
            <div className={s["empty-box"]}>
              <span className={s["ico-tile"]} aria-hidden="true">
                <img className="asset" src="/img/icon-gift.png" alt="" aria-hidden="true" width={64} height={64} />
              </span>
              <h3>아직 보낸 선물이 없어요</h3>
              <p className="sub">좋아하는 다른 크리에이터에게 선물을 보내 보세요. 내 주소는 열리지 않아요.</p>
              <Link className="btn" href="/gifts/new">
                선물 보내기
              </Link>
            </div>
          ) : (
            <ul className={s.rows}>
              {sentGifts.slice(0, MAX_ROWS).map((g, i) => {
                const badge = fanBadge(g);
                return (
                  <li key={g.orderNo} className={s["sent-row"]}>
                    <FaceAvatar index={i + 2} />
                    <div>
                      <p className={s.who}>{g.creatorName}님께</p>
                      <p className={s.says}>
                        {g.itemKind} · 상자 {g.boxCount}개 · {formatDate(g.registeredAt)} 보냄
                      </p>
                    </div>
                    <span className={`tag ${badge.tone === "brand" ? "tag--brand" : ""}`}>{badge.text}</span>
                    <Link className="link-arrow" href={`/gifts/${encodeURIComponent(g.orderNo)}`} aria-label={`${g.creatorName}님께 보낸 선물 상세 보기`}>
                      상세 보기 ›
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          {sentGifts.length > MAX_ROWS ? (
            <p className={s["more-row"]}>
              <Link className="btn btn--soft" href="/gifts">
                보낸 선물 더 보기
              </Link>
            </p>
          ) : null}
        </div>
      </section>
      <div className="page-end" />
    </main>
  );
}
