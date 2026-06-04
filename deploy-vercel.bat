@echo off
echo Starting LogiFlow deployment to Vercel...

echo.
echo Step 1: Installing dependencies...
call npm install

echo.
echo Step 2: Deploying to Vercel...
call vercel --prod

echo.
echo Deployment complete!
echo.
echo Next steps:
echo 1. Set up your Supabase project at https://supabase.com
echo 2. Run the SQL from supabase-setup.sql in your Supabase SQL editor
echo 3. Add environment variables in Vercel dashboard:
echo    - SUPABASE_URL
echo    - SUPABASE_ANON_KEY
echo    - SUPABASE_SERVICE_KEY
echo 4. Redeploy after adding environment variables

pause