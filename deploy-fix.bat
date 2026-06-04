@echo off
echo Installing dependencies...
npm install

echo.
echo Dependencies installed!
echo.
echo Now you need to:
echo 1. Go to https://vercel.com/dashboard
echo 2. Find your logistics project
echo 3. Go to Settings - Environment Variables
echo 4. Add: JWT_SECRET = logiflow-secret-key-change-this-in-production-2024
echo 5. Then run: vercel --prod
echo.
pause