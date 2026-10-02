/** 본문 한 덩어리. text 의 parts 에 링크를 섞을 수 있다. */
export type NoticeBlock =
  | { type: "heading"; text: string }
  | {
      type: "text";
      parts: readonly (string | { label: string; href: string })[];
    }
  | { type: "signature"; text: string }
  | { type: "list"; items: readonly string[] };

export type Notice = {
  id: string;
  title: string;
  /** YYYY-MM-DD (서울) */
  date: string;
  pinned: boolean;
  body: readonly NoticeBlock[];
};
