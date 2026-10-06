import { dueUrgency, remainingText, type ExpiryCategory, type ExpiryDue } from "@/entities/parcel/model/office-lists";
import { errorCodeLabel, kindLabel, type NotificationFailure } from "@/entities/notification/api/read-notification-failures";
import { SendNotificationsButton } from "@/features/notification-dispatch/ui/send-notifications-button";
import { RunExpiryButton } from "@/features/office-expiry-run/ui/run-expiry-button";
import { formatStamp } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";

// 관리자 「자동 처리 현황」 (office-workflow INV-W6, 시안 admin/automation.html).
// 다섯 묶음: 알림 지금 보내기(notifications INV-N5) · 보내지 못한 알림(INV-N10) · 7일 미승인 팬 선물 반려 · 역조공 받기 기한 · 차액 미납 반송. 줄마다 「지금 돌리기」(그 주문만, 확인 창).
// 기한은 서버 시각 기준 168시간(INV-W6). now 는 서버가 그린 시각.

const SECTIONS: readonly { category: ExpiryCategory; title: string; hint: string; sender: string; receiver: string; after: string }[] = [
  {
    category: "gift",
    title: "7일 미승인 자동 반려 예정",
    hint: "크리에이터가 7일 안에 승인하지 않은 선물이에요. 반려되면 보낸 팬에게 환불 대상이 돼요.",
    sender: "보낸 사람",
    receiver: "받는 크리에이터",
    after: "반려",
  },
  {
    category: "revgift",
    title: "역조공 받기 기한",
    hint: "팬이 기한 안에 받지도 거절하지도 않은 몫이에요. 기한이 지나면 받지 않은 것으로 처리돼요.",
    sender: "크리에이터",
    receiver: "팬",
    after: "반송 대상",
  },
  {
    category: "difference",
    title: "차액 미납 반송 예정",
    hint: "상자가 더 큰 구간으로 바뀌어 차액을 내야 하는데 기한 안에 내지 않은 주문이에요.",
    sender: "보낸 사람",
    receiver: "받는 크리에이터",
    after: "반송 예정",
  },
];

type Props = { rows: readonly ExpiryDue[]; failures: readonly NotificationFailure[]; now: string };

export function AutomationPanel({ rows, failures, now }: Props) {
  const at = new Date(now);
  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1 id="automation-title" tabIndex={-1}>
            자동 처리 현황
          </h1>
          <p>정해진 때에 자동으로 도는 일이에요. 기다리지 않고 한 줄만 먼저 돌릴 수도 있어요.</p>
        </div>
      </div>

      <div className={a.stack}>
        <section aria-labelledby="auto-notifications">
          <div className={a.sectionH}>
            <h2 id="auto-notifications">알림 보내기</h2>
          </div>
          <p className={a.hint} style={{ margin: "-4px 0 8px" }}>
            선물 단계가 바뀔 때 쌓인 알림을 보내요. 72시간 지난 승인 요청 재알림도 이때 만들어져요.
          </p>
          <SendNotificationsButton />
        </section>
        {/* 보내지 못한 알림 (notifications INV-N10) — 받는 사람·연락처·본문 없이 종류·주문번호·시도 횟수·이유만 */}
        <section aria-labelledby="auto-notification-failures">
          <div className={a.sectionH}>
            <h2 id="auto-notification-failures">보내지 못한 알림</h2>
            <span>{failures.length}건</span>
          </div>
          <div className={a.tblWrap}>
            <table className={a.tbl} style={{ minWidth: 760 }}>
              <caption className="sr-only">보내지 못한 알림</caption>
              <thead>
                <tr>
                  <th scope="col">주문번호</th>
                  <th scope="col">알림</th>
                  <th scope="col">통로</th>
                  <th scope="col">결과</th>
                  <th scope="col">시도</th>
                  <th scope="col">이유</th>
                  <th scope="col">시각</th>
                </tr>
              </thead>
              <tbody>
                {failures.length === 0 ? (
                  <tr>
                    <td colSpan={7} className={a.empty}>
                      보내지 못한 알림이 없어요.
                    </td>
                  </tr>
                ) : (
                  failures.map((f) => (
                    <tr key={`${f.orderNo}-${f.kind}-${f.round}-${f.channel}-${f.finishedAt}`}>
                      <td className={`${a.mono} ${a.nowrap}`}>
                        <strong>{f.orderNo}</strong>
                      </td>
                      <td>{kindLabel(f.kind, f.round)}</td>
                      <td>{f.channel === "kakao" ? "카카오" : "이메일"}</td>
                      <td>{f.status === "failed" ? <span className={`${a.tag} ${a.tagInk}`}>실패</span> : <span className={a.tag}>건너뜀</span>}</td>
                      <td>{f.attempts}번</td>
                      <td>{errorCodeLabel(f.errorCode)}</td>
                      <td className={`${a.mono} ${a.nowrap}`}>{formatStamp(f.finishedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
        {SECTIONS.map((s) => {
          const list = rows.filter((r) => r.category === s.category);
          const headId = `auto-${s.category}`;
          return (
            <section key={s.category} aria-labelledby={headId}>
              <div className={a.sectionH}>
                <h2 id={headId}>{s.title}</h2>
                <span>{list.length}건</span>
              </div>
              <p className={a.hint} style={{ margin: "-4px 0 8px" }}>
                {s.hint}
              </p>
              <div className={a.tblWrap}>
                <table className={a.tbl} style={{ minWidth: 760 }}>
                  <caption className="sr-only">{s.title}</caption>
                  <thead>
                    <tr>
                      <th scope="col">주문번호</th>
                      <th scope="col">{s.sender}</th>
                      <th scope="col">{s.receiver}</th>
                      {s.category === "difference" && <th scope="col">신고→실측 · 미납 차액</th>}
                      <th scope="col">기한</th>
                      <th scope="col">남은 시간</th>
                      <th scope="col">처리 후</th>
                      <th scope="col">
                        <span className="sr-only">처리</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.length === 0 ? (
                      <tr>
                        <td colSpan={s.category === "difference" ? 8 : 7} className={a.empty}>
                          처리할 줄이 없어요.
                        </td>
                      </tr>
                    ) : (
                      list.map((r) => {
                        const left = remainingText(r.dueAt, at);
                        const urgency = dueUrgency(r.dueAt, at);
                        return (
                          <tr key={`${r.category}-${r.orderNo}-${r.dueAt}`}>
                            <td className={`${a.mono} ${a.nowrap}`}>
                              <strong>{r.orderNo}</strong>
                            </td>
                            <td>{r.senderNickname}</td>
                            <td>{r.receiverName}</td>
                            {s.category === "difference" && <td>{r.detail ?? "—"}</td>}
                            <td className={`${a.mono} ${a.nowrap}`}>{formatStamp(r.dueAt)}</td>
                            <td>{urgency === "past" ? <span className={`${a.tag} ${a.tagInk}`}>{left}</span> : urgency === "soon" ? <span className={`${a.tag} ${a.tagWarn}`}>{left}</span> : left}</td>
                            <td>{s.after}</td>
                            <td className={a.act}>
                              <RunExpiryButton orderNo={r.orderNo} returnFocusId="automation-title" />
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
        })}
      </div>
    </>
  );
}
