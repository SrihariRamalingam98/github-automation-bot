# Project instructions for AI collaborators
- Keep all GitHub, Slack and database credentials server-side and out of the repo.
- Treat GitHub webhooks as untrusted; validate the HMAC using raw bytes before parsing.
- Use PostgreSQL durable event rows; acknowledge only after the commit.
- Respect unique delivery IDs and do not apply the same side effect repeatedly.
- Prefer small, understandable modules and actionable error logs with no secrets.
- Do not claim testing or deployment happened without actual evidence.
- Keep README, .env.example, AI_NOTES.md current when making changes.
- Make all development/testing assertions honestly, especially limitations.
