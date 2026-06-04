@echo off
echo Deploying LogiFlow to Railway...
echo.

echo Step 1: Login to Railway
railway login

echo.
echo Step 2: Initialize project
railway init --name logiflow-logistics

echo.
echo Step 3: Deploy application
railway up

echo.
echo Deployment complete! Check the URL above.
pause