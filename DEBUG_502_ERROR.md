# Debugging 500/502 Errors

## Current Status: 500 Internal Server Error

You're now getting a 500 error instead of 502, which means the function is executing but encountering an error. Most likely cause: **missing environment variables**.

## Changes Made

### 1. Improved Error Handling in `supabaseInit.js`
- Changed from throwing error immediately to logging and continuing
- This prevents the function from crashing during module initialization
- Now logs whether environment variables are present

### 2. Added Validation in Main Handler
- Added Supabase client validation at the start of request processing
- Returns clear error message if environment variables are missing

### 3. Enhanced Logging
- Added timestamps and execution tracking
- Logs function invocation details
- Logs environment variable status on errors
- Better error messages for API fetch failures

### 4. Improved API Error Handling
- Wrapped API calls in try-catch
- Provides clearer error messages when external APIs fail

## Diagnostic Endpoints Created

I've created three test endpoints to help diagnose the issue:

1. **`/ping`** - Simple endpoint to verify functions work
2. **`/test-connection`** - Tests environment variables and Supabase connection
3. **`/check_existing_customer_statement`** - Your main endpoint

## Steps to Fix the Error

### Step 1: Deploy and Test Diagnostic Endpoints

First, deploy the changes:

```powershell
git add .
git commit -m "fix: add diagnostic endpoints and improve error handling"
git push origin main
```

Wait for Netlify to deploy (watch the deploy status in the Netlify dashboard).

Once deployed, test the endpoints in order:

**Test 1: Basic Function**
```
https://rapidtools-backend.netlify.app/.netlify/functions/ping
```
Expected: Should return `{"success": true, "message": "pong", ...}`

**Test 2: Environment & Connection**
```
https://rapidtools-backend.netlify.app/.netlify/functions/test-connection
```
Expected: Should show environment variable status and Supabase connection status

If test-connection shows `hasSupabaseUrl: false` or `hasSupabaseKey: false`, you need to add the environment variables (see Step 2).

### Step 2: Verify Environment Variables in Netlify

1. Go to [Netlify Dashboard](https://app.netlify.com/)
2. Select your site: `rapidtools-backend`
3. Navigate to **Site settings → Environment variables**
4. Verify these variables exist and have values:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`

If they're missing:
1. Click **Add a variable**
2. Add each variable with the correct value from your Supabase project
3. Redeploy your site

### Step 3: Add Missing Environment Variables (if needed)

If the test-connection endpoint shows environment variables are missing:

1. Get your Supabase credentials:
   - Go to [Supabase Dashboard](https://app.supabase.com/)
   - Select your project
   - Go to **Settings → API**
   - Copy:
     - **Project URL** (this is `SUPABASE_URL`)
     - **anon public** key (this is `SUPABASE_ANON_KEY`)

2. Add to Netlify:
   - Go to [Netlify Dashboard](https://app.netlify.com/)
   - Select your site: `rapidtools-backend`
   - Go to **Site configuration → Environment variables**
   - Click **Add a variable**
   - Add both variables:
     - Key: `SUPABASE_URL`, Value: [your project URL]
     - Key: `SUPABASE_ANON_KEY`, Value: [your anon key]
   - Click **Save**

3. Redeploy:
   - Go to **Deploys** tab
   - Click **Trigger deploy → Clear cache and deploy site**

### Step 4: Check Netlify Function Logs

After deployment:

1. Go to **Netlify Dashboard → Your Site → Logs**
2. Click on **Functions** tab
3. Try clicking the button again in your app
4. Watch the logs in real-time

Look for:
- `=== Function Invoked ===` - confirms function starts
- `Validating Supabase connection...` - confirms it reaches validation
- Any error messages with details about what failed

### Step 4: Check for Timeout Issues

If the logs show the function starts but times out:

**Free Tier**: Functions timeout after 10 seconds
**Pro Tier**: Functions timeout after 26 seconds

Your function makes multiple API calls and processes data, which might exceed the limit.

Solutions:
- Upgrade to Netlify Pro for longer timeouts
- Optimize the function to process less data
- Add pagination to break up large requests

### Step 5: Test Locally

Test the function locally before deploying:

```powershell
# Create a .env file for local testing
$envContent = @"
SUPABASE_URL=your_supabase_url_here
SUPABASE_ANON_KEY=your_supabase_key_here
"@
$envContent | Out-File -FilePath .env -Encoding utf8

# Install dependencies
npm install

# Run locally
netlify dev
```

Then test at: `http://localhost:8888`

## Common Causes of 502 Errors

1. **Missing Environment Variables** (Most Common)
   - Solution: Add them in Netlify dashboard

2. **Function Timeout**
   - Function takes longer than 10 seconds (free tier)
   - Solution: Optimize code or upgrade plan

3. **Unhandled Promise Rejection**
   - API calls fail without proper error handling
   - Solution: Already fixed with improved error handling

4. **Module Import Error**
   - Missing dependencies or initialization errors
   - Solution: Already fixed with safer initialization

5. **Memory Limit Exceeded**
   - Function uses too much memory
   - Free tier: 1024 MB limit
   - Solution: Optimize data processing

## Quick Fix Summary

**Most likely your issue:** Missing `SUPABASE_URL` and `SUPABASE_ANON_KEY` environment variables in Netlify.

**To fix:**

1. **Deploy the code:**
   ```powershell
   git add .
   git commit -m "fix: add diagnostics and improve error handling"
   git push origin main
   ```

2. **Test the diagnostic endpoint:**
   - Visit: `https://rapidtools-backend.netlify.app/.netlify/functions/test-connection`
   - Check if `hasSupabaseUrl` and `hasSupabaseKey` are both `true`

3. **If environment variables are missing:**
   - Get credentials from Supabase Dashboard → Settings → API
   - Add them to Netlify → Site configuration → Environment variables
   - Redeploy: Deploys → Trigger deploy → Clear cache and deploy site

4. **Test again:**
   - Visit: `https://rapidtools-backend.netlify.app/.netlify/functions/check_existing_customer_statement`
   - Should now work or give you a clear error message

## Debugging in Netlify Dashboard

1. Go to your site in Netlify
2. Click **Logs** in the left sidebar
3. Click **Functions** tab
4. You'll see real-time logs showing:
   - `=== Function Invoked ===`
   - Environment variable status
   - Any error messages

If still having issues, check the logs and share the error message.
