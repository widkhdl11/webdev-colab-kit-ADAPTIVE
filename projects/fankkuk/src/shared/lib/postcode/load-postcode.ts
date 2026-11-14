// 카카오(다음) 우편번호 서비스 스크립트 불러오기 (address-protection INV-P20 ①).
// 평문 주소가 있는 화면에 바깥 스크립트가 들어오는 유일한 자리라, 「주소 검색」을 누를 때만 부른다 — 화면을 열기만 해서는 부르지 않는다.
// 한 번 부르면 그 뒤로는 다시 내려받지 않는다. 보안 헤더의 스크립트 허용 목록(next.config.ts)에 이 주소, 프레임 허용 목록에 검색 화면 주소가 있다.

// 2026-11-14 카카오 공지(옛 주소 t1.daumcdn.net 은 2026-11-30 종료)로 옮겼다 — 보안 헤더(next.config.ts)의 허용 주소와 같이 바꾼다
export const POSTCODE_SCRIPT_SRC = "https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";

/** 검색이 끝났을 때 서비스가 주는 값 중 이 사이트가 쓰는 칸 */
export type PostcodeResult = {
  zonecode: string;
  address: string;
  roadAddress: string;
  jibunAddress: string;
  userSelectedType: string;
};

type PostcodeInstance = { embed(target: HTMLElement, options?: { autoClose?: boolean }): void };
export type PostcodeConstructor = new (options: { oncomplete: (data: PostcodeResult) => void; width?: string; height?: string }) => PostcodeInstance;

type PostcodeGlobal = { Postcode?: PostcodeConstructor };

function loadedConstructor(): PostcodeConstructor | null {
  const w = window as unknown as { daum?: PostcodeGlobal; kakao?: PostcodeGlobal };
  return w.daum?.Postcode ?? w.kakao?.Postcode ?? null;
}

let loading: Promise<PostcodeConstructor> | null = null;

/** 스크립트를 (처음이면) 붙이고, 다 내려오면 검색 화면 생성자를 준다. 실패하면 다음 호출이 다시 시도한다. */
export function loadPostcode(): Promise<PostcodeConstructor> {
  const ready = loadedConstructor();
  if (ready) return Promise.resolve(ready);
  // 붙였던 스크립트가 없어졌으면(화면 전환 등) 처음부터
  if (loading && !document.querySelector(`script[src="${POSTCODE_SCRIPT_SRC}"]`)) loading = null;
  if (loading) return loading;
  loading = new Promise<PostcodeConstructor>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = POSTCODE_SCRIPT_SRC;
    script.async = true;
    const fail = () => {
      loading = null;
      script.remove();
      reject(new Error("우편번호 서비스를 불러오지 못했다"));
    };
    script.onload = () => {
      const ctor = loadedConstructor();
      if (ctor) resolve(ctor);
      else fail();
    };
    script.onerror = fail;
    document.head.appendChild(script);
  });
  return loading;
}

/** 검색 결과의 기본 주소 — 사용자가 고른 쪽(도로명 R · 지번 J), 비어 있으면 서비스의 기본 주소 */
export function basicAddressOf(r: PostcodeResult): string {
  const picked = r.userSelectedType === "J" ? r.jibunAddress : r.roadAddress;
  return picked || r.address;
}
