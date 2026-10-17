// 사이트 로고 — 흰 고양이 마스코트 얼굴(2026-10-16 사용자 제공 그림). 탭 아이콘(src/app/icon.png)과 같은 그림을 160px 로 줄인 것이다.
// 2026-10-17 사용자 「사이트 로고는 안 바뀐 거 같은데」 — 10-15 임시 로고(하늘색 상자 안 고양이 SVG)를 이 그림으로 바꿨다.
// 그림 바탕이 연한 하늘색 정사각형이라 모서리만 둥글게 깎는다. 옆에 「팬꾹」 글자가 붙으므로 그림은 읽지 않게 둔다(alt="").
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/images/logo-mark.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      style={{ borderRadius: "var(--r-logo)", display: "block", flex: "none" }}
    />
  );
}
