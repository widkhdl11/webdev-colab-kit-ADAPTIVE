// 사진 없는 얼굴 자리표시 — 고양이 얼굴 그림 한 장(2026-10-28 사용자가 네 후보 중 1번으로 정함, 사이트 전체를 본 뒤 4번 발바닥으로 바꿀 수 있음).
// 4번으로 바꾸려면 아래 경로만 paw.webp 로 바꾼다. 크기는 전역 .face(48px) 또는 넘겨받은 className. 원형으로 자르기만 한다.
// index·tone 은 예전 그림(줄마다 바탕색을 돌려 씀)의 인자라 지금은 쓰지 않는다 — 부르는 쪽 12곳을 그대로 두려고 받기만 한다.
const DEFAULT_FACE_SRC = "/img/default-face/cat.webp";

export function FaceAvatar({ className = "face" }: { index?: number; tone?: string; className?: string }) {
  return (
    <img
      className={className}
      src={DEFAULT_FACE_SRC}
      alt=""
      aria-hidden="true"
      width={240}
      height={240}
      style={{ objectFit: "cover", borderRadius: "50%" }}
    />
  );
}
