@echo off
setlocal
echo [Antigravity] Firebase 배포 디버깅 모드를 시작합니다...

echo 1. 프로젝트 설정 확인...
if not exist ".firebaserc" (
    echo [ERROR] .firebaserc 파일이 없습니다! 생성 중...
    echo {"projects":{"default":"ai-travel-planner-v2-3904"}}> .firebaserc
)

echo 2. 로컬 빌드 수행 (Vite)...
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 빌드에 실패했습니다. npm install이 필요할 수 있습니다.
    pause
    exit /b %ERRORLEVEL%
)

echo 3. Firebase 로그인... (브라우저에서 로그인 버튼을 눌러주세요)
call npx firebase-tools login
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 로그인에 실패했습니다.
)

echo 4. Firebase Hosting 배포 실행...
call npx firebase-tools deploy --only hosting --project ai-travel-planner-v2-3904
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] 배포 도중 에러가 발생했습니다.
    pause
) else (
    echo [Antigravity] 배포가 성공적으로 완료되었습니다!
    echo URL: https://ai-travel-planner-v2-3904.web.app
)

pause
