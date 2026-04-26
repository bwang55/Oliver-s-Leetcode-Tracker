# Manual Ops (out-of-code Phase 7 steps)

These can't be done by code — the user must do them in the AWS Console / OpenAI dashboard.

## 1. Connect repo to Amplify Hosting (first-time prod deploy)

1. Push the repo to GitHub.
2. AWS Console → Amplify → "Create new app" → "Host web app".
3. Connect GitHub, select the `main` branch.
4. Amplify auto-detects `amplify.yml`. Confirm.
5. Click "Save and deploy". First deploy creates the prod backend stack.

After deploy, copy the `https://main.<APP_ID>.amplifyapp.com/` URL. Add it to Cognito callback URLs (in `amplify/auth/resource.ts` if email/password is sufficient; in `mcpClient` if Google federation is added in Phase 7+).

## 2. Set prod-environment secrets (Amplify Console)

Amplify Hosting → app → "Secrets" tab → set per-branch:
- `OPENAI_API_KEY` for branch `main`.
- (Phase 7+) `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` if enabling Google OAuth.
- `OPS_ALARM_EMAIL` env var → set to your real email so alarm emails arrive.

## 3. AWS Budgets

AWS Console → Billing → Budgets → "Create budget":
- Cost budget, $20/month (adjust for your tolerance).
- Email alerts at 80% and 100% actual spend.

## 4. OpenAI dashboard budget cap

OpenAI Console → Workspaces → Settings:
- Set monthly budget cap to e.g. $10/month.
- Configure email alerts for 80% and 100%.

## 5. Verify alarms get the right email

Once `OPS_ALARM_EMAIL` is set in prod, AWS sends a confirmation email to that address asking you to subscribe to the SNS topic. **You must confirm** — otherwise alarms go nowhere.

## 6. Final smoke test

- Open `https://main.<APP_ID>.amplifyapp.com/` from a fresh browser (incognito).
- Sign up with a fresh email.
- Confirm via the email Cognito sends.
- Paste a real Leetcode solution into the composer; chat drawer opens; Curator extracts and adds the tile.
- Try "Analyze my weak spots this week" → routes to Analyst.
- Try "Make me a 5-day plan focused on graphs" → routes to Planner.
- Click "Export my data" in the avatar dropdown; verify the JSON downloads.
- (Optional) Connect Claude Desktop to the MCP server URL from `amplify_outputs.json.custom.mcpServerUrl`.
