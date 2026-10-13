import Link from "next/link";
import { PROMISE } from "@/shared/config/site-copy";
import s from "./home.module.css";

// 메인 첫 줄 왼쪽의 큰 판 — 팬 메인과 크리에이터 메인이 같이 쓴다(시안 v9-home home-b · creator-a).
// 크리에이터 메인도 같은 판을 둔다: 「기본적으로 서비스 플랫폼이다. 너무 배송 업무 중심으로만 보이면 정나미 없을 것」(2026-10-07, 카드 d40).
export function BrandPanel() {
  return (
    <div className={s.panel}>
      <div>
        <p className="kicker">좋아하는 마음이 상자에 담겨 닿는 곳</p>
        <h1 className={s.title} id="hero-title">
          좋아하는 크리에이터에게
          <br />
          선물을 보내 보세요
        </h1>
        <p className={`lead ${s.lead}`}>
          {PROMISE.approval}
          <br />
          {PROMISE.address}
        </p>
        <div className={s.btns}>
          <Link className="btn" href="/gifts/new">
            선물 보내기
          </Link>
          <Link className="btn btn--soft" href="/creators">
            크리에이터 찾기
          </Link>
        </div>
      </div>
      <div className={s.art} aria-hidden="true">
        <img className={s.a1} src="/img/icon-gift.png" width={200} height={200} alt="" />
        <img className={s.a2} src="/img/icon-truck.png" width={88} height={88} alt="" />
        <img className={s.a3} src="/img/icon-approve.png" width={88} height={88} alt="" />
      </div>
    </div>
  );
}
