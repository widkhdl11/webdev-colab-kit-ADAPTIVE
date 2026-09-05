type IconProps = { size?: number; className?: string };

/**
 * 화면 여기저기서 반복되는 선 아이콘. 전부 장식이라 aria-hidden 이고,
 * 뜻은 옆의 글자가 낸다 — 아이콘만 있는 자리는 부르는 쪽이 라벨을 붙인다.
 */
function frame(size: number, width: number, children: React.ReactNode, className?: string) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export const PinIcon = ({ size = 15, className }: IconProps) =>
  frame(
    size,
    2,
    <>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>,
    className,
  );

export const ClockIcon = ({ size = 15, className }: IconProps) =>
  frame(
    size,
    2,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>,
    className,
  );

export const HeartIcon = ({ size = 15, className }: IconProps) =>
  frame(
    size,
    2,
    <path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1z" />,
    className,
  );

export const EyeIcon = ({ size = 15, className }: IconProps) =>
  frame(
    size,
    2,
    <>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" />
      <circle cx="12" cy="12" r="3" />
    </>,
    className,
  );

export const ArrowRightIcon = ({ size = 16, className }: IconProps) =>
  frame(size, 2.4, <path d="M4 12h15M13 6l6 6-6 6" />, className);

export const CheckIcon = ({ size = 14, className }: IconProps) =>
  frame(size, 3, <path d="m4 12.5 5 5L20 6.5" />, className);

export const CalendarIcon = ({ size = 16, className }: IconProps) =>
  frame(
    size,
    2.2,
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M8 3v4M16 3v4M3 11h18" />
    </>,
    className,
  );

export const BellIcon = ({ size = 21, className }: IconProps) =>
  frame(
    size,
    2,
    <>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </>,
    className,
  );

export const SearchIcon = ({ size = 18, className }: IconProps) =>
  frame(
    size,
    2.2,
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" />
    </>,
    className,
  );
