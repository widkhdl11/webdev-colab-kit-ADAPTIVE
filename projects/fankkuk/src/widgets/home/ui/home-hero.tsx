import Link from "next/link";
import { PROMISE } from "@/shared/config/site-copy";
import s from "./home.module.css";

// 팬 홈 첫 화면. 시안: docs/design/mockups/site/v18/home-fan.html (.hero.hero--home)
// v18: 본문 가운데 틀(1200) 안, 위 여백 없이 가운데 글자 + 버튼 둘(주 + 보조). 크리에이터 홈은 v18 에서 첫 화면 대신 페이지 머리를 둔다.
export function HomeHero() {
  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className={s.heroText}>
        <p className="t-lead">좋아하는 마음이 상자에 담겨 닿는 곳</p>
        <h1 className="t-hero" id="hero-title">
          좋아하는 크리에이터에게
          <br />
          선물을 보내 보세요
        </h1>
        <p className="hero-line">
          {PROMISE.approval}
          <br />
          {PROMISE.address}
        </p>
      </div>
      <div className="hero-actions">
        <Link className="btn" href="/gifts/new">
          선물 보내기
        </Link>
        <Link className="btn btn--line" href="/creators">
          크리에이터 찾기
        </Link>
      </div>
    </section>
  );
}
