const CAT2='assets/mascot-cat.webp',GIFT='assets/icon-gift.webp';
const B=(t,c='line sm',x='')=>`<button type="button" class="btn ${c}" ${x}>${t}</button>`;
const FC=(c='')=>`<span class="fc ${c}"><img src="${CAT}" alt=""></span>`;
const FANAV=[['home','홈'],['list','지금 할 일'],['search','크리에이터 찾기'],['gift','선물 보내기'],['box','보낸 선물'],['mail','받은 선물'],['heart','팔로우한 크리에이터'],['chat','문의']];
const shell=(inner,role,active,o={})=>{
  const nav=role==='fan'
   ?`<nav aria-label="내 메뉴">${FANAV.map(([i,t])=>`<a href="#" ${t===active?'aria-current="page"':''}>${ic(i)}${t}${t==='지금 할 일'?'<span class="n">1</span>':''}</a>`).join('')}</nav><div class="me"><i></i>별빛님</div>`
   :`<nav aria-label="내 메뉴">${NAVG.map(([h,its])=>`<p class="gh">${h}</p>${its.map(([i,t,sub])=>sub?`<a href="#" class="subi">${t}${sub===2?'<span class="soon2">준비 중</span>':''}</a>`:`<a href="#" ${t===active?'aria-current="page"':''}>${ic(i)}${t}</a>`).join('')}`).join('')}</nav><div class="me"><i></i>하루님</div>`;
  const side=o.anon?'':`<aside class="sb"><div class="sb-top">${logo}<span style="width:36px;height:36px;display:grid;place-items:center;color:var(--sub)">${ic('col',20)}</span></div>${nav}</aside>`;
  return `<div class="app">${side}<div class="mainwrap"><div class="tb">${logo}<button aria-label="메뉴">${ic('menu',24)}</button></div><main class="pane-main"><div class="col ${o.w||''}">${inner}</div></main>${footer}</div></div>`;
};
const head=(t,d,btn)=>`<header class="ph"><div class="phrow"><h1>${t}</h1>${btn||''}</div>${d?`<p class="phd">${d}</p>`:''}</header>`;
const grp=(n,rows,nmt)=>`<section class="grp"><h2 class="nm" style="--nmt:${nmt}px">${n}</h2><div class="rows">${rows}</div></section>`;
const row=(k,v,act)=>`<div class="item"><div class="row"><p class="txt">${k?`<span class="k">${k}</span>`:''}${v?`<span class="v">${v}</span>`:''}</p>${act?`<div class="act">${act}</div>`:''}</div></div>`;
const sw=(t,d,on)=>`<div class="item"><div class="swb"><span class="txt"><span class="k">${t}</span><span class="s">${d}</span></span><span class="trk old ${on?'on':''}" role="img" aria-label="${on?'켜짐':'꺼짐'}"></span></div></div>`;
const fld=(v,c='',w)=>`<div class="fld ${c}"${w?` style="max-width:${w}px"`:''}>${v}</div>`;
const fx=(w,inner)=>`<div class="fx" style="--w:${w}px">${inner}</div>`;
const CHECK='<svg width="24" height="24" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="10" fill="currentColor"/><path d="m5 10 3 3 7-7" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const chev='<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
const FANMUST=`<p class="must"><b>필수 알림: 반송할 상자 · 미도착 상자 · 전달되지 않은 선물 · 추가 결제 요청 · 결제 취소 · 추가 결제 취소 · 팬꾹 주소 없이 보낸 상자 · 크리에이터가 보낸 선물 수락 요청 · 반송 주소 확인</b></p><p class="s" style="margin-top:24px">선물 진행·결제·상자 처리에 필요한 알림은 수신 설정과 관계없이 발송됩니다.</p>`;
const CRMUST=`<p class="must"><b>필수 알림: 승인 요청 · 추적 장치 발견 · 선물 수령 여부 확인 · 반송 주소 확인</b></p><p class="s" style="margin-top:24px">선물 진행·결제·상자 처리에 필요한 알림은 수신 설정과 관계없이 발송됩니다.<br>승인 요청은 7일 동안 응답하지 않으면 자동 반려됩니다.</p>`;

/* 이메일 칸 — 가입(signup-page 605~660)과 같은 「앞부분 @ 도메인 고르기」, 기존 주소는 splitEmail 처럼 목록 도메인이면 고르고 아니면 「직접 입력」 */
const emailBox=k=>{
  const gm=k==='gmail', er=k==='err';
  const sel=gm?'gmail.com':'직접 입력';
  const custom=gm?'':(er?'example':'example.com');
  const old=er?'byeolbit.fan@example':'byeolbit.fan@example.com';
  return `<div class="em-new"><div class="em"><div class="fld">byeolbit.fan</div><span class="at" aria-hidden="true">@</span><div class="fld sel">${sel}</div></div>${gm?'':`<div class="fld em-c ${er?'bad':''}">${custom}</div>`}</div><div class="em-old">${fld(old,er?'bad':'')}</div>`;
};
/* ---------- 1 /me ---------- */
const me=k=>{
  const addr=k==='addr';
  const mailHint=k==='pend'?'새 이메일(new.byeolbit@example.com)로 확인 메일을 보냈습니다. 메일의 링크에서 확인을 마치면 변경됩니다.':'새 이메일로 확인 메일을 발송합니다. 메일의 링크에서 확인을 마치면 변경됩니다.';
  const msg=k==='err'?`<p class="err" role="alert">이메일 형식이 올바르지 않습니다.</p>`:k==='pend'?`<p class="okm" role="status">저장되었습니다. 새 이메일(new.byeolbit@example.com)로 확인 메일을 보냈습니다.</p>`:'';
  return shell(head('계정 설정','보안·받을 주소·알림을 관리합니다. 닉네임은 ‘프로필 수정’에서 변경해 주세요.',B('프로필 수정','line sm'))
  +grp('보안',row('비밀번호','',B('변경'))+row('휴대폰 번호','010-****-5678',B('변경')),18)
  +grp('받을 주소',addr?row('','집 · 10월 28일 등록',`${B('변경')}${B('삭제')}`)+`<div class="item"><div class="panel"><p class="s">이미 ‘받기’를 누른 선물은 당시 등록된 주소로 배송됩니다.</p><div class="btns" style="margin-top:16px">${B('취소')}${B('주소 삭제','sm danger')}</div></div></div>`:row('','등록된 주소 없음',B('등록')),18)
  +grp('개인정보',row('아이디','byeolbit_fan')+`<div class="item fieldrow"><span class="k">이메일</span>${emailBox(k)}<p class="s">${mailHint}</p></div>`,5)
  +grp('알림',sw('카카오톡 알림','승인·배송 등 선물 관련 알림톡 수신',1)+sw('이메일 알림','영수증·안내 메일 수신',1)+sw('선물 소식 바로 받기','끄면 하루 한 번 오후 7시에 모아서 보냅니다',0)+FANMUST,5)
  +`<div class="end">${msg}<div class="btns"><button type="button" class="btn line rv">되돌리기</button>${k==='saving'?B('저장 중','off','aria-disabled="true"'):B('저장','')}</div></div>`
  +`<div class="quit"><div class="row"><p class="txt"><span class="k">회원 탈퇴</span><span class="s">탈퇴 문의 및 절차 안내</span></p>${B('탈퇴 안내','sm danger')}</div></div>`,'fan','');
};
/* ---------- 2 /me/profile ---------- */
const meProfile=k=>{
  const ph=k==='photo';
  const photoRow=`<div class="item"><div class="row"><span class="av" aria-hidden="true">${ph?`<img src="${CAT2}" alt="">`:'별'}</span><p class="txt"><span class="k">프로필 사진</span><span class="s">JPG·PNG·WebP · 최대 10MB<br>사진 미등록 시 닉네임 첫 글자 표시</span></p><div class="act">${B(ph?'사진 변경':'사진 업로드')}${ph?B('삭제'):''}</div></div>${ph?'<p class="okm" style="margin-bottom:8px">프로필 사진 변경 완료</p>':''}</div>`;
  const bgRow=`<div class="item fieldrow"><div class="lab"><span class="k">배경 사진</span><div class="act">${B(ph?'사진 변경':'사진 업로드')}${ph?B('삭제'):''}</div></div><span class="bn">${ph?`<img src="assets/creator-cat.webp" alt="">`:'등록된 배경 사진 없음'}</span><p class="s">가로형 사진 권장 · 미등록 시 기본 하늘색 배경 표시</p></div>`;
  const nickErr=k==='err';
  return shell(head('프로필 수정','프로필 사진·배경 사진·닉네임·자기소개를 수정합니다.')
  +grp('사진',photoRow+bgRow,16)
  +grp('소개',`<div class="item fieldrow">${fx(240,`<div class="lab"><span class="k">닉네임</span><span class="cnt">${nickErr?'13':'2'}/12</span></div>${fld(nickErr?'별빛별빛별빛별빛별빛입니다':'별빛',nickErr?'bad':'')}`)}${nickErr?'<p class="s bad-t" role="alert">닉네임은 12자까지 입력할 수 있습니다.</p>':''}<p class="s">1~12자</p></div><div class="item fieldrow"><div class="lab"><span class="k">자기소개</span><span class="cnt">${ph?'23':'0'}/100</span></div>${fld(ph?'별빛이에요. 선물 보내는 걸 좋아해요.':'','ta '+(ph?'':'ph0'))}<p class="s">최대 100자</p></div>`,14)
  +`<div class="end">${ph?'<p class="okm" role="status">저장되었습니다.</p>':''}<div class="btns"><button type="button" class="btn line">취소</button>${B('저장','')}</div></div>`,'fan','');
};
/* ---------- 3 /me/following ---------- */
const FW=[['하루','치지직','z','하루의 놀이터 · 게임 방송을 해요.',GIFT],['모모','유튜브','y','모모네 거실 · 노래 방송을 해요.'],['새벽달','SOOP','s','새벽달 라디오 · 새벽에 이야기를 나눠요.'],['별이','유튜브','y','별이의 작업실 · 그림 그리는 방송을 해요.'],['솜사탕','치지직','z','솜사탕 식탁 · 맛있는 걸 같이 먹어요.'],['도담','유튜브','y','도담 홈트 · 집에서 같이 운동해요.'],['보리','SOOP','s','보리의 지구본 · 여행 이야기를 들려 드려요.']];
const unf='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20S4 14.5 4 9a4 4 0 0 1 8-1 4 4 0 0 1 8 1c0 5.500-8 11-8 11z"/><path d="m4 4 16 16"/></svg>';
const following=k=>{
  const empty=k==='empty';
  const list=empty?`<div class="fempty"><img src="assets/illust-empty-follow.png" alt=""><h2>팔로우한 크리에이터가 없습니다</h2><p>선물을 보낼 크리에이터를 찾아 팔로우해 주세요.</p>${B('크리에이터 찾기','')}</div>`
   :`<ul class="fl">${FW.map(([n,p,c,i,img])=>`<li><span class="fc md"><img src="${img||CAT2}" alt=""></span><div class="who2"><p class="nr"><a href="#">${n}</a><span class="ct ${c}"><i></i>${p}</span></p><p class="in">${i}</p></div>${B('선물 보내기','line sm fl')}<span class="ib" role="img" aria-label="${n} 팔로우 취소">${unf}</span></li>`).join('')}</ul>`;
  return shell(head('팔로우한 크리에이터','팔로우한 크리에이터에게 내 닉네임이 표시됩니다.')
  +`<div class="fgrid"><div class="flist">${list}</div><aside class="fside" aria-label="팔로우 요약"><div class="fpanel"><div><p class="lb">팔로우</p><p class="num">${empty?0:7}<small>명</small></p></div>${B('크리에이터 더 찾기',empty?'line':'')}<img src="${CAT2}" alt=""></div></aside></div>`,'fan','팔로우한 크리에이터',{w:'fw'});
};
/* ---------- 4 /me/email/confirm ---------- */
const emailC=k=>{
  if(k==='anon')return shell(head('이메일 확인','')+`<div class="ec"><p>확인 메일을 받은 계정으로 <a href="#" style="font-weight:600;text-decoration:underline;display:inline-flex;align-items:center;min-height:44px">로그인</a>한 뒤 메일의 링크를 다시 눌러 주세요.</p></div>`,'fan','',{anon:1});
  const done=k==='done';
  return shell(head('이메일 확인','')+`<div class="ec">${done?'':'<p>‘이메일 주소 확인’을 누르면 이 주소가 계정 이메일로 등록됩니다.</p>'}${done?`<p class="okr" role="status">${CHECK}이메일 주소(new.byeolbit@example.com)가 확인되었습니다.</p>`:''}${k==='failed'?'<p class="err" role="alert">확인 링크가 만료되었습니다. 계정 설정에서 이메일을 다시 저장해 주세요.</p>':''}<div class="btnrow" style="display:flex">${done?B('내 팬꾹으로 가기',''):k==='sending'?B('확인 중','off','aria-disabled="true"'):B('이메일 주소 확인','')}</div></div>`,'fan','');
};
/* ---------- 5 /creator/account ---------- */
const crAccount=k=>{
  const ver=k==='ver';
  const msg=k==='err'?'<p class="err" role="alert">알림 설정을 저장하지 못했습니다.</p>':k==='saved'?'<p class="okm" role="status">알림 설정이 저장되었습니다.</p>':'';
  return shell(head('계정 설정','보안·채널 소유자 확인·알림을 관리합니다.')
  +grp('보안',row('비밀번호','',B('변경'))+row('휴대폰 번호',k==='err'?'등록된 번호가 없어요':'010-****-9999',B('변경'))+row('채널 소유자 확인',ver?'치지직 채널 「하루의 놀이터」 확인됨 · 10월 12일':'확인 전',B(ver?'다시 확인':'확인하기')),18)
  +grp('알림',sw('카카오톡 알림','필수 알림 외 소식을 알림톡으로 수신',1)+sw('이메일 알림','동일한 소식을 확인된 이메일로 수신',1)+sw('선물 소식 바로 받기','끄면 하루 한 번 오후 7시에 모아서 보냅니다',0)+CRMUST+(msg?`<div style="margin-top:8px">${msg}</div>`:''),5)
  +`<p class="more1">받는 주소·차단한 팬·선물 받기는 ‘<a href="#">상세 설정</a>’에서 관리해 주세요.</p>`
  +`<div class="quit" style="margin-top:24px"><div class="row"><p class="txt"><span class="k">회원 탈퇴</span><span class="s">탈퇴 문의 및 절차 안내</span></p>${B('탈퇴 안내','sm danger')}</div></div>`,'creator','');
};
/* ---------- 6 /creator/settings ---------- */
const swatches=['#FFE0E6','#FFE3CC','#FFF1B8','#DDF3D3','#D3F0EA','#DCE9FF','#E6E0FF','#F7DDF2'];
const cardPrev=(sym)=>`<div class="cc" role="group" aria-label="크리에이터 카드 미리보기"><div class="cv"><img src="${GIFT}" alt=""></div><div class="cb"><p class="nr">하루 <span class="fb">${sym?'':''}하루별</span></p><p class="s" style="font-size:14px">하루의 놀이터 · 게임 방송을 해요.</p><div class="chips"><span class="ct z"><i></i>치지직</span><span class="ct v"><i></i>버추얼</span></div></div><div class="ft2">${B('팔로우','line sm block','style="width:100%"')}</div></div>`;
const fandom=k=>{
  const nosym=k==='fresh', er=k==='fresh';
  return `<section id="fandom"><h2 class="sec-t">팬덤</h2><div class="gi"><div class="panelc pform">
  <div class="sub">${fx(240,`<h3 class="stt"><span>팬덤 이름</span><span class="cnt">${nosym?'0':'3'}/10</span></h3>${fld(nosym?'':'하루별',nosym?'bad':'')}`)}<p class="hint">팬 배지에 표시되는 이름 · 최대 10자<br>사용할 수 없는 표현은 저장되지 않습니다.</p></div>
  <div class="sub"><h3 class="stt"><span>팬마크</span></h3><div class="bst">${nosym?'':'<span class="mk"><img src="assets/promise-lock.webp" alt=""></span>'}${B('팬마크 업로드','soft sm')}${nosym?'':B('삭제')}</div><p class="hint">JPG·PNG · 정사각형 이미지 권장<br>팬 배지에는 축소해서 표시됩니다.</p><div class="chk"><i></i><span>직접 제작했거나 사용 권한이 있는 이미지입니다</span></div></div>
  <div class="sub"><h3 class="stt"><span>테마 색</span></h3><p class="hint">배경 사진이 없을 때 카드 배경과 팬덤 배지에 적용됩니다. 사이트 버튼과 글자에는 적용되지 않습니다.</p><div class="sws">${swatches.map((c,i)=>`<span class="sw ${i===4&&!nosym?'on':''}"><i style="background:${c}"></i></span>`).join('')}<span class="swn ${nosym?'on':''}">선택 안 함</span></div></div>
  <div class="end">${er?'<p class="err" role="alert">팬덤 이름을 입력해 주세요.</p>':''}<div class="btns">${B('되돌리기','line')}${B('저장','')}</div></div></div>
  <aside class="pv" aria-labelledby="pvt"><h3 id="pvt">미리보기</h3>${cardPrev()}</aside></div></section>`;
};
const status=(t,c)=>`<span class="bd ${c}">${t}</span>`;
const fold=(id,t,meta,open,body)=>`<details class="fold ${open?'open':''}" ${open?'open':''} id="${id}"><summary class="sm"><span>${t}</span>${meta||''}${chev}</summary>${open?`<div class="fb2">${body}</div>`:''}</details>`;
const sel=v=>fld(v,'sel');
const addrBody=reg=>`<div class="card soft"><img src="assets/icon-address-lock.png" alt="" width="72" height="72" style="width:72px;height:72px"><p class="t">${reg?'주소 등록 완료':'등록된 주소 없음'}</p>${reg?'<p>집 · 10월 28일 등록</p>':''}<p>${reg?'주소는 암호화해 보관합니다. 선물 승인 후 배송에 필요한 경우에만 확인합니다.':'등록한 주소는 암호화해 보관합니다. 선물 승인 후 배송에 필요한 경우에만 확인합니다.'}</p></div><p class="meta s">${reg?'송장 출력 전인 선물부터 변경된 주소로 배송됩니다.':'송장 출력 전인 선물부터 등록한 주소로 배송됩니다.'}</p><p class="s">팬꾹은 채팅·이메일·전화로 주소를 요청하지 않습니다. 주소 재입력을 요구하는 연락에 응답하지 마세요.</p><div>${B(reg?'주소 변경':'주소 등록','line')}</div>`;
const recvBody=()=>`<section class="card"><h3>선물 받기</h3><div class="gr c2" role="radiogroup" aria-label="받는 상태"><span class="opt"><i></i>받는 중</span><span class="opt on"><i></i>쉬는 중</span></div><div><p class="k" style="margin-bottom:8px">다시 받는 날</p>${fld('2026-11-15','',200)}<p class="hint">선택 가능: 내일~1년 이내 · 선택한 날짜 0시에 선물 받기 재개<br>쉬는 동안에도 기존 선물의 승인·거절은 가능합니다.</p></div><div><p class="k" style="margin-bottom:8px">팬 1명당 월 선물 한도</p>${fld('정하지 않음','sel',240)}<p class="hint">한도에 도달한 팬은 다음 달 1일부터 다시 보낼 수 있습니다. 설정한 한도는 크리에이터 페이지에 표시되지 않습니다.</p></div><div>${B('선물 받기 설정 저장','')}</div></section>
<section class="card"><h3>생일과 기념일</h3><p>크리에이터 페이지에 30일 전부터 D-day 표시 · 월·일만 입력</p><div><p class="k" style="margin-bottom:8px">생일</p><div class="bst">${fld('3월','sel',120)}${fld('14일','sel',100)}</div></div><div><p class="k" style="margin-bottom:8px">기념일 (5개까지)</p><div class="bst">${fld('데뷔 기념일','',240)}${fld('5월','sel',120)}${fld('2일','sel',100)}${B('삭제')}</div><div style="margin-top:12px">${B('기념일 추가','line sm')}</div><p class="hint">기념일 이름: 최대 20자<br>기념일 7일 전부터 팬이 ‘기념일 선물’ 표시를 선택할 수 있습니다.</p></div><div>${B('생일·기념일 저장','')}</div></section>
<section class="card"><h3>받기 어려운 선물</h3><p>선택한 선물 종류와 이유가 크리에이터 페이지에 안내 문구로 표시됩니다. 문구는 직접 입력할 수 없습니다.</p><div class="card soft"><p class="meta">현재 안내 문구</p><p class="t">현재 받기 어려운 선물이 없습니다.</p></div><div><p class="k" style="margin-bottom:8px">선물 종류 (복수 선택)</p><div class="gr c4"><span class="opt sq on"><i></i>인형·쿠션</span><span class="opt sq"><i></i>의류</span><span class="opt sq on"><i></i>음식</span><span class="opt sq"><i></i>전자기기</span></div></div><div><p class="k" style="margin-bottom:8px">이유</p><div class="gr c4"><span class="opt on"><i></i>이미 많이 받음</span><span class="opt"><i></i>보관 공간 부족</span><span class="opt"><i></i>일시 부재</span><span class="opt"><i></i>이유 표시 안 함</span></div></div><div><p class="k" style="margin-bottom:8px">기간</p><div class="gr c4"><span class="opt"><i></i>1주</span><span class="opt on"><i></i>2주</span><span class="opt"><i></i>한 달</span><span class="opt"><i></i>직접 해제할 때까지</span></div></div><div><p class="k" style="margin-bottom:8px">해당 선물 선택 시</p><div class="gr c2"><span class="opt on"><i></i>안내만 표시</span><span class="opt"><i></i>선물 등록 제한</span></div></div><div class="bst">${B('받기 어려운 선물 저장','')}${B('해제','line')}</div></section>`;
const blockBody=n=>n?`<ul class="gr c2" style="margin:0;padding:0">${['달토끼','솜솜'].map(x=>`<li class="card soft" style="padding:24px"><div class="who">${FC('md')}<div><p class="t">${x}</p><p class="s">10월 30일 차단</p></div></div><div style="margin-top:16px">${B('차단 해제','line sm','style="width:100%"')}</div></li>`).join('')}</ul><p class="s">차단을 해제해도 주소는 공개되지 않습니다. 새 선물은 건별로 카카오톡 서명을 거쳐 승인해야 배송됩니다.</p>`:`<p class="s">차단한 팬이 없습니다.</p><p class="s">차단을 해제해도 주소는 공개되지 않습니다. 새 선물은 건별로 카카오톡 서명을 거쳐 승인해야 배송됩니다.</p>`;
const linkBody=()=>`<section class="card"><h3>선물 링크</h3><div><p class="k" style="margin-bottom:8px">링크 주소</p><div class="hr"><b>fankkuk.kr/</b>${fld('haru_play','',280)}</div><p class="hint">선물 링크 주소: fankkuk.kr/입력한주소<br>영문·숫자·밑줄(_) 3~20자 · 로그인 아이디와 다르게 설정<br>방송·SNS에 공개되는 주소입니다.</p></div><div><p class="t">fankkuk.kr/haru_play</p><p class="s">이 주소로 내 페이지에 접속할 수 있습니다.</p></div><div class="bst">${B('복사','line sm')}${B('링크 주소 변경','sm')}</div><p class="s">프로필 사진·배경 사진은 ‘<a href="#" style="display:inline-flex;align-items:center;min-height:44px;font-weight:600;text-decoration:underline;text-underline-offset:4px">프로필 수정</a>’에서 바꿀 수 있습니다.</p></section>`;
const replyBody=()=>`<section class="card"><h3>감사 답장</h3><div class="swr"><div><b>답장 모음 공개</b><small>팬이 공개에 동의한 답장을 내 수령 확인일 3일 후부터 선물 링크 페이지에 표시</small></div><span class="trk old on" role="img" aria-label="켜짐"></span></div><div><p class="k" style="margin-bottom:8px">X 계정</p><div class="hr"><b>@</b>${fld('haru_play','',240)}</div><p class="hint">영문·숫자·밑줄 1~15자 · 선택 입력</p></div><div class="swr"><div><b>X 계정 태그 허용</b><small>팬이 답장 카드를 X에 공유할 때 내 계정 태그 포함<br>공유 문구: @haru_play 고마워요!</small></div><span class="trk old" role="img" aria-label="꺼짐"></span></div><div>${B('감사 답장 설정 저장','')}</div></section>`;
const crSettings=k=>{
  const linked=k!=='fresh';
  const B2=k==='B';
  const sigRow=linked?`<div class="lkrow"><span>승인 서명</span>${status('연결됨','ok')}<span class="fm">10월 31일 (토)</span>${B('다시 연결')}</div>`
   :`<a class="lkrow" href="#"><span>승인 서명 연결하기</span>${status('연결 전','nn')}${chev.replace('class="chev"','class="chev" style="transform:rotate(-90deg)"')}</a>`;
  const reg=k!=='fresh';
  const o=(id)=>k===id;
  const mt=(t,c)=>`<span class="mt">${status(t,c)}</span>`;
  return `<header class="ph"><div class="phrow"><h1>상세 설정</h1></div><p class="phd">팬덤·받는 주소·선물 받기·차단한 팬·선물 링크·감사 답장을 관리합니다.</p></header>
  <nav class="jump" aria-label="상세 설정 구간"><a href="#fandom">팬덤</a><a href="#more">받는 주소·받기 설정·차단한 팬</a></nav>
  ${fandom(k)}
  <section id="more" class="more" aria-labelledby="more-h"><h2 class="sec-t" id="more-h" style="margin-bottom:16px">주소와 설정</h2>
  ${sigRow}
  ${fold('address','받는 주소',mt(reg?'등록됨':'등록 전',reg?'ok':'nn'),o('addr'),addrBody(reg))}
  ${fold('receiving','받기 설정',mt(o('recv')?'쉬는 중':'받는 중',o('recv')?'wr':'ok'),o('recv'),recvBody())}
  ${fold('blocked','차단한 팬',`<span class="fm">${o('blocked')?2:0}명</span>`,o('blocked')||o('blockedNone'),blockBody(o('blocked')))}
  ${fold('gift-link','선물 링크','',o('link'),linkBody())}
  ${fold('thanks','감사 답장','',o('reply'),replyBody())}
  </section>`;
};
const settings=k=>{
  const inner=crSettings(k);
  return shell(inner,'creator','상세 설정',{w:k==='B'?'':'w1200'});
};
/* ---------- 7 /creator/profile ---------- */
const TAGS=[['SOOP',0],['치지직',1],['유튜브',0],['알플레이',0],['인스타그램',0],['X',0],['스레드',0],['틱톡',0],['버추얼',1]];
const crProfile=k=>{
  const nop=k==='empty', er=k==='err';
  const photoSub=(label,hint,id)=>`<div class="stt" style="display:block"><p class="stt" style="margin-bottom:8px">${label}</p><div class="bst">${B(label+' 변경','line sm')}${nop?'':B(label==='배경 사진'?'배경 사진 삭제':'사진 삭제','line sm')}</div>${hint}</div>`;
  return shell(head('프로필 수정','팬에게 공개되는 프로필입니다. 변경할 내용을 미리보기에서 확인해 주세요.')
  +`<div class="gi" style="--pv:400px"><div style="display:grid;gap:24px;min-width:0">
  <section class="panelc pform"><div class="sub"><h2 class="pt">사진</h2><p class="k">배경 사진</p><div class="bst">${B('배경 사진 변경','line sm')}${nop?'':B('배경 사진 삭제','line sm')}</div><p class="hint">JPG·PNG·WebP · 가로형 사진 권장<br>업로드 시 위치 정보 등 사진에 포함된 부가 정보는 삭제됩니다. 사진 미등록 시 테마 색이 표시됩니다.</p><p class="hint">권장 크기 1200×600px</p></div><div class="sub last"><p class="k">프로필 사진</p><div class="bst">${B('프로필 사진 변경','line sm')}${nop?'':B('사진 삭제','line sm')}</div></div></section>
  <form class="panelc pform"><div class="sub"><h2 class="pt">소개</h2><label class="stt"><span>공개 이름</span></label>${fld('하루','',360)}<p class="hint">팬에게 표시되는 이름</p></div>
  <div class="sub"><div class="stt"><span>한 줄 소개 <span class="cnt" style="font-weight:400">(40자까지)</span></span><span class="cnt">10/40</span></div>${fld('게임 방송을 해요.','ta')}</div>
  <div class="sub"><p class="stt"><span>태그</span></p><div class="chips">${TAGS.map(([t,on])=>`<span class="pk ${on?'on':''}"><i></i>${t}${on?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7"/></svg>':''}</span>`).join('')}</div><p class="k" style="margin-top:16px">태그 직접 입력 (최대 1개)</p>${fld('예: 팝콘TV','ph0'+(er?' bad':''),360)}<p class="hint">활동 플랫폼과 방송 분야를 선택해 주세요.<br>선택·직접 입력 합계: 1~5개 · 현재 2개<br>직접 입력: 최대 20자<br>직접 입력한 태그는 선택한 태그 뒤에 표시됩니다. 욕설·연락처·주소는 입력할 수 없습니다.</p></div>
  <div class="sub last"><div class="swb" style="padding:0"><strong>크리에이터 찾기에 보이기</strong><span class="trk on" role="img" aria-label="켜짐"></span></div></div>
  <div class="end">${er?'<p class="err" role="alert">직접 입력한 태그에는 욕설·연락처·주소를 쓸 수 없습니다.</p>':''}<div class="btns">${B('취소','line')}${er?B('저장 중','off','aria-disabled="true"'):B('저장','')}</div></div></form></div>
  <aside class="pv" aria-labelledby="pe-pv"><h3 id="pe-pv">프로필 머리 미리보기</h3><section class="head"><div class="cv">${nop?'':`<img src="${GIFT}" alt="">`}</div><div class="hb"><span class="av">${nop?'하':`<img src="${GIFT}" alt="">`}</span><div><p class="nn2">하루 <span class="fb">하루별</span></p><p class="s">게임 방송을 해요.</p></div></div></section></aside></div>`,'creator','프로필 수정',{w:'w1200'});
};
/* ---------- 8 /creator/customize ---------- */
const NS=[['정사각',1080,1080],['세로 (스토리용)',1080,1920],['가로',1920,1080]];
const customize=k=>{
  const ready=k==='ready', nosym=k==='nosym';
  const sizes=ready?`<ul class="szs">${NS.map(([t,w,h])=>{const q=46/Math.max(w,h);return `<li><span class="th"><i style="width:${Math.round(w*q)}px;height:${Math.round(h*q)}px"></i></span><span class="szt"><span class="k">${t}</span><span class="s">${w} × ${h}</span></span><span class="btns">${B('다운로드')}${B('링크 복사')}</span></li>`}).join('')}</ul>`
    :`<p class="lock">채널 소유자 확인 후 ‘<a href="#">상세 설정 &gt; 선물 링크</a>’에서 링크 주소를 등록하면 다운로드할 수 있습니다.</p>`;
  return shell(head('내 팬꾹 꾸미기','선물 링크의 공유 이미지와 공지 이미지를 설정합니다.')
  +`<section class="grp"><h2 class="nm">링크 미리보기 이미지</h2><div class="rows" style="padding-top:4px"><p class="s">메신저·SNS에 선물 링크를 공유할 때 표시되는 이미지입니다.</p><div class="picks" role="radiogroup"><span class="po on"><i></i>프로필 사진</span><span class="po ${nosym?'dis':''}"><i></i><span>팬마크${nosym?'<small><a href="#">팬마크 등록</a> 후 선택 가능</small>':''}</span></span></div><div style="min-height:22px;margin-top:8px">${nosym?'<p class="err" role="status">저장하지 못했습니다. 다시 선택해 주세요.</p>':''}</div><div style="margin-top:16px"><p class="cap">링크 공유 미리보기</p><div class="shc"><div class="im"><b><img src="${GIFT}" alt=""></b></div><p>하루 · 팬꾹</p></div></div></div></section>`
  +`<section class="grp"><h2 class="nm">공지 이미지 다운로드</h2><div class="rows" style="padding-top:4px"><p class="s">내 채널에 선물 링크를 알릴 때 사용하는 이미지입니다.<br>배경 사진·프로필 사진·이름·소개·‘팬꾹으로 선물 보내기’ 문구·링크 주소가 포함됩니다.<br>스토리에서는 이미지 속 주소를 누를 수 없으니 링크 스티커를 추가해 주세요.</p>${sizes}</div></section>`,'creator','꾸미기');
};

/* ---------- 탭 ---------- */
const TABS={
me:{label:'계정 설정(팬)',route:'/me',states:{base:{label:'받을 주소 없음',now:'me',render:()=>me('base')},addr:{label:'받을 주소 등록됨(삭제 확인)',render:()=>me('addr')},err:{label:'저장 오류',render:()=>me('err')},saving:{label:'저장 중',render:()=>me('saving')},pend:{label:'저장됨 · 새 이메일 확인 대기',render:()=>me('pend')},gmail:{label:'목록 도메인(gmail.com)',render:()=>me('gmail')}},
 changes:CH.me[0],keep:CH.me[1]},
profile:{label:'프로필 수정(팬)',route:'/me/profile',states:{base:{label:'사진 없음 · 소개 비어 있음',now:'me-profile',render:()=>meProfile('base')},photo:{label:'사진 있음 · 저장됨',render:()=>meProfile('photo')},err:{label:'닉네임 오류',render:()=>meProfile('err')}},changes:CH.profile[0],keep:CH.profile[1]},
following:{label:'팔로우한 크리에이터',route:'/me/following',states:{list:{label:'7명',now:'me-following',render:()=>following('list')},empty:{label:'0명',render:()=>following('empty')}},changes:CH.following[0],keep:CH.following[1]},
email:{label:'이메일 확인',route:'/me/email/confirm',states:{ready:{label:'확인 전',now:'me-email-confirm',render:()=>emailC('ready')},sending:{label:'확인 중',render:()=>emailC('sending')},done:{label:'확인 완료',render:()=>emailC('done')},failed:{label:'실패(만료 등)',render:()=>emailC('failed')},anon:{label:'로그인 안 함',render:()=>emailC('anon')}},changes:CH.email[0],keep:CH.email[1]},
account:{label:'계정 설정(크리에이터)',route:'/creator/account',states:{ver:{label:'채널 확인됨',now:'creator-account',render:()=>crAccount('ver')},err:{label:'확인 전 · 번호 없음 · 저장 오류',render:()=>crAccount('err')},saved:{label:'확인 전 · 알림 저장됨',render:()=>crAccount('saved')}},changes:CH.account[0],keep:CH.account[1]},
settings:{label:'상세 설정',route:'/creator/settings',states:{closed:{label:'접힘(전부)',now:'creator-settings',render:()=>settings('closed')},addr:{label:'받는 주소 펼침',render:()=>settings('addr')},recv:{label:'받기 설정 펼침',render:()=>settings('recv')},blocked:{label:'차단한 팬 있음',render:()=>settings('blocked')},blockedNone:{label:'차단한 팬 없음',render:()=>settings('blockedNone')},link:{label:'선물 링크 펼침',render:()=>settings('link')},reply:{label:'감사 답장 펼침',render:()=>settings('reply')},fresh:{label:'승인 서명 연결 전 · 팬마크 없음 · 저장 오류',render:()=>settings('fresh')},B:{label:'비교안 B(전체 880 한 기둥)',render:()=>settings('B')}},changes:CH.settings[0],keep:CH.settings[1]},
cprofile:{label:'프로필 수정(크리에이터)',route:'/creator/profile',states:{base:{label:'사진 있음',now:'creator-profile',render:()=>crProfile('base')},empty:{label:'사진 없음',render:()=>crProfile('empty')},err:{label:'태그 오류 · 저장 중',render:()=>crProfile('err')}},changes:CH.cprofile[0],keep:CH.cprofile[1]},
customize:{label:'꾸미기',route:'/creator/customize',states:{base:{label:'공지 이미지 받기 전(안내)',now:'creator-customize',render:()=>customize('base')},ready:{label:'공지 이미지 세 크기',render:()=>customize('ready')},nosym:{label:'팬마크 없음 · 저장 오류',render:()=>customize('nosym')}},changes:CH.customize[0],keep:CH.customize[1]}
};
