@echo off
echo ========================================
echo LogiFlow Deployment Script
echo ========================================
echo.

echo Choose deployment platform:
echo 1. Vercel (Current)
echo 2. Railway 
echo 3. Render
echo 4. Heroku
echo.

set /p choice="Enter your choice (1-4): "

if "%choice%"=="1" (
    echo Deploying to Vercel...
    npm run deploy
) else if "%choice%"=="2" (
    echo Deploying to Railway...
    railway up
) else if "%choice%"=="3" (
    echo Deploying to Render...
    echo Please push to GitHub and connect to Render manually
    echo Render config file created: render.yaml
) else if "%choice%"=="4" (
    echo Deploying to Heroku...
    heroku create logiflow-logistics
    git push heroku main
) else (
    echo Invalid choice. Defaulting to Vercel...
    npm run deploy
)

echo.
echo Deployment completed!
pause