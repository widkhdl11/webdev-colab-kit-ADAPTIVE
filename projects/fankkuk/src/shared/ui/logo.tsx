// 로고 자리표시 — 초록 원 안 하트. 확정본은 아직 없다(design-rules 7절).
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="var(--brand)" />
      <path d="M16 24C12 21 7 18 7 13a5 5 0 0 1 9-3 5 5 0 0 1 9 3c0 5-5 8-9 11Z" fill="var(--on-brand)" />
    </svg>
  );
}
