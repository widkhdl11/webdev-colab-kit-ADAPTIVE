"use client";

// 브라우저 인쇄 창을 여는 버튼(인쇄 창에서 PDF 로 저장할 수도 있다).
export function PrintButton({ label, className = "btn" }: { label: string; className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      {label}
    </button>
  );
}
