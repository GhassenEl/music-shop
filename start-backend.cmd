@echo off
cd /d "%~dp0"
docker compose up -d
cd backend
call npm run wait-db
call npm run migrate
call npm run dev
