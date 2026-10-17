// 경찰 인계 메모 한도 (office-workflow INV-W14 — 1~200자, 실명·주소·전화 없이). 서버 검사와 화면 글자 수가 같은 값을 쓴다.
export const POLICE_MEMO_MAX = 200;
export const MESSAGE_POLICE_MEMO = `메모를 1~${POLICE_MEMO_MAX}자로 적어 주세요.`;
