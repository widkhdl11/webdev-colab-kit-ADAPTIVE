import { CARRIER_LABEL } from "@/entities/parcel/model/carrier";
import { HOLD_REASON_LABEL } from "@/entities/parcel/model/office-labels";
import { canReturnHeld, daysLeft, isUnmatchedUrgent, ratePercent, type FindFlag, type InboundMetrics, type UnmatchedParcel } from "@/entities/parcel/model/office-lists";
import { ReturnHeldButton } from "@/features/admin-held-return/ui/return-held-button";
import { formatMonthDay, formatStamp } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";
import u from "./unmatched.module.css";

// 관리자 「미확인 입고」 = 운영자 확인 목록 (office-workflow INV-W5·W6·W7, inbound-address-code INV-C5·C8·C9·C10, 시안 admin/unmatched.html).
// 보이는 칸은 도착 시각·원 송장 바코드·택배사·보류 사유·발신인 앞 한 글자(+ 선반·봉투 번호)뿐이다. 주문번호·닉네임·6자리는 DB 가 주지 않는다.
// 상자를 주문에 붙이는 칸은 없다 — 주인이 「받는 주소 없이 보냈어요」로만 잇는다(INV-C4 ②). 여기서 할 수 있는 일은 「반송으로 넘기기」뿐이다.
// 남은 날은 도착 + 168시간 기한까지(INV-W6·C6). now 는 서버가 그린 시각.
// 위의 숫자 셋은 최근 30일 측정값(스펙 「측정」 절), 아래는 찾기 실패가 반복된 계정(INV-C10).

const TOTAL_DAYS = 7;

const STATE_TAG: Record<UnmatchedParcel["state"], { text: string; className: string }> = {
  waiting: { text: "주인 찾기 대기", className: a.tag },
  matched: { text: "주인과 이어짐", className: `${a.tag} ${a.tagBrand}` },
  expired: { text: "반송 대상", className: `${a.tag} ${a.tagInk}` },
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
          <span className={u.statLabel}>확인 문자가 틀려 거부된 입력</span>
          <span className={u.statValue}>{percentText(m.codeCheckRejects, m.codeInputs)}</span>
          <span className={u.statSub}>
            6자리 입력 {m.codeInputs}번 중 {m.codeCheckRejects}번 (쓰지 않는 글자로 거부 {m.codeFormatRejects}번)
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
          <h1>미확인 입고</h1>
          <p>받는 주소 6자리로 이어지지 않아 보류된 상자와, 분쟁·「제가 보낸 게 아니에요」로 출고를 멈춘 상자예요. 출고 목록에는 나오지 않아요.</p>
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
                  <th scope="col">원 송장 바코드</th>
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
                        <td>{r.senderInitial ? `${r.senderInitial}*` : "—"}</td>
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
                        <td className={a.act}>{canReturnHeld(r, now) ? <ReturnHeldButton source={r.source} id={r.id} waybillNo={r.waybillNo} /> : null}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
          <p className={a.hint}>
            주인이 「받는 주소 없이 보냈어요」에 송장번호·택배사·보낸 사람 이름 첫 글자를 넣어 셋이 다 맞으면 저절로 입고돼요. 이 화면에서 주문을 붙이는 칸은 없어요. 보낸 사람은 앞 한 글자만, 사진·주소는 남기지 않아요. 7일 안에 이어지지 않으면 원 송장 주소로 착불 반송해요.
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
