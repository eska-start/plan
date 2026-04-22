# Travel Planner

사내 네트워크에서 `localhost` 접속이 어려운 경우를 위해, 이 프로젝트는 클라우드 URL로 바로 배포해서 볼 수 있도록 구성했습니다.

## 빠른 실행 (로컬)

```bash
pnpm install
pnpm dev
```

기본 주소: `http://localhost:3000`

---

## 웹페이지로 보기 (Render 배포)

이 저장소에는 Render용 배포 파일이 포함되어 있습니다.

- `render.yaml`
- `Dockerfile`

### 배포 절차

1. Render 접속 후 **New + → Blueprint**
2. GitHub 저장소 연결
3. `render.yaml` 자동 인식 확인
4. 환경변수 입력 후 Deploy
5. 배포 완료되면 `https://<서비스명>.onrender.com` 주소로 접속

### 필요한 환경변수

```bash
PORT=3000
NODE_ENV=production

VITE_GOOGLE_LOGIN_URL=
# 또는 아래 조합
VITE_OAUTH_PORTAL_URL=
VITE_APP_ID=
OAUTH_SERVER_URL=

JWT_SECRET=
DATABASE_URL=
OWNER_OPEN_ID=
```

---

## GitHub Codespaces로 바로 보기 (대안)

1. GitHub에서 **Code → Codespaces → Create codespace**
2. 터미널에서 실행:

```bash
pnpm install
pnpm dev
```

3. `PORTS` 탭에서 3000 포트를 **Public**으로 변경
4. 생성된 `https://...app.github.dev` 링크로 접속
