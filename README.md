# Edge Journal: website setup guide

This folder is the complete Edge Journal website. Anyone can sign in with Google, and each person gets their own private journal.

Plan on about an hour. You'll create free accounts on Supabase, Vercel and Google Cloud, and copy a few values between them. You don't need to write any code.

| File | What it is |
|---|---|
| `index.html`, `app.js`, `app.css` | The app itself |
| `config.js` | **The only file you edit.** Your Supabase address and key go here |
| `supabase/schema.sql` | Creates the database tables and the privacy rules |
| `privacy.html`, `terms.html` | Privacy Policy and Terms pages (fill in your name and email) |
| `icon.svg`, `manifest.webmanifest` | App icon. Lets people add the site to their phone's home screen |

---

## 1. Create a Supabase project

1. Go to **supabase.com** and sign up (signing in with GitHub is easiest).
2. Click **New project**.
   - **Name:** `edge-journal`
   - **Database password:** click Generate and save it somewhere safe.
   - **Region:** pick the one closest to you (for example, East US).
3. Click **Create new project** and wait a minute or two for it to finish setting up.

## 2. Create the database tables

1. In your project, open **SQL Editor** from the left sidebar, then click **New query**.
2. Open `supabase/schema.sql` from this folder, copy everything, paste it into the editor, and click **Run**.
3. You should see "Success. No rows returned."

This creates the `profiles`, `trades` and `journal_days` tables. It also creates the rules that let each person see only their own data.

## 3. Connect the website to Supabase

1. In Supabase, click **Connect** at the top of the project page. You can also find these values under **Settings → API Keys**.
2. Copy the **Project URL**. It looks like `https://abcdefgh.supabase.co`.
3. Copy the **Publishable key**, which starts with `sb_publishable_`. If you only see an "anon public" key, that works too.
4. Open `config.js` and paste both values:

```js
supabaseUrl: 'https://abcdefgh.supabase.co',
supabaseKey: 'sb_publishable_...',
```

Both values are meant to be public. Your data stays private because of the rules from step 2.

## 4. Put the site online with Vercel

1. Create a free **GitHub** account if you don't have one.
2. Go to **github.com/new** and create a repository named `edge-journal`. Private is fine.
3. On the new repo's page, click **uploading an existing file**. Drag in **everything in this folder**, including the `supabase` folder, then click **Commit changes**.
4. Go to **vercel.com** and sign up with GitHub.
5. Click **Add New → Project**, find `edge-journal`, and click **Import**.
6. Leave **Framework Preset** on **Other**, then click **Deploy**.
7. When it finishes, copy your site address, for example `https://edge-journal-yourname.vercel.app`.

Open that address. You should see the sign-in page. Sign-in won't work until steps 5 and 6 are done.

## 5. Tell Supabase your site address

In Supabase, go to **Authentication → URL Configuration**:

- **Site URL:** your Vercel address, for example `https://edge-journal-yourname.vercel.app`
- **Redirect URLs:** click **Add URL** and enter your address followed by `/**`, for example `https://edge-journal-yourname.vercel.app/**`

Click **Save**. Without this step, people land on the wrong page after signing in.

## 6. Turn on "Continue with Google"

**In Google Cloud:**

1. Go to **console.cloud.google.com** and create a new project called `Edge Journal`.
2. Open **Google Auth Platform**. Search for it in the top search bar, then click **Get started**.
   - **App name:** Edge Journal
   - **User support email:** your email
   - **Audience:** External
   - **Contact email:** your email
3. Go to **Data Access → Add or remove scopes**. Make sure `openid`, `.../auth/userinfo.email` and `.../auth/userinfo.profile` are checked, then click **Save**.
4. Go to **Clients → Create client**:
   - **Application type:** Web application
   - **Name:** Edge Journal web
   - **Authorized JavaScript origins:** your Vercel address, for example `https://edge-journal-yourname.vercel.app`
   - **Authorized redirect URIs:** the **Callback URL** shown on Supabase's Google provider page. You'll find it in the next section; it looks like `https://abcdefgh.supabase.co/auth/v1/callback`.
5. Click **Create**, then copy the **Client ID** and **Client secret**.
6. Go to **Audience** and click **Publish app**. While the app is in "Testing", only test users you add by hand can sign in. Publishing lets anyone with a Google account sign in. These scopes are basic, so Google doesn't need to review the app.

**In Supabase:**

1. Go to **Authentication → Sign In / Providers → Google**.
2. Turn it on, paste the **Client ID** and **Client secret**, and click **Save**. The Callback URL for step 4 above is shown on this page.

Now open your site and click **Continue with Google**. You should land in your new, empty journal.

## 7. Optional: email and password sign-up

Supabase's built-in email sender only delivers to members of your own Supabase team, and only a couple of messages an hour. Real users would never receive their confirmation emails. That's why `config.js` starts with `emailAuth: false`, which shows only the Google button.

To let people sign up with email:

1. Sign up for an email service. **Resend** (resend.com) has a free tier and a Supabase guide.
2. In Supabase, open **Authentication** and find **SMTP Settings** (under Emails). Turn on custom SMTP and enter the details your email service gives you.
3. Make sure **Authentication → Sign In / Providers → Email** is enabled, with **Confirm email** on.
4. In `config.js`, set `emailAuth: true` and upload the changed file to GitHub.

## 8. Move your trades over from the Claude version

1. In your current Edge Journal on Claude, open **Settings → Export backup (.json)**.
2. On your new site, sign in, then open **Settings → Import backup** and choose that file.

## 9. Fill in the Privacy Policy and Terms

Open `privacy.html` and `terms.html` and replace the highlighted placeholders `[YOUR NAME OR BUSINESS]` and `[CONTACT EMAIL]`. These are plain starting templates, not legal advice. Have someone qualified review them before you open the site to the public.

---

## Updating the site later

Edit or upload the changed file on GitHub and commit it. Vercel automatically puts the new version live within about a minute.

## Adding Apple, GitHub, Discord or X sign-in

Turn the provider on in **Supabase → Authentication → Sign In / Providers** (each one has its own setup steps on that page). Then add it to `authProviders` in `config.js`, for example `['google', 'apple']`.

## Using your own domain

In Vercel, open your project, go to **Settings → Domains**, and add a domain you've bought, such as `edgejournal.app`. Then repeat steps 5 and 6 with the new address: update the Site URL, Redirect URLs and Google's JavaScript origins.

## Testing on your own computer (optional)

In this folder, run `npx serve .` and open `http://localhost:3000`. Add `http://localhost:3000/**` to Supabase's Redirect URLs and `http://localhost:3000` to Google's JavaScript origins. Remove them once you're done testing.

## Troubleshooting

| What you see | Fix |
|---|---|
| "Connect your Supabase project" page | `config.js` still has the placeholder values (step 3) |
| Google shows **redirect_uri_mismatch** | The redirect URI in Google must exactly match Supabase's Callback URL (step 6.4) |
| After signing in you land on the wrong page or localhost | Check the Site URL and Redirect URLs (step 5) |
| "That sign-in option is not turned on" | Enable Google in Supabase (step 6, last part) |
| Only you can sign in with Google | Publish the app under Google Auth Platform → Audience (step 6.6) |
| "The database tables are missing" | Run `supabase/schema.sql` (step 2) |
| Sign-up emails never arrive | Set up custom SMTP (step 7) |
