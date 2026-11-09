import type { SafeNumberApi } from "@/shared/api/safe-number/safe-number-api";
import type { ExcelRecipientPhoneMode } from "@/shared/config/courier";

// 엑셀 반자동의 받는 사람 전화 칸 값(address-protection INV-P21 ② · INV-P19 와 같은 원칙).
// 조립(엑셀 만들기를 열 때, 주소를 열기 전)에 연결을 확인하고, 상자마다 연 주소의 실제 번호를 받아 칸 값을 돌려준다.
// 안심번호 설정에서 번호를 못 받으면 실제 번호로 대신 넣지 않는다 — 그 상자는 실패(파일에서 빠진다).
// 실제 엑셀 파일 생성은 로지아이 양식 파일을 받은 뒤 만든다(BACKLOG) — 이 함수는 그때 칸 하나를 채운다.

export type ExcelPhoneCell = (input: { realPhone: string; ref: string }) => Promise<string>;

/** 안심번호 꼴 — 050 으로 시작하는 11~12자리 숫자(하이픈 허용) */
const SAFE_NUMBER = /^050\d{8,9}$/;

export function excelRecipientPhone(mode: ExcelRecipientPhoneMode, api: SafeNumberApi): ExcelPhoneCell {
  switch (mode) {
    case "real":
      return async ({ realPhone }) => realPhone;
    case "safe_number_api":
      if (!api.connected) throw new Error("엑셀 전화 칸이 안심번호인데 안심번호 업체 연결이 없다 — 연결 전에는 real 로 둔다");
      return async ({ realPhone, ref }) => {
        const issued = await api.issue({ realPhone, ref });
        const digits = typeof issued === "string" ? issued.replaceAll("-", "") : "";
        if (!SAFE_NUMBER.test(digits)) throw new Error("안심번호 업체가 번호 꼴이 아닌 값을 줬다");
        return issued;
      };
  }
}
