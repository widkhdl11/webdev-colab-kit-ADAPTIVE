// 확정 로고 — 코랄 원 안의 뻐꾸기 얼굴 + 선물 상자 (docs/design/refs/fankkuk-icon-guide.md, 원본 fankkuk-icon-final.png).
// 도형은 시안 docs/design/mockups/site/v5-coral/icon.svg 와 같다. 색은 로고 전용 4색 — 버튼 색(--brand)을 쓰지 않는다.
// 뚜껑과 몸통 사이 가로 빈틈은 비워 둔다: 세로 리본은 몸통 윗변(y=295)에서 시작한다.
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <circle cx="256" cy="256" r="256" fill="var(--logo-coral)" />
      <path
        d="M141 242C127 168 182 101 258 103C269 76 290 69 301 76C315 84 310 100 295 110C349 130 381 182 370 242H383C392 242 399 249 399 258V267C399 276 392 282 383 282H128C119 282 112 276 112 267V258C112 249 119 242 128 242Z"
        fill="var(--logo-ivory)"
      />
      <circle cx="199.5" cy="189.5" r="15.5" fill="var(--logo-charcoal)" />
      <circle cx="310.5" cy="189.5" r="15.5" fill="var(--logo-charcoal)" />
      <path
        d="M240 202H271C279 202 282 208 277 215L263 237C259 244 252 244 248 237L233 215C228 208 232 202 240 202Z"
        fill="var(--logo-deep-coral)"
      />
      <path
        d="M132 295H378Q384 295 384 301V400C384 420 370 435 350 435H161C141 435 127 420 127 400V301Q127 295 132 295Z"
        fill="var(--logo-ivory)"
      />
      <path d="M235.5 295H275.5V322H384V355H275.5V435H235.5V355H127V322H235.5Z" fill="var(--logo-deep-coral)" />
    </svg>
  );
}
