// 카카오톡 말풍선 단색 기호 — 글자색을 따라간다(시안 v4 icon-kakao-bubble). 버튼 크기에 맞춰 size 로 키운다.
export function KakaoBubble({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M10 2C5.6 2 2 4.9 2 8.5c0 2.3 1.5 4.3 3.7 5.5l-.9 3.3 3.9-2.2c.4.1.8.1 1.3.1 4.4 0 8-2.9 8-6.7S14.4 2 10 2Z"
      />
    </svg>
  );
}
