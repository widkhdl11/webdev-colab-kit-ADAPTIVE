import type { ReactNode } from "react";
import type { BannerView } from "@/entities/banner/model/banner";
import { INTRO_BANNER } from "@/entities/banner/model/intro-banner";
import { BannerCarousel } from "./banner-carousel";

// 라우트(서버)가 부르는 칸 — 읽지 못했거나(null) 0장이면 칸을 두지 않는다(docs/specs/banners.md INV-Y8).
// key: 브라우저 화면 부품(크리에이터 찾기)의 자식으로 넘어가면 React 가 key 를 요구한다.
// 넘김 부품은 브라우저 부품이라 그 파일의 함수를 서버에서 부를 수 없다 — 그래서 이 함수는 따로 둔다.
// fit: "column" 이면 본문 기둥 폭 그대로(로그인 전 첫 화면) — 기본은 본문보다 넓은 칸 + 양옆 엿보기.
export function bannerSlot(banners: readonly BannerView[] | null, fit: "wide" | "column" = "wide"): ReactNode {
  return banners && banners.length > 0 ? <BannerCarousel key="banner" banners={banners} fit={fit} /> : null;
}

/** 로그인 후에는 소개 이미지를 첫 장에 추가한다. 운영자 배너의 순서는 그대로 유지한다. */
export function memberBannerSlot(banners: readonly BannerView[] | null): ReactNode {
  return bannerSlot([INTRO_BANNER, ...(banners ?? [])], "column");
}
