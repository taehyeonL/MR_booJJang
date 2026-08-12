# 배포 및 외부 서비스 연결

## 다른 PC에서 시작하기

이 저장소에는 Supabase 프로젝트 참조(`hbkqehvrgbnkfthsfppk`)와 모든 migration/Edge Function 소스가 포함되어 있다. 따라서 GitHub 저장소를 clone한 어느 PC에서든 아래 절차로 같은 백엔드를 관리할 수 있다.

1. Node.js 22.13 이상과 Git을 설치한 뒤 저장소를 clone하고 `npm install`을 실행한다.
2. Supabase Dashboard의 **Account > Access Tokens**에서 개인 액세스 토큰을 만든다. 이 토큰은 개인 PC의 CLI 로그인에만 입력하며, 채팅/문서/`.env`/Git에 저장하지 않는다.
3. 프로젝트 루트에서 다음을 실행한다. CLI가 토큰을 묻는 경우에만 입력한다.

   ```powershell
   npx supabase@latest login
   npx supabase@latest link --project-ref hbkqehvrgbnkfthsfppk
   ```

4. 적용 전에는 `git pull --ff-only`로 최신 migration을 받고, 아래 명령으로 데이터베이스를 적용한다.

   ```powershell
   npx supabase@latest db push
   ```

5. Dashboard 또는 CLI에서 서버 전용 시크릿을 설정한 다음 Edge Function을 배포한다. 값 목록은 루트 [`.env.example`](../.env.example)를 참고하되, 실제 `.env` 파일은 절대 커밋하지 않는다.

   ```powershell
   npx supabase@latest functions deploy create-reservation
   npx supabase@latest functions deploy cancel-reservation
   npx supabase@latest functions deploy list-reservations
   npx supabase@latest functions deploy dispatch-due-reservations
   npx supabase@latest functions deploy provider-webhook
   npx supabase@latest functions deploy call-instructions
   npx supabase@latest functions deploy ai-call-session
   ```

6. 모바일 앱은 `apps/mobile/.env.example`을 참고해 각 PC의 로컬 `.env`를 만든다. `EXPO_PUBLIC_SUPABASE_URL`은 이미 이 프로젝트 URL로 지정되어 있고, publishable key만 Dashboard에서 복사해 채운다. 서비스 역할 키, 음성 공급자 키, AI 키는 모바일 앱에 넣지 않는다.

> 배포 순서: Git pull → `db push` → Edge Function secrets 확인 → functions deploy → Scheduler/웹훅 확인. migration은 수정하지 말고 새 파일로 추가한다.

## Supabase

1. 프로젝트 참조는 `hbkqehvrgbnkfthsfppk`입니다. Dashboard에서 SMS Phone Auth를 활성화합니다.
2. `supabase db push`로 migration을 적용하고, 각 Edge Function을 배포합니다.
3. Edge Function secrets에는 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VOICE_*`, `AI_PROVIDER_API_KEY`, `APP_BASE_URL`, `SCHEDULER_SECRET`만 설정합니다. 값은 [`.env.example`](../.env.example)를 참고합니다.
4. 1분 주기 Scheduler가 `POST /functions/v1/dispatch-due-reservations`를 호출하도록 설정하고, `x-scheduler-secret`에 `SCHEDULER_SECRET`을 넣습니다.

## Voice provider

1. `VOICE_PROVIDER=mock`으로 예약·한도·상태 기능을 검증합니다. 이 모드는 실제 전화를 걸지 않습니다.
2. 실제 공급자 계약·검증된 발신 번호를 준비한 뒤 `VOICE_PROVIDER=twilio`과 `VOICE_ACCOUNT_ID`, `VOICE_AUTH_TOKEN`, `VOICE_FROM_NUMBER`, `APP_BASE_URL`을 설정합니다.
3. 공급자의 상태 callback URL을 `https://<project>.supabase.co/functions/v1/provider-webhook`으로 지정합니다. URL에는 `reservation_id`가 시스템이 생성한 call 생성 요청에서만 붙습니다.
4. 테스트 번호로 ringing, connected, no-answer, failed, 중복 callback을 각각 확인합니다.

## 출시 차단 조건

- 발신번호·자동 발신·개인정보 보관에 대한 국내 법률 검토가 끝나지 않은 경우
- 전화번호 인증, provider webhook 서명 검증, Scheduler secret 회전이 검증되지 않은 경우
- AI 음성 provider의 양방향 스트림과 보관·삭제 정책이 확정되지 않은 경우
