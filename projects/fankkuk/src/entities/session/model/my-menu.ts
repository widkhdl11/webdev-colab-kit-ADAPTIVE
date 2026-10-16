// 크리에이터가 「내 팬꾹」(/me)을 찾아오면 보내는 곳. 메뉴 목록은 왼쪽 앱 사이드바(widgets/site-header/model/app-menu)가 갖는다.

// 크리에이터 처리할 일(action-center INV-J5) — entities/action-item 의 CREATOR_ACTION_CENTER_HREF 와 같은 값(같은 층 다른 조각이라 가져오지 않고 글자로 둔다).
// /creator/requests 는 이제 승인 내역(승인·받지 않기를 마친 요청)이라 크리에이터의 첫 할 일 자리가 아니다.
export const CREATOR_MY_HOME = "/creator/actions";
