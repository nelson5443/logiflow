@echo off
echo ========================================
echo LogiFlow Railway Deployment
echo ========================================
echo.

echo Step 1: Railway Login
echo Opening browser for Railway login...
railway login

echo.
echo Step 2: Initialize Project
railway init

echo.
echo Step 3: Deploy
railway up

echo.
echo Deployment completed!
echo Your app will be available at the Railway URL shown above.
pause