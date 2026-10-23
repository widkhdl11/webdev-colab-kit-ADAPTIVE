import { OPERATOR_NAME } from "./site-copy";

// 사이트 하단·약관·개인정보처리방침·고객센터가 같이 읽는 사업자 정보와 운영 값.
// 사람이 출시 전에 채우는 값이다 — 빈 문자열이면 화면에 「(출시 전 기재)」 자리표시가 나온다.
// 값을 바꾸면 이 파일 하나만 고치면 된다(화면 글에 값을 직접 쓰지 않는다).

export const SITE_INFO_BLANK = "(출시 전 기재)";

export type SiteInfo = {
  /** 상호 — 새 사업자 등록 전까지는 서비스 이름(카드 d64) */
  companyName: string;
  ceoName: string;
  bizRegNo: string;
  /** 통신판매업 신고번호 — 비어 있으면 「신고 진행 중」 */
  mailOrderNo: string;
  bizAddress: string;
  supportEmail: string;
  supportPhone: string;
  supportHours: string;
  /** 호스팅 제공자 — 사이트 서버(tech-stack: Vercel) */
  hostingProvider: string;
  privacyOfficer: { name: string; title: string; contact: string };
  /** 개인정보 처리를 맡기는 곳 중 계약 전이라 이름이 없는 곳 */
  vendors: { kakaoAuth: string; alimtalk: string; mail: string; carrier: string; keyVault: string };
  /** 분실·파손 배상 한도(신고한 가액이 없을 때) — 약관 제17조. 법률 검토 전 초안 값(DECISIONS 2026-10-08 ①) */
  compensationCapKrw: number;
};

export const SITE_INFO: SiteInfo = {
  companyName: OPERATOR_NAME, // 등록증 상호 "팬꾹"과 같은지 site-copy의 OPERATOR_NAME 확인
  ceoName: "정재원",
  bizRegNo: "260-12-03086",
  mailOrderNo: "제2026-서울강남-05946호", // 통신판매업 신고번호(2026-10-24 발급)
  bizAddress: "서울특별시 강남구 언주로134길 18, 5층 가42호 (논현동, 신승빌딩)",
  supportEmail: "support@fankkuk.com", // 고객센터 이메일 — 신고·문의 폼이 이 주소로 열림. 홈택스·토스에 쓴 주소와 같게
  supportPhone: "0502-1931-8289", // 고객센터 전화 — 050 안심번호(개인 번호는 쓰지 않는다)
  supportHours: "평일 10:00~18:00 (주말·공휴일 휴무)",
  hostingProvider: "Vercel Inc.",
  // 개인정보보호법 제31조 — 처리방침에 성명·연락처. 1인 사업자는 대표가 책임자
  privacyOfficer: { name: "정재원", title: "대표", contact: "support@fankkuk.com · 0502-1931-8289" },
  vendors: {
    kakaoAuth: "", // 카카오 인증 딜러사 계약 후
    alimtalk: "",  // 알림톡 발송 대행사 계약 후
    mail: "",      // 메일 발송 서비스(예: Resend, AWS SES) 정한 뒤
    carrier: "",   // 택배사 계약 후(예: "우체국", "CJ대한통운")
    keyVault: "",  // 주소 키 보관처(예: "Supabase Vault", "AWS KMS") 정한 뒤
  },
  compensationCapKrw: 500_000, // 변호사 검토 후 확정
};

/** 빈 값이면 자리표시. */
export const orBlank = (value: string) => (value.trim() === "" ? SITE_INFO_BLANK : value);

/** 사이트 하단 사업자 정보 줄(전자상거래법 제10조 표시 항목). */
export function bizInfoRows(info: SiteInfo): ReadonlyArray<readonly [string, string]> {
  return [
    ["상호", orBlank(info.companyName)],
    ["대표자", orBlank(info.ceoName)],
    ["사업자등록번호", orBlank(info.bizRegNo)],
    ["통신판매업 신고번호", info.mailOrderNo.trim() === "" ? "신고 진행 중" : info.mailOrderNo],
    ["사업장 주소", orBlank(info.bizAddress)],
    ["고객센터", `${orBlank(info.supportEmail)} · ${orBlank(info.supportPhone)}`],
    ["호스팅 제공자", orBlank(info.hostingProvider)],
  ];
}
