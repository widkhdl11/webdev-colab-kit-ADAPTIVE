import Link from "next/link";

// 결제 전 동의 체크 — 선물 보내기·역조공 보내기의 결제 버튼 바로 위. 체크해야 결제가 진행된다(전자상거래법 제8조: 결제 전 확인).
// 링크는 새 탭으로 연다 — 같은 탭으로 가면 적어 둔 결제 칸이 사라진다.

export const PAYMENT_CONSENT_MISSING =
  "결제 전에 이용약관과 취소·환불 규정을 확인하고 동의해 주세요.";

// errorId: 동의하지 않고 결제를 눌렀을 때의 오류 문장 id — invalid 이면 칸 설명에 이어 읽힌다.
type Props = {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  invalid?: boolean;
  errorId?: string;
};

const LEGAL_LINKS: ReadonlyArray<readonly [string, string]> = [
  ["/terms", "이용약관"],
  ["/privacy", "개인정보처리방침"],
  ["/refund", "취소·환불 규정"],
];

export function PaymentConsent({
  id,
  checked,
  onChange,
  invalid,
  errorId,
}: Props) {
  return (
    <div className="field-block">
      <label className="check" htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={checked}
          aria-invalid={invalid || undefined}
          aria-describedby={[`${id}-links`, invalid ? errorId : undefined]
            .filter(Boolean)
            .join(" ")}
          onChange={(e) => onChange(e.currentTarget.checked)}
        />
        결제 내용과 아래 규정을 확인했고 결제에 동의해요 (필수)
      </label>
      <p className="hint" id={`${id}-links`}>
        {LEGAL_LINKS.map(([href, label], i) => (
          <span key={href}>
            {i > 0 ? " · " : null}
            <Link href={href} target="_blank" rel="noopener noreferrer">
              {label}
            </Link>
          </span>
        ))}
      </p>
    </div>
  );
}
