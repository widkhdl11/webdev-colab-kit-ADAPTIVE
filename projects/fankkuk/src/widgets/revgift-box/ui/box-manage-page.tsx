import Link from "next/link";
import type { BoxCard, MyBox, PriceTable } from "@/entities/revgift-box/api/box-reads";
import { BOX_STATUS_NAME } from "@/entities/revgift-box/model/box-status";
import { BoxManagePanel } from "@/features/revgift-box-manage/ui/box-manage-panel";
import { BoxTierPanel } from "@/features/revgift-box-manage/ui/box-tier-panel";
import { BoxInvoiceSection, type PayNotice } from "./box-invoice-section";
import { BoxSendSection } from "./box-send-section";
import s from "./revgift-box.module.css";

// 신청 관리 창 화면(크리에이터, revgift-box INV-GB7). 머리: 선물함 이름 · 상태 · 공개 여부. 본문은 신청 관리 기능.
// applyUrl 은 라우트가 서버에서 만든 신청 링크(비공개면 초대 토큰 포함) — 주인에게만 보인다.
// 3부(INV-GB1): 마감 → 2페이지 상자 선택 · 상자 보내 주세요·도착·확인 필요 → 3페이지 안내 · 명세서 뒤 → 명세서. 그 밖(신청 받는 중·취소)은 신청 관리 창.
export function BoxManagePage({
  box,
  applyUrl,
  price,
  cards,
  clientKey,
  notice,
}: {
  box: MyBox;
  applyUrl: string;
  price: PriceTable | null;
  cards: readonly BoxCard[];
  clientKey: string;
  notice: PayNotice;
}) {
  return (
    <main id="main" className="page-centered v34">
      <div className={s.col}>
        <p>
          <Link className={s.back} href="/creator/revgift-boxes">
            선물함 목록
          </Link>
        </p>
        <header className="page-head">
          <h1 className={`ph-title ${s.title}`}>{box.name}</h1>
          <p className={s.headTags}>
            <span className="tag tag--brand">{BOX_STATUS_NAME[box.status]}</span>
            <span className="tag">{box.isPublic ? "공개" : "비공개"}</span>
          </p>
        </header>
        {box.status === "closed" && price ? (
          <BoxTierPanel box={box} price={price} />
        ) : box.status === "awaiting_box" || box.status === "arrived" || box.status === "held" ? (
          <BoxSendSection box={box} cards={cards} />
        ) : box.invoice ? (
          <BoxInvoiceSection boxId={box.id} boxName={box.name} status={box.status} invoice={box.invoice} clientKey={clientKey} notice={notice} />
        ) : (
          <BoxManagePanel key={`${box.status}-${box.applications.length}`} box={box} applyUrl={applyUrl} />
        )}
      </div>
    </main>
  );
}
