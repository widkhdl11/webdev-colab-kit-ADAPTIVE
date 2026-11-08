import { code128Widths } from "@/shared/lib/barcode/code128";

// Code 128 바코드 SVG. 앞뒤에 조용한 영역(빈칸 10칸)을 둔다. 그릴 수 없는 글자면 아무것도 그리지 않는다.
// 바코드 아래 글자는 부르는 쪽이 따로 적는다(화면 낭독기는 aria-label 로 값을 읽는다).

const QUIET = 10;

export function Barcode({ value, className }: { value: string; className?: string }) {
  const widths = code128Widths(value);
  if (!widths) return null;
  const total = widths.reduce((a, b) => a + b, 0) + QUIET * 2;
  let x = QUIET;
  const bars: { x: number; w: number }[] = [];
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return (
    <svg className={className} viewBox={`0 0 ${total} 40`} preserveAspectRatio="none" role="img" aria-label={`바코드 ${value}`}>
      <rect x="0" y="0" width={total} height="40" fill="#fff" />
      {bars.map((b) => (
        <rect key={b.x} x={b.x} y="0" width={b.w} height="40" fill="#000" />
      ))}
    </svg>
  );
}
