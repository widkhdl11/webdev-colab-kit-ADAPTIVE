# 서명 게이트웨이 (sign.fankkuk.com)

카카오 인증서 전자서명 요청을 **고정 IP 서버에서** 드림시큐리티로 보내는 작은 서버다.
딜러사는 등록된 IP 에서 온 요청만 받으므로, Vercel(IP 가 바뀜)이 직접 부르지 않고 이 서버를 거친다
(승인 서명 스펙 INV-S10).

```
Vercel 앱 서버 ──(HTTPS + 비밀 토큰)──▶ 이 서버 ──(HTTPS, 허용 목록)──▶ 드림시큐리티 / 카카오
```

- 드림시큐리티·카카오·KMS 키는 이 서버의 `/etc/sign-gateway/sign-gateway.env` 에만 있다. Vercel·저장소에는 없다.
  Vercel 에는 이 서버를 부를 토큰(`GATEWAY_TOKEN` 값) 하나만 `SIGN_GATEWAY_TOKEN` 으로 넣는다.
- 외부 도움 프로그램(npm 패키지)이 하나도 없다. Node 20 이상만 있으면 된다.

## 요청 형식

| 요청 | 본문 | 응답 |
|---|---|---|
| `GET /healthz` (토큰 없음) | — | `{ ok: true }` — 어댑터 준비 여부는 로그(`journalctl`) 첫 줄에 |
| `POST /v1/sign/requests` | `{ requestId, plaintext, signer }` | `201 { requestId, txId, expiresAt }` |
| `POST /v1/sign/requests/:requestId/result` | `{ txId, plaintext }` | `200 { state }` — `pending`·`rejected`·`expired`, 또는 `signed` 이면 `method`·`signedPlaintext`·`signerId`·`signature`·`certificate` 도 |

- 모든 `POST` 는 `Authorization: Bearer <토큰>` 이 있어야 한다. 없거나 틀리면 401.
- `signed` 는 이 서버가 서명 값을 직접 검증했고, 서명된 원문이 보낸 `plaintext` 와 바이트 단위로 같을 때만 나온다.
  다르면 409, 서명 값이 틀리면 422. 앱 서버는 돌려받은 원문을 자기가 저장한 원문과 **다시** 대조한다.
- 드림시큐리티 어댑터가 준비되지 않았으면(키 미입력 또는 명세 반영 전) 503 `adapter_not_ready`.
- `SIGN_ADAPTER=test` 는 가짜 서명이고 `method: "fake"` 로 나온다. `signer` 에 `{ subjectId, outcome }` 을 넣어
  결과를 고를 수 있다(`signed`·`pending`·`rejected`·`expired`·`tampered`·`badsig`).

## 새 서버에 올리기

준비: Ubuntu 24.04 이상, 도메인 A 레코드가 그 서버 IP 를 가리킴, 보안 그룹 22(내 IP)·80·443 열림.

```bash
# 내 PC 에서 (projects/fankkuk 폴더)
scp -i <키.pem> -r sign-gateway ubuntu@<서버IP>:/tmp/sgw-new/
ssh -i <키.pem> ubuntu@<서버IP> 'sudo bash /tmp/sgw-new/sign-gateway/deploy/install.sh <도메인>'
```

설치 스크립트가 하는 일 — 여러 번 돌려도 되고, 이미 있는 환경 변수 파일·인증서는 건드리지 않는다.

1. `nodejs`·`certbot`·`ufw`·`unattended-upgrades` 설치, 보안 업데이트 자동 설치 켬
2. 스왑 1GB (512MB 급 서버에서 apt 가 메모리 부족으로 죽지 않게)
3. 서비스 계정 `sign-gateway`, 코드 `/opt/sign-gateway`
4. 환경 변수 파일 `/etc/sign-gateway/sign-gateway.env` — 처음이면 틀에서 만들고 `GATEWAY_TOKEN` 만 무작위로 채움
5. 방화벽: 들어오는 것은 22·443 만. 80 은 닫음
6. Let's Encrypt 인증서 — 받는 동안만 80 을 열었다 닫음. 갱신(`certbot.timer`, 하루 두 번 확인)도 같은 훅으로 80 을 그때만 엶
7. systemd 서비스 `sign-gateway` 시작, `https://<도메인>/healthz` 확인, 나가는 IP 출력

코드만 바꿔 다시 올릴 때도 같은 두 줄이다.

## 자주 쓰는 명령 (서버에서)

```bash
sudo nano /etc/sign-gateway/sign-gateway.env && sudo systemctl restart sign-gateway   # 값 채우고 재시작
sudo journalctl -u sign-gateway -n 50 --no-pager                                     # 로그 (원문·서명은 남기지 않음)
sudo grep '^GATEWAY_TOKEN=' /etc/sign-gateway/sign-gateway.env                        # Vercel 에 넣을 토큰 보기
sudo certbot renew --dry-run && sudo ufw status                                       # 갱신 리허설 → 80 이 다시 닫혔는지
```

토큰 교체: 새 값을 `GATEWAY_TOKEN_NEXT` 에 넣고 재시작 → Vercel 을 새 값으로 바꿈 → `GATEWAY_TOKEN` 을 새 값으로 옮기고
`GATEWAY_TOKEN_NEXT` 를 비운 뒤 재시작.

## 밖으로 나가는 요청

- 허용 범위는 코드(`lib/config.mjs` 의 `ALLOWED_HOST_SUFFIXES`)에 박힌 `dreamsecurity.com`·`kakao.com` 아래뿐이다.
  환경 변수 `OUTBOUND_ALLOWED_HOSTS` 에는 그 안의 정확한 호스트 이름을 적는다. 범위 밖을 적으면 서버가 뜨지 않는다.
- https·443 포트만, IP 를 직접 적은 주소는 거부, DNS 가 내부망 주소(사설·루프백·169.254.x.x 등)로 풀리면 연결하지 않는다,
  리다이렉트는 따라가지 않는다.
- 서비스 설정으로 169.254.0.0/16·fd00:ec2::254(인스턴스 메타데이터)도 막혀 있다 — 코드와 별개로 한 겹 더.
- KMS·택배사를 이 서버에서 부르게 되면 그 도메인을 `ALLOWED_HOST_SUFFIXES` 에 더한다(코드 변경 = 리뷰 대상).

## KMS 키와 IAM 사용자

정책은 두 겹이다. 둘 다 붙여야 「이 서버의 IAM 사용자만, 이 서버 IP 에서만, 키 하나를 암복호화」가 된다.

| 파일 | 붙이는 곳 | 하는 일 |
|---|---|---|
| `deploy/kms-key-policy.json` | KMS 키의 키 정책 | 계정 관리자는 키를 **관리만**(켜고 끄기·정책 수정·삭제 예약) 하고 암복호화는 못 한다. 암복호화는 `fankkuk-sign-gateway` 사용자만, 이 서버 IP 에서만. 기본 키 정책(계정 전체에 kms:* 위임)을 이것으로 **바꿔야** 앱 서버 등 다른 자격 증명이 키를 못 쓴다 |
| `deploy/kms-iam-policy.json` | IAM 사용자 `fankkuk-sign-gateway` | 그 사용자가 할 수 있는 일을 키 하나의 암복호화로 묶는다. 키가 새어도 이 서버 IP 밖에서는 거부된다 |

`<계정ID-12자리>`·`<KMS키ID>` 를 실제 값으로 바꿔 붙여 넣는다. 서버 IP 가 바뀌면 두 파일 다 바꾼다.
키 정책은 사용자 이름(ARN)을 가리키므로 **IAM 사용자를 먼저** 만들어야 저장된다.

## 시험

```bash
cd sign-gateway && node --test test/*.test.mjs
```

## 드림시큐리티 명세가 오면

`lib/adapters/dreamsecurity.mjs` 의 세 함수를 채운다. 파일 머리말에 할 일이 적혀 있다 —
서명 검증(인증서 체인·알고리즘·유효 기간·폐기 여부, 외부 연결 INV-S3)을 이 서버가 직접 하고,
딜러사 응답의 「성공」 표시만으로 `signed` 를 돌려주지 않는다.
