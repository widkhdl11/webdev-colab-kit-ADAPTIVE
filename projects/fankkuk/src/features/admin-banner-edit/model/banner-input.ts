import { bannerLinkKind, bannerTextOk, isBannerDate } from "@/entities/banner/model/banner-rules";
import { BANNER_MESSAGES } from "./banner-messages";

// 배너 글 칸 검사 — 서버 저장 경로(save-banner)와 양식의 미리 검사가 같은 함수를 쓴다(docs/specs/banners.md INV-Y3·Y6·Y2).
// 다듬은(trim) 값을 받는다. 이 파일은 서버 전용 모듈(그림 처리 등)을 끌고 오지 않는다 — 브라우저 번들에도 들어간다.

export type BannerTextFields = { title: string; description: string; link: string; startsOn: string; endsOn: string | null };

/** 틀린 칸과 그 문구, 맞으면 null */
export function bannerInputProblem(v: BannerTextFields): { field: string; message: string } | null {
  if (!bannerTextOk(v.title, "")) return { field: "title", message: BANNER_MESSAGES.text };
  if (!bannerTextOk(v.title, v.description)) return { field: "description", message: BANNER_MESSAGES.text };
  if (bannerLinkKind(v.link) === null) return { field: "link", message: BANNER_MESSAGES.link };
  if (!isBannerDate(v.startsOn)) return { field: "startsOn", message: BANNER_MESSAGES.start };
  if (v.endsOn !== null && (!isBannerDate(v.endsOn) || v.endsOn < v.startsOn)) return { field: "endsOn", message: BANNER_MESSAGES.period };
  return null;
}
