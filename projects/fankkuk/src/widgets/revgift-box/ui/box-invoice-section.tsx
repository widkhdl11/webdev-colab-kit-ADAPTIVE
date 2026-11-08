import type { BoxInvoice } from "@/entities/revgift-box/api/box-reads";
import { REGION_NAME, TIER_NAME } from "@/entities/revgift-box/model/box-tiers";
import { formatDateTime } from "@/shared/lib/format/datetime";
import s from "./revgift-box.module.css";

// 명세서 (revgift-box INV-GB9·GB13·GB16·GB17 · UX 명세 「4페이지」 invoiced). 팬 줄마다 구간(대형 초과는 「개인접수」)·택배비·할증(제주·도서만)·서비스료·금액,
// 착불로 받은 큰 상자 택배비, 합계, 결제 기한(명세서 + 72시간). 팬 정보는 닉네임과 할증 구분뿐이다. 결제는 4부.

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const PAY_HOURS = 72;

export function BoxInvoiceSection({ invoice }: { invoice: BoxInvoice }) {
  const due = new Date(new Date(invoice.createdAt).getTime() + PAY_HOURS * 3600_000).toISOString();
  return (
    <section className={s.stack} aria-labelledby="invoice-h">
      <h2 className={s.cmpH} id="invoice-h">
        명세서
      </h2>
      <div className={s.tableWrap}>
        <table className={s.invoice}>
          <thead>
            <tr>
              <th scope="col">팬</th>
              <th scope="col">구간</th>
              <th scope="col">택배비</th>
              <th scope="col">할증</th>
              <th scope="col">서비스료</th>
              <th scope="col">금액</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l, i) => (
              <tr key={i}>
                <th scope="row" className={s.invNick} title={l.nickname}>
                  {l.nickname}
                </th>
                <td>{TIER_NAME[l.tier]}</td>
                <td>{won(l.shippingFeeKrw)}</td>
                <td>{l.surchargeRegion === "none" ? "—" : `${REGION_NAME[l.surchargeRegion]} ${won(l.surchargeKrw)}`}</td>
                <td>{won(l.serviceFeeKrw)}</td>
                <td>{won(l.amountKrw)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {invoice.cartonCodKrw > 0 ? (
              <tr>
                <th scope="row" colSpan={5}>
                  착불로 받은 큰 상자 택배비
                </th>
                <td>{won(invoice.cartonCodKrw)}</td>
              </tr>
            ) : null}
            <tr>
              <th scope="row" colSpan={5}>
                합계
              </th>
              <td>
                <strong>{won(invoice.amountKrw)}</strong>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className={s.note}>결제 기한: {formatDateTime(due)}</p>
    </section>
  );
}
