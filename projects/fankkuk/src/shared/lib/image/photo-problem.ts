// 올린 사진을 받지 못하는 까닭과 그 안내 문구 — 서버의 사진 처리(reencodePhoto)와 파일 칸의 미리 검사(photoPickProblem)가 같은 문구를 쓴다.
// 이 파일은 다른 모듈을 불러오지 않는다(브라우저 번들에도 들어간다 — 사진 처리 라이브러리를 끌고 오지 않게).

export type PhotoProblem = "empty" | "too_large_file" | "not_supported" | "too_many_pixels" | "unreadable";

export const PHOTO_PROBLEM_MESSAGE: Record<PhotoProblem, string> = {
  empty: "사진 파일을 골라 주세요.",
  too_large_file: "사진은 10MB 까지 올릴 수 있어요.",
  not_supported: "jpg·png·webp 사진만 올릴 수 있어요.",
  too_many_pixels: "사진이 너무 커요. 더 작은 사진으로 올려 주세요.",
  unreadable: "사진을 열 수 없어요. 다른 사진으로 올려 주세요.",
};
