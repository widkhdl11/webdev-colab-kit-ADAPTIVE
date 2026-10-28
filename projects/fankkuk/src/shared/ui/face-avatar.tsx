// 사진 없는 얼굴 자리표시 — 하늘색 발바닥 그림 한 장(2026-10-28 사용자가 네 후보 중 4번으로 정함).
// 크기는 전역 .face(48px) 또는 넘겨받은 className. 원형으로 자르기만 한다.
// index·tone 은 예전 그림(줄마다 바탕색을 돌려 씀)의 인자라 지금은 쓰지 않는다 — 부르는 쪽 12곳을 그대로 두려고 받기만 한다.
export function FaceAvatar({ className = "face" }: { index?: number; tone?: string; className?: string }) {
  return (
    <img
      className={className}
      src="/img/default-face/paw.webp"
      alt=""
      aria-hidden="true"
      width={240}
      height={240}
      style={{ objectFit: "cover", borderRadius: "50%" }}
    />
  );
}
