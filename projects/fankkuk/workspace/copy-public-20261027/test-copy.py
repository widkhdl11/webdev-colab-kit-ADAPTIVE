from pathlib import Path
root=Path(__file__).resolve().parents[2]
replacements={
'채널 소유 확인':'채널 소유자 확인',
'치지직 채널 소유 확인':'치지직 채널 소유자 확인',
'보내주시는 마음 늘 감사해요':'보내 주시는 마음 늘 감사해요',
'잠시 선물 받기를 쉬고 있어요. 10월 20일부터 다시 받을게요':'선물 받기 일시 중단 · 10월 20일부터 재개',
'잠시 선물 받기를 쉬고 있어요. 10월 11일부터 다시 받을게요':'선물 받기 일시 중단 · 10월 11일부터 재개',
'분류를 골라 주세요.':'분류를 선택해 주세요.',
'주문번호는 FC-7K3M9 형식으로 적어 주세요.':'주문번호는 FC-7K3M9 형식으로 입력해 주세요.',
'제목은 1~100자로 적어 주세요.':'제목은 1~100자로 입력해 주세요.',
'내용은 1~4000자로 적어 주세요.':'내용은 1~4000자로 입력해 주세요.',
'지금은 1:1 문의를 남길 수 없어요.':'현재 1:1 문의 이용이 제한되어 있습니다.',
'문의 남기기':'문의 등록',
'1개 조에서 발견':'1개 항목에서 검색됨',
'4개 조에서 발견':'4개 항목에서 검색됨',
'찾는 낱말이 있는 조가 없어요.':'검색 결과가 없습니다.',
'1개 질문에서 발견':'1개 질문에서 검색됨',
'복사됨':'복사 완료',
'배송중':'배송 중',
}
files=[*root.glob('src/entities/creator/model/*test.ts'),*root.glob('src/features/inquiry-submit/**/*test.*'),*root.glob('src/widgets/legal/**/*test.*')]
for p in files:
 s=p.read_text(encoding='utf-8');old=s
 for a,b in replacements.items():s=s.replace(a,b)
 if s!=old:p.write_text(s,encoding='utf-8')
