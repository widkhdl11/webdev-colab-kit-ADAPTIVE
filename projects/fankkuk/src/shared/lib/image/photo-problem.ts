// 올린 사진을 받지 못하는 까닭과 그 안내 문구 — 서버의 사진 처리(reencodePhoto)와 파일 칸의 미리 검사(photoPickProblem)가 같은 문구를 쓴다.
// 이 파일은 다른 모듈을 불러오지 않는다(브라우저 번들에도 들어간다 — 사진 처리 라이브러리를 끌고 오지 않게).

export type PhotoProblem = "empty" | "too_large_file" | "not_supported" | "too_many_pixels" | "unreadable";

export const PHOTO_PROBLEM_MESSAGE: Record<PhotoProblem, string> = {
  empty: "사진 파일을 선택해 주세요.",
  too_large_file: "사진은 최대 10MB까지 업로드할 수 있습니다.",
  not_supported: "JPG·PNG·WebP 파일만 업로드할 수 있습니다.",
  too_many_pixels: "이미지 크기가 너무 큽니다. 크기를 줄인 뒤 다시 업로드해 주세요.",
  unreadable: "이미지를 열 수 없습니다. 다른 파일을 선택해 주세요.",
};
