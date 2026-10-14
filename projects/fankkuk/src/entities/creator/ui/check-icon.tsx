// 체크 표시 하나 — 「채널 소유 확인」 태그·함께한 시간 확인 표시·선물 보내기 맨 위 한 줄이 같은 모양을 쓴다.
// 꾸밈이라 화면 읽기에는 숨긴다(뜻은 옆 글자나 감싼 요소의 aria-label 이 알린다). 색은 글자색(currentColor)을 따른다.
export function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12.5 4.5 4.5L19 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
