// 로그인 후 사이드바 접힘 상태를 첫 그림 전에 단다 — 안 그러면 펼친 240 으로 그렸다가 64 로 줄어드는 게 보인다.
// 저장값이 없으면 펼침(2026-10-15 사용자 「기본은 open」), 그 뒤로는 마지막 상태를 따른다. app/layout.tsx 가 <head> 에서 부르고, 값을 바꾸는 쪽은 widgets/site-header/ui/app-sidebar.tsx
try {
  var s = localStorage.getItem("sidebar-collapsed");
  if (s === "1") document.documentElement.setAttribute("data-collapsed", "1");
} catch (e) {}
