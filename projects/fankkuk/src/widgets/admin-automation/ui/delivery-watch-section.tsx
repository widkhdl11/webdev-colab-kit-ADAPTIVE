import type { DeliveryWatchRow } from "@/features/delivery-tracking/api/read-delivery-watch";
import { TraceButton } from "@/features/delivery-tracking/ui/trace-button";
import { formatStamp } from "@/shared/lib/format/datetime";
import a from "@/shared/ui/admin.module.css";

// 운영자 「배송 조회」 칸 (delivery-status INV-DS14, 결정 ⑨). 아직 배달 완료가 아닌 송장 중
// 웹훅이 24시간 넘게 오지 않은 것(경고)과 아직 구독하지 못한 것을 보여 준다. 줄마다·한꺼번에 수동 조회.
// 송장번호는 끝 네 자리만, 이력·위치·사람 칸은 없다(INV-DS10). 살펴볼 것이 없으면 한 줄만.

const KIND_LABEL: Record<DeliveryWatchRow["kind"], string> = { gift: "팬 선물", revgift: "역조공", gift_box: "선물함" };
const CARRIER_LABEL: Record<NonNullable<DeliveryWatchRow["carrierState"]>, string> = { picked_up: "집하", in_transit: "배송 중", delivered: "배달 완료" };
const TRACE_LIMIT = 50;

export function DeliveryWatchSection({ rows }: { rows: readonly DeliveryWatchRow[] }) {
  const stale = rows.filter((r) => r.stale);
  const pending = rows.filter((r) => r.subscribeState === "pending");
  return (
    <section aria-labelledby="auto-delivery-watch">
      <div className={a.sectionH}>
        <h2 id="auto-delivery-watch">배송 조회</h2>
        {stale.length > 0 ? <span className={`${a.tag} ${a.tagWarn}`}>경고 {stale.length}건</span> : <span>{rows.length}건</span>}
      </div>
      {stale.length > 0 ? (
        <p className={a.errorLine} role="alert">
          <span className={a.errorMark} aria-hidden="true">
            !
          </span>
          배송 상태가 24시간 넘게 들어오지 않은 송장이 {stale.length}건 있어요. 수동 조회로 지금 상태를 받아 주세요.
        </p>
      ) : (
        <p className={a.hint} style={{ margin: "-4px 0 8px" }}>
          {rows.length === 0 ? "살펴볼 송장이 없어요." : "24시간 넘게 상태가 멈춘 송장은 없어요."}
        </p>
      )}
      {pending.length > 0 && <p className={a.hint}>구독을 기다리는 송장 {pending.length}건 — 10분마다 다시 보내요.</p>}
      {stale.length > 1 && <TraceButton ids={stale.slice(0, TRACE_LIMIT).map((r) => r.trackingId)} label={`경고 ${Math.min(stale.length, TRACE_LIMIT)}건 모두 조회`} />}
      {rows.length > 0 && (
        <div className={a.tblWrap}>
          <table className={a.tbl} style={{ minWidth: 760 }}>
            <caption className="sr-only">배송 조회</caption>
            <thead>
              <tr>
                <th scope="col">종류</th>
                <th scope="col">송장 끝 4자리</th>
                <th scope="col">택배사 단계</th>
                <th scope="col">구독</th>
                <th scope="col">마지막 수신</th>
                <th scope="col">
                  <span className="sr-only">조회</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.trackingId}>
                  <td>{KIND_LABEL[r.kind]}</td>
                  <td className={`${a.mono} ${a.nowrap}`}>{r.waybillLast4}</td>
                  <td>{r.carrierState ? CARRIER_LABEL[r.carrierState] : "아직 없음"}</td>
                  <td>
                    {r.subscribeState === "subscribed" ? (
                      "구독함"
                    ) : (
                      <span className={a.tag}>대기{r.subscribeError ? ` (${r.subscribeError})` : ""}</span>
                    )}
                  </td>
                  <td className={`${a.mono} ${a.nowrap}`}>
                    {r.lastEventAt ? formatStamp(r.lastEventAt) : "받은 적 없음"}
                    {r.stale && <span className={`${a.tag} ${a.tagWarn}`}> 24시간 넘음</span>}
                  </td>
                  <td>{r.subscribeState === "subscribed" && <TraceButton ids={[r.trackingId]} label="수동 조회" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
