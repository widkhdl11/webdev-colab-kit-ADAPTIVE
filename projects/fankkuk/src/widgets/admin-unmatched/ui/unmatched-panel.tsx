import { CARRIER_LABEL } from "@/entities/parcel/model/carrier";
import { HOLD_REASON_LABEL } from "@/entities/parcel/model/office-labels";
import { canLinkHeld, canReturnHeld, daysLeft, isUnmatchedUrgent, ratePercent, type FindFlag, type InboundMetrics, type UnmatchedParcel } from "@/entities/parcel/model/office-lists";
import { LinkHeldButton } from "@/features/admin-held-link/ui/link-held-button";
import { ReturnHeldButton } from "@/features/admin-held-return/ui/return-held-button";
import { MoveShareButton } from "@/features/admin-share-move/ui/move-share-button";
import { formatMonthDay, formatStamp } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";
import u from "./unmatched.module.css";

// 관리자 「미확인 입고」 = 운영자 확인 목록 (office-workflow INV-W5·W6·W7, inbound-address-code INV-C5·C8·C9·C10, 시안 admin/unmatched.html).
// 보이는 칸은 도착 시각·원 송장 바코드·택배사·보류 사유·닉네임 일치 여부(일치면 그 닉네임, + 선반·봉투 번호)뿐이다. 주문번호·6자리·이름 글자는 DB 가 주지 않는다.
// 주인이 「받는 주소 없이 보냈어요」로 잇는 것이 먼저다(INV-C4 ②). 여기서 할 수 있는 일은 「반송으로 넘기기」와, 6자리 없이 온 상자의 주인이
// 문의했을 때 송장번호·내용물을 확인하고 그 팬의 도착 전 상자로 입고하는 「주인 주문으로 입고」(INV-C12, 카드 d94) 둘이다 — 주문번호를 적는 칸은 없다.
// 남은 날은 도착 + 168시간 기한까지(INV-W6·C6). now 는 서버가 그린 시각.
// 위의 숫자 셋은 최근 30일 측정값(스펙 「측정」 절), 아래는 찾기 실패가 반복된 계정(INV-C10).

const TOTAL_DAYS = 7;

const STATE_TAG: Record<UnmatchedParcel["state"], { text: string; className: string }> = {
  waiting: { text: "주인 찾기 대기", className: a.tag },
  matched: { text: "입고 완료", className: `${a.tag} ${a.tagBrand}` },
  expired: { text: "반송 대기", className: `${a.tag} ${a.tagInk}` },
  on_hold: { text: "출고 멈춤", className: `${a.tag} ${a.tagWarn}` },
};

type Props = { rows: readonly UnmatchedParcel[]; flags: readonly FindFlag[]; metrics: InboundMetrics | null; now: string };

function percentText(part: number, whole: number): string {
  const rate = ratePercent(part, whole);
  return rate === null ? "아직 없음" : `${rate}%`;
}

function Metrics({ m }: { m: InboundMetrics }) {
  return (
    <section aria-labelledby="held-metrics">
      <div className={a.sectionH}>
        <h2 id="held-metrics">최근 30일</h2>
        <span>{formatMonthDay(m.since)}부터</span>
      </div>
      <div className={u.stats}>
        <div className={u.stat}>
          <span className={u.statLabel}>6자리 없이 들어온 상자</span>
          <span className={u.statValue}>{percentText(m.arrivedWithoutCode, m.arrivedTotal)}</span>
          <span className={u.statSub}>
            들어온 {m.arrivedTotal}상자 중 {m.arrivedWithoutCode}상자
          </span>
        </div>
        <div className={u.stat}>
          <span className={u.statLabel}>확인 문자가 틀려 받지 않은 입력</span>
          <span className={u.statValue}>{percentText(m.codeCheckRejects, m.codeInputs)}</span>
          <span className={u.statSub}>
            6자리 입력 {m.codeInputs}번 중 {m.codeCheckRejects}번 (쓰지 않는 글자라 받지 않음 {m.codeFormatRejects}번)
          </span>
        </div>
        <div className={u.stat}>
          <span className={u.statLabel}>「제가 보낸 게 아니에요」</span>
          <span className={u.statValue}>{m.notMineReports}건</span>
          <span className={u.statSub}>주인이 알려 출고를 멈춘 상자</span>
        </div>
      </div>
    </section>
  );
}

export function UnmatchedPanel({ rows, flags, metrics, now }: Props) {
  const at = new Date(now);
  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1>보류 상자</h1>
          <p>받는 주소 6자리로 입고되지 않아 보류된 상자와, 분쟁·「제가 보낸 게 아니에요」로 출고를 멈춘 상자예요. 출고 목록에는 나오지 않아요.</p>
        </div>
      </div>
      <div className={a.stack}>
        {metrics ? <Metrics m={metrics} /> : null}

        <section aria-labelledby="held-list">
          <div className={a.sectionH}>
            <h2 id="held-list">보류 상자</h2>
            <span>{rows.length}건</span>
          </div>
          <div className={a.tblWrap}>
            <table className={a.tbl} style={{ minWidth: 960 }}>
              <caption className="sr-only">보류 상자 목록</caption>
              <thead>
                <tr>
                  <th scope="col">들어온 날</th>
                  <th scope="col">원래 송장 바코드</th>
                  <th scope="col">택배사</th>
                  <th scope="col">보류 사유</th>
                  <th scope="col">보낸 사람</th>
                  <th scope="col">선반·봉투</th>
                  <th scope="col">남은 날 (7일)</th>
                  <th scope="col">상태</th>
                  <th scope="col" className={a.act}>
                    처리
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className={a.empty}>
                      보류 상자가 없어요.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const left = r.deadlineAt ? daysLeft(r.deadlineAt, at) : null;
                    const urgent = left !== null && isUnmatchedUrgent(left);
                    const tag = STATE_TAG[r.state];
                    return (
                      <tr key={`${r.source}-${r.id}`}>
                        <td className={`${a.mono} ${a.nowrap}`}>{r.arrivedAt ? formatMonthDay(r.arrivedAt) : "—"}</td>
                        <td className={a.mono}>
                          <strong>{r.waybillNo ?? "—"}</strong>
                        </td>
                        <td className={a.nowrap}>{r.carrier ? CARRIER_LABEL[r.carrier] : "—"}</td>
                        <td>
                          {HOLD_REASON_LABEL[r.reason]}
                          {r.suspectedTheft ? <span className={`${a.tag} ${a.tagInk}`}> 도용 의심</span> : null}
                        </td>
                        <td>{r.nickname ? <span className={`${a.tag} ${a.tagBrand}`}>닉네임 일치 · {r.nickname}</span> : r.source === "unmatched" ? <span className={a.faint}>닉네임 없음</span> : "—"}</td>
                        <td className={a.mono}>{r.shelf ?? (r.qr ? `봉투 ${r.qr}` : "—")}</td>
                        <td>
                          {/* 미확인 입고는 7일 반송까지, 주문에 묶인 보류 상자는 보류 + 168시간(분쟁은 그때부터 넘길 수 있고, 아무도 안 넘기면 자동) */}
                          {(r.state === "waiting" || r.state === "on_hold") && left !== null ? (
                            <div className={a.barRow}>
                              <span className={urgent ? `${a.bar} ${a.barHot}` : a.bar} role="progressbar" aria-label="남은 날" aria-valuemin={0} aria-valuemax={TOTAL_DAYS} aria-valuenow={left}>
                                <i style={{ width: `${(Math.min(left, TOTAL_DAYS) / TOTAL_DAYS) * 100}%` }} />
                              </span>
                              <span className={a.nowrap}>{left === 0 ? "기한 지남" : `${left}일 남음`}</span>
                              {urgent && <span className={`${a.tag} ${a.tagWarn}`}>곧 처리</span>}
                            </div>
                          ) : (
                            <span className={a.faint}>—</span>
                          )}
                        </td>
                        <td>
                          <span className={tag.className}>{tag.text}</span>
                        </td>
                        <td className={a.act}>
                          {canLinkHeld(r, now) ? <LinkHeldButton id={r.id} waybillNo={r.waybillNo} /> : null}
                          {canReturnHeld(r, now) ? <ReturnHeldButton source={r.source} id={r.id} waybillNo={r.waybillNo} /> : null}
                          {/* 찾기(②-나)로 이은 6자리 없는 역조공 상자·검수 전 줄에만 — 크리에이터가 잘못 골랐다는 문의가 오면 같은 크리에이터의 다른 팬별 선물로(INV-C11). 판정은 DB(share_movable) */}
                          {r.shareMovable ? <MoveShareButton id={r.id} waybillNo={r.waybillNo} /> : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className={a.hint}>
            보낸 사람 이름·사진·주소는 남기지 않아요. 7일 안에 입고되지 않으면 원래 송장 주소로 착불 반송해요. 출고가 멈춘 상자는 보류된 때부터 7일 뒤 주문에서 떼어 반송해요 — 「제가 보낸 게 아니에요」·떼어 낸 상자는 바로 넘길 수 있어요.
          </p>
        </section>

        <section aria-labelledby="held-flags">
          <div className={a.sectionH}>
            <h2 id="held-flags">찾기 실패가 반복된 계정</h2>
            <span>24시간 안에 3번 넘게 못 찾은 계정</span>
          </div>
          <div className={a.tblWrap}>
            <table className={a.tbl}>
              <caption className="sr-only">찾기 실패가 반복된 계정</caption>
              <thead>
                <tr>
                  <th scope="col">닉네임</th>
                  <th scope="col" className={a.num}>
                    24시간 실패
                  </th>
                  <th scope="col">마지막 표시</th>
                </tr>
              </thead>
              <tbody>
                {flags.length === 0 ? (
                  <tr>
                    <td colSpan={3} className={a.empty}>
                      표시된 계정이 없어요.
                    </td>
                  </tr>
                ) : (
                  flags.map((f) => (
                    <tr key={`${f.nickname}-${f.lastFlaggedAt}`}>
                      <td>{f.nickname}</td>
                      <td className={a.num}>{f.failures24h}번</td>
                      <td className={a.mono}>{formatStamp(f.lastFlaggedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
