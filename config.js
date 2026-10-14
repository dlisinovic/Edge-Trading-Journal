/*
  Edge Journal settings — the only file you need to edit to connect your Supabase project.
  See README.md, step 3. Both values below are safe to put on a public website:
  your database rules (supabase/schema.sql) are what keep each person's journal private.
*/
window.EJ_CONFIG = {
  backend: 'supabase',

  // Supabase → your project → Connect (or Settings → API Keys)
  supabaseUrl: 'https://bxyamyiszrktzqmjkqig.supabase.co',
  supabaseKey: 'sb_publishable_tbXarp9U0szVyRn8OrBRNg_A87ULnj-',

  // Sign-in buttons to show. Turn each one on in Supabase first
  // (Authentication → Sign In / Providers). Options: 'google', 'apple', 'github', 'discord', 'twitter'
  authProviders: ['google'],

  // Email + password sign-up. Leave false until you've set up a custom email sender
  // in Supabase (README step 7) — Supabase's built-in sender only emails your own team.
  emailAuth: false,

  appName: 'Edge Journal',
  supportEmail: '' // shown on the sign-in page if set, e.g. 'support@yourdomain.com'
};
