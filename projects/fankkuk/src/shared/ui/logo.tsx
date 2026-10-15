// 확정 로고 — 하늘색 상자 안에서 고개를 내민 흰 고양이 (2026-10-15 사용자 제공 그림, 카드 d86).
// 도형은 시안 docs/design/mockups/site/v20-rebrand/logo-user.svg 와 같다(원본 logo-user-ref.png 를 같은 좌표로 옮김).
// 색은 로고 전용 3색 — 버튼 색(--brand)을 쓰지 않는다. 남색(--logo-ink)은 이 그림 밖에 쓰지 않는다.
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="366 290 522 522" aria-hidden="true">
      <path
        d="M443 292H811A75 75 0 0 1 886 367V717A85 85 0 0 1 801 802H453A85 85 0 0 1 368 717V367A75 75 0 0 1 443 292Z"
        fill="var(--logo-sky)"
      />
      <path
        d="M413 548C413 506 436 474 459 462L462 430Q466 382 480 364Q490 354 500 366L556 416Q627 420 698 416L752 366Q762 354 772 364Q786 382 792 430L795 462C818 474 841 506 841 548Z"
        fill="var(--logo-cream)"
      />
      <rect x="368" y="548" width="518" height="19" fill="var(--logo-cream)" />
      <path d="M602 567H651V598Q651 607 642 607H611Q602 607 602 598Z" fill="var(--logo-cream)" />
      <circle cx="551.5" cy="510.5" r="18.5" fill="var(--logo-ink)" />
      <circle cx="701.5" cy="510.5" r="18.5" fill="var(--logo-ink)" />
    </svg>
  );
}
