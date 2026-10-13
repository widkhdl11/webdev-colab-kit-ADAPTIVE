import Link from "next/link";
import { PROMISE } from "@/shared/config/site-copy";

// 메인 첫 화면 — 팬 메인과 크리에이터 메인이 같이 쓴다. 시안: docs/design/mockups/site/v11/home-fan.html · home-creator.html (.hero)
// 크리에이터 메인도 같은 첫 화면을 둔다: 「기본적으로 서비스 플랫폼이다. 너무 배송 업무 중심으로만 보이면 정나미 없을 것」(2026-10-07, 카드 d40).
// v11 에서 옅은 코랄 판과 3D 그림을 걷고 가운데 글자 + 버튼 둘로 바꿨다(design-rules 0절).
export function HomeHero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="container">
        <p className="t-lead">좋아하는 마음이 상자에 담겨 닿는 곳</p>
        <h1 className="t-hero" id="hero-title">
          좋아하는 크리에이터에게
          <br />
          선물을 보내 보세요
        </h1>
        <p className="hero-desc t-lead">
          {PROMISE.approval}
          <br />
          {PROMISE.address}
        </p>
        <div className="row-btns">
          <Link className="btn btn--wide" href="/gifts/new">
            선물 보내기
          </Link>
          <Link className="btn btn--line btn--wide" href="/creators">
            크리에이터 찾기
          </Link>
        </div>
      </div>
    </section>
  );
}
