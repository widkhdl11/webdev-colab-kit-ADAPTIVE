// 동그란 얼굴(눈 두 점·웃는 입·볼 두 개) — 시안 v4 의 avatar-face 자리표시. 크기는 전역 .face(48px).
// 바탕색은 --face-1~6 을 돌려 쓴다 — 목록에서 줄 번호를 넘기면 이웃한 줄끼리 색이 달라진다.
const FACE_TONES = 6;

/** tone 을 주면 그 색(CSS 값)을, 아니면 index 로 --face-1~6 을 고른다. 크기는 className(기본 전역 .face 48px). */
export function FaceAvatar({ index = 0, tone, className = "face" }: { index?: number; tone?: string; className?: string }) {
  const fill = tone ?? `var(--face-${(((index % FACE_TONES) + FACE_TONES) % FACE_TONES) + 1})`;
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <circle cx="24" cy="24" r="24" fill={fill} />
      <circle cx="17" cy="22" r="2.6" fill="var(--ink)" />
      <circle cx="31" cy="22" r="2.6" fill="var(--ink)" />
      <path d="M18 29c2.5 3.5 9.5 3.5 12 0" stroke="var(--ink)" strokeWidth="2.6" strokeLinecap="round" fill="none" />
      <circle cx="12.5" cy="28" r="3" fill="var(--white)" opacity=".45" />
      <circle cx="35.5" cy="28" r="3" fill="var(--white)" opacity=".45" />
    </svg>
  );
}
