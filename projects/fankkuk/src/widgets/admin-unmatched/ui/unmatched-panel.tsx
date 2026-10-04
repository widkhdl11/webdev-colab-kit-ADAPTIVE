import { daysLeft, isUnmatchedUrgent, type UnmatchedParcel } from "@/entities/parcel/model/office-lists";
import { formatMonthDay } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";

// 관리자 「미확인 입고」 (office-workflow INV-W5·W6·W7, 시안 admin/unmatched.html).
// 보낸 사람은 앞 한 글자 + * 만. 주문을 붙이는 칸은 없다 — 팬이 「내 물건 찾기」로만 잇는다(INV-W5).
// 남은 날은 도착 + 168시간 기한까지(INV-W6). now 는 서버가 그린 시각.

const TOTAL_DAYS = 7;

const STATE_TAG: Record<UnmatchedParcel["state"], { text: string; className: string }> = {
  waiting: { text: "팬 찾기 대기", className: a.tag },
  matched: { text: "팬 매칭됨", className: `${a.tag} ${a.tagBrand}` },
  expired: { text: "기한 지남", className: `${a.tag} ${a.tagInk}` },
};

type Props = { rows: readonly UnmatchedParcel[]; now: string };

export function UnmatchedPanel({ rows, now }: Props) {
  const at = new Date(now);
  return (
    <>
      <div className={a.pageHead}>
        <div>
          <h1>미확인 입고</h1>
          <p>들어왔는데 주문을 못 찾은 상자예요. 들어온 지 7일이 지나면 처리 대상이 돼요.</p>
        </div>
      </div>
      <div className={a.stack}>
        <div className={a.tblWrap}>
          <table className={a.tbl} style={{ minWidth: 720 }}>
            <caption className="sr-only">미확인 입고 목록</caption>
            <thead>
              <tr>
                <th scope="col">송장번호</th>
                <th scope="col">들어온 날</th>
                <th scope="col">보낸 사람</th>
                <th scope="col">보관 선반</th>
                <th scope="col">남은 날 (7일)</th>
                <th scope="col">팬 매칭</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className={a.empty}>
                    미확인 입고가 없어요.
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const left = daysLeft(r.deadlineAt, at);
                  const urgent = isUnmatchedUrgent(left);
                  const tag = STATE_TAG[r.state];
                  return (
                    <tr key={r.id}>
                      <td className={a.mono}>
                        <strong>{r.waybillNo}</strong>
                      </td>
                      <td className={`${a.mono} ${a.nowrap}`}>{formatMonthDay(r.arrivedAt)}</td>
                      <td>{r.senderInitial}*</td>
                      <td className={a.mono}>{r.shelf}</td>
                      <td>
                        {r.state === "waiting" ? (
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
                        {r.matchedOrderNo && <span className={`${a.sub} ${a.mono}`}> · {r.matchedOrderNo}</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <p className={a.hint}>
          팬이 「내 물건 찾기」에 원 송장번호를 넣으면 그 팬의 주문과 이어지고 저절로 입고돼요. 이 화면에서 주문을 붙이는 칸은 없어요. 보낸 사람은 앞 한 글자만, 사진·주소는 남기지 않아요. 7일 안에 이어지지 않으면 원 송장 주소로 착불 반송해요.
        </p>
      </div>
    </>
  );
}
