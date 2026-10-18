import { BANNER_DESCRIPTION_MAX, BANNER_TITLE_MAX } from "@/entities/banner/model/banner-rules";

// 배너 저장 안내 문구(운영자 화면) — 서버 응답과 양식의 미리 검사가 같은 글을 쓴다(용어집 12절).

export const BANNER_MESSAGES = {
  /** 22023 — 글자 수 */
  limit: `제목은 1~${BANNER_TITLE_MAX}자, 설명은 ${BANNER_DESCRIPTION_MAX}자까지 적을 수 있어요.`,
  text: `제목은 1~${BANNER_TITLE_MAX}자, 설명은 ${BANNER_DESCRIPTION_MAX}자까지 적을 수 있어요.`,
  link: "누르면 가는 곳은 팬꾹 주소(/로 시작) 또는 https 주소만 적을 수 있어요.",
  start: "시작 날짜를 골라 주세요.",
  period: "끝 날짜는 시작 날짜와 같거나 뒤여야 해요.",
  failed: "저장하지 못했어요. 잠시 뒤 다시 해 주세요.",
} as const;
