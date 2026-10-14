# Edge Journal

A trading journal for futures and forex traders. Log every trade with your reasoning and how you felt, then review your P&L by day, week, month and year to find what's actually making or costing you money.

## Features

- **Reports** for any day, week, month, year or all time, with comparison to the previous period
- **P&L calendar** with weekly totals and a year overview
- **Trade log** with automatic P&L, risk and R-multiple from prices, for futures (NQ, MNQ, GC, MGC, ES, CL and more) and forex (contracts or lots, points or pips)
- **Psychology tracking** on every trade: emotions before, during and after, confidence, stress, plan adherence, mistakes and an execution grade
- **Mindset insights** showing which emotions, mistakes, setups and sessions cost or make money
- **Prop account tracker** for profit target, trailing drawdown and daily loss limit, plus a projection to target
- **Daily journal** with a pre-market plan and end-of-day review
- **Google sign-in**; each user's data is private, enforced by Postgres row-level security
- CSV and JSON export, JSON import

## Stack

Plain HTML, CSS and JavaScript with no build step, [Supabase](https://supabase.com) for auth and Postgres, deployed on Vercel.

```
index.html          app shell
app.js              app logic, charts, reports, auth
app.css             styles
config.js           Supabase URL, publishable key, sign-in options
supabase/schema.sql tables, row-level security policies, triggers
privacy.html        privacy policy
terms.html          terms of use
```

## Running locally

1. Create a Supabase project and run `supabase/schema.sql` in the SQL editor.
2. Add the project URL and publishable key to `config.js`.
3. Enable Google under Authentication → Sign In / Providers, and add `http://localhost:3000/**` to the redirect URLs.
4. Run `npx serve .` and open http://localhost:3000.
