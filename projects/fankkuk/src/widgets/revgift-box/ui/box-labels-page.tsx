import Link from "next/link";
import type { BoxLabel } from "@/entities/revgift-box/api/box-reads";
import { Barcode } from "@/shared/ui/barcode";
import { PrintButton } from "@/shared/ui/print-button";
import s from "./revgift-box.module.css";

// 번호 라벨 인쇄 (revgift-box INV-GB9·GB10). 담길 팬마다 한 장 — 닉네임 + 바코드(신청 번호)뿐이다. 주소·6자리는 없다.
// 사무실은 선물마다 바코드를 스캔해 팬을 찾고 이 라벨을 그대로 사무실 라벨로 쓴다. 인쇄 창에서 PDF 로 저장할 수도 있다.

export function BoxLabelsPage({ boxId, boxName, labels }: { boxId: string; boxName: string; labels: readonly BoxLabel[] }) {
  return (
    <main id="main" className="page-centered v34">
      <div className={`${s.col} ${s.stack}`}>
        <p className={s.noPrint}>
          <Link className={s.back} href={`/creator/revgift-boxes/${boxId}`}>
            {boxName}
          </Link>
        </p>
        <header className={`page-head ${s.head} ${s.noPrint}`}>
          <h1 className={`ph-title ${s.title}`}>번호 라벨</h1>
          <PrintButton label="인쇄" />
        </header>
        <ul className={s.labels}>
          {labels.map((l) => (
            <li key={l.barcode} className={s.label}>
              <span className={s.labelNick}>{l.nickname}</span>
              <Barcode className={s.labelBars} value={l.barcode} />
              <span className={s.labelCode}>{l.barcode}</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
