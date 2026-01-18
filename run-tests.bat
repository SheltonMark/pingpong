@echo off
echo ╔════════════════════════════════════════════════════════════════╗
echo ║          乒乓球小程序 - 一键测试                                ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
echo 正在运行自动化测试...
echo.

cd backend
set API_BASE_URL=https://express-lksv-207842-4-1391867763.sh.run.tcloudbase.com
node scripts/test-event-flow.js

echo.
echo 按任意键退出...
pause > nul
