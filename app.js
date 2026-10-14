/* Edge Journal — trading journal. Sign-in via Supabase Auth, data in Supabase Postgres. */
(() => {
'use strict';
const CFG = Object.assign({backend: 'supabase', appName: 'Edge Journal', authProviders: ['google'], emailAuth: false, supportEmail: ''}, window.EJ_CONFIG || {});
const SITE = true;

/* =========================================================
   Helpers
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const isNum = v => typeof v === 'number' && isFinite(v);
const sum = (a, f) => a.reduce((s, x) => s + (Number(f ? f(x) : x) || 0), 0);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round2 = v => Math.round(v * 100) / 100;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const trunc = (s, n) => (s && s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : (s || ''));

function money(v, opt) {
  const o = opt || {};
  if (!isNum(v)) return '—';
  const a = Math.round(Math.abs(v) * 100) / 100;
  const d = o.dec != null ? o.dec : (a % 1 === 0 || a >= 10000 ? 0 : 2);
  const s = a.toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
  const sign = o.sign === false ? (v < -0.004 ? '−' : '') : (v > 0.004 ? '+' : v < -0.004 ? '−' : '');
  return sign + '$' + s;
}
function moneyK(v, signed) {
  if (!isNum(v)) return '—';
  const a = Math.abs(v);
  const s = a >= 1000 ? (a / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'K' : String(Math.round(a));
  return (v < -0.004 ? '−' : (signed && v > 0.004 ? '+' : '')) + '$' + s;
}
const pct = v => (v == null || !isFinite(v)) ? '—' : Math.round(v * 100) + '%';
const fmtR = v => isNum(v) ? (v > 0.004 ? '+' : v < -0.004 ? '−' : '') + Math.abs(v).toFixed(2) + 'R' : '—';
const cls = v => !isNum(v) ? 'flat' : v > 0.004 ? 'pos' : v < -0.004 ? 'neg' : 'flat';
const fmtPrice = v => isNum(v) ? v.toLocaleString('en-US', {maximumFractionDigits: 5}) : '—';

/* dates (local time) */
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const todayStr = () => ymd(new Date());
const weekStartStr = s => { const d = parseYmd(s); return ymd(addDays(d, -d.getDay())); };
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_LONG = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const WEEKDAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const prettyDate = (s, long) => parseYmd(s).toLocaleDateString('en-US', long ? {weekday:'long', month:'long', day:'numeric', year:'numeric'} : {weekday:'short', month:'short', day:'numeric'});
const shortDate = s => parseYmd(s).toLocaleDateString('en-US', {month:'short', day:'numeric'});
const shortMD = s => { const d = parseYmd(s); return `${d.getMonth() + 1}/${d.getDate()}`; };
function sessionFor(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const t = h * 60 + m;
  if (t >= 1080 || t < 180) return 'Asia';
  if (t < 570) return 'London';
  if (t < 720) return 'NY AM';
  if (t < 810) return 'NY Lunch';
  if (t < 1020) return 'NY PM';
  return 'After hours';
}
const hourLabel = h => h === 0 ? '12a' : h < 12 ? h + 'a' : h === 12 ? '12p' : (h - 12) + 'p';
function holdMinutes(t) {
  if (!t.entryTime || !t.exitTime) return null;
  const [a, b] = t.entryTime.split(':').map(Number), [c, d] = t.exitTime.split(':').map(Number);
  let m = (c * 60 + d) - (a * 60 + b);
  if (m < 0) m += 1440;
  return m;
}

/* icons */
const ic = p => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  home: ic('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>'),
  reports: ic('<path d="M4 20h16"/><path d="M7 16v-5"/><path d="M12 16V6"/><path d="M17 16v-8"/>'),
  calendar: ic('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17"/><path d="M8 3v4"/><path d="M16 3v4"/>'),
  trades: ic('<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
  mindset: ic('<path d="M3 12h4l2.5-6 5 12 2.5-6H21"/>'),
  settings: ic('<path d="M4 7h10"/><path d="M18 7h2"/><circle cx="16" cy="7" r="2"/><path d="M4 17h2"/><path d="M10 17h10"/><circle cx="8" cy="17" r="2"/>'),
  user: ic('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
  download: ic('<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>'),
  logout: ic('<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 16l-4-4 4-4"/><path d="M6 12h10"/>')
};

/* =========================================================
   Vocabulary
   ========================================================= */
const DEFAULT_INSTRUMENTS = [
  {sym:'NQ', name:'E-mini Nasdaq-100', mkt:'futures', pv:20, pinned:true},
  {sym:'MNQ', name:'Micro Nasdaq-100', mkt:'futures', pv:2, pinned:true},
  {sym:'GC', name:'Gold', mkt:'futures', pv:100, pinned:true},
  {sym:'MGC', name:'Micro Gold', mkt:'futures', pv:10, pinned:true},
  {sym:'ES', name:'E-mini S&P 500', mkt:'futures', pv:50, pinned:false},
  {sym:'MES', name:'Micro S&P 500', mkt:'futures', pv:5, pinned:false},
  {sym:'CL', name:'Crude Oil', mkt:'futures', pv:1000, pinned:false},
  {sym:'MCL', name:'Micro Crude Oil', mkt:'futures', pv:100, pinned:false},
  {sym:'YM', name:'E-mini Dow', mkt:'futures', pv:5, pinned:false},
  {sym:'MYM', name:'Micro Dow', mkt:'futures', pv:0.5, pinned:false},
  {sym:'RTY', name:'E-mini Russell 2000', mkt:'futures', pv:50, pinned:false},
  {sym:'M2K', name:'Micro Russell 2000', mkt:'futures', pv:5, pinned:false},
  {sym:'SI', name:'Silver', mkt:'futures', pv:5000, pinned:false},
  {sym:'EURUSD', name:'Euro / US Dollar', mkt:'forex', lot:100000, pip:0.0001, pinned:true},
  {sym:'GBPUSD', name:'British Pound / US Dollar', mkt:'forex', lot:100000, pip:0.0001, pinned:true},
  {sym:'USDJPY', name:'US Dollar / Japanese Yen', mkt:'forex', lot:100000, pip:0.01, pinned:true},
  {sym:'XAUUSD', name:'Gold / US Dollar', mkt:'forex', lot:100, pip:0.1, pinned:true},
  {sym:'AUDUSD', name:'Australian Dollar / US Dollar', mkt:'forex', lot:100000, pip:0.0001, pinned:false},
  {sym:'NZDUSD', name:'New Zealand Dollar / US Dollar', mkt:'forex', lot:100000, pip:0.0001, pinned:false},
  {sym:'USDCAD', name:'US Dollar / Canadian Dollar', mkt:'forex', lot:100000, pip:0.0001, pinned:false},
  {sym:'USDCHF', name:'US Dollar / Swiss Franc', mkt:'forex', lot:100000, pip:0.0001, pinned:false},
  {sym:'EURJPY', name:'Euro / Japanese Yen', mkt:'forex', lot:100000, pip:0.01, pinned:false},
  {sym:'GBPJPY', name:'British Pound / Japanese Yen', mkt:'forex', lot:100000, pip:0.01, pinned:false},
  {sym:'EURGBP', name:'Euro / British Pound', mkt:'forex', lot:100000, pip:0.0001, pinned:false},
  {sym:'XAGUSD', name:'Silver / US Dollar', mkt:'forex', lot:5000, pip:0.01, pinned:false}
];
const DEFAULT_SETUPS = ['Liquidity sweep','Breakout','Pullback','Reversal','Opening range','VWAP reclaim','Indicator signal','Trend continuation'];
const EMO_BEFORE = ['Calm','Focused','Confident','Patient','Excited','Anxious','FOMO','Impatient','Bored','Revenge','Greedy','Tired','Distracted','Fearful'];
const EMO_DURING = ['Calm','In control','Patient','Hopeful','Nervous','Fearful','Greedy','Frozen','Impatient','Euphoric'];
const EMO_AFTER = ['Satisfied','Proud','Relieved','Neutral','Frustrated','Angry','Regret','Disappointed','Euphoric'];
const DAY_MOODS = ['Sharp','Calm','Motivated','Rested','Tired','Stressed','Anxious','Distracted','Frustrated'];
const GOOD = new Set(['Calm','Focused','Confident','Patient','In control','Satisfied','Proud','Relieved','Sharp','Motivated','Rested']);
const BAD = new Set(['Anxious','FOMO','Impatient','Bored','Revenge','Greedy','Tired','Distracted','Fearful','Nervous','Frozen','Euphoric','Frustrated','Angry','Regret','Disappointed','Stressed']);
const MISTAKES = ['Chased entry','No clear setup','Oversized','Moved stop','Removed stop','Exited too early','Held loser too long','Revenge trade','Overtraded','Ignored my plan','Traded the news','Late entry','Added to a loser'];
const CONFLUENCES = ['Trend aligned','Key level','Indicator signal','Liquidity sweep','Higher-TF bias','Volume','VWAP','Opening range','News catalyst'];
const TIMEFRAMES = ['15s','1m','2m','5m','15m','1h'];
const EXIT_REASONS = ['Hit target','Hit stop','Trailed stop','Manual – per plan','Manual – fear','Manual – greed','Time-based exit','Breakeven stop'];
const ORIGINS = ['In my pre-market plan','Spotted live, fit my rules','Impulse'];
const SESSIONS = ['Asia','London','NY AM','NY Lunch','NY PM','After hours'];
const PLAN_OPTS = [{v:'yes', l:'Yes'}, {v:'partly', l:'Partly'}, {v:'no', l:'No'}];
const PLAN_LABEL = {yes:'Followed plan', partly:'Partly followed', no:'Broke plan', mostly:'Mostly followed'};
const READY_OPTS = [{v:'yes', l:'Yes'}, {v:'unsure', l:'Unsure'}, {v:'no', l:'No'}];
const tone = v => GOOD.has(v) ? 'good' : BAD.has(v) ? 'bad' : '';
const MARKETS = [{v: 'futures', l: 'Futures'}, {v: 'forex', l: 'Forex'}];
const mktOf = i => !i ? null : (i.mkt || (i.pip ? 'forex' : 'futures'));
const qtyWord = (m, n) => m === 'forex' ? `${n} lot${Number(n) === 1 ? '' : 's'}` : plural(n, 'contract');

function defaultSettings() {
  return {
    kind: 'settings', accountName: '', accountSet: false,
    start: 0, target: 0, maxDD: 0, ddType: 'trailing', dailyLimit: 0,
    riskPerTrade: 0, defaultQty: 1, defaultSym: 'NQ',
    markets: ['futures', 'forex'], defaultMarket: 'futures', defaultFx: 'EURUSD', defaultLots: 1, fxAdded: true,
    instruments: DEFAULT_INSTRUMENTS.map(i => Object.assign({}, i)),
    setups: DEFAULT_SETUPS.slice()
  };
}
function mergeSettings(s) {
  const out = Object.assign(defaultSettings(), s || {});
  if (!Array.isArray(out.instruments) || !out.instruments.length) out.instruments = defaultSettings().instruments;
  if (!Array.isArray(out.setups)) out.setups = DEFAULT_SETUPS.slice();
  // settings saved with the old built-in account (never edited by the user): start empty instead
  if (s && !s.accountSet && s.accountName === 'LucidFlex 25K') Object.assign(out, {accountName: '', start: 0, target: 0, maxDD: 0, dailyLimit: 0, riskPerTrade: 0});
  // settings saved before forex existed: add the default pairs once
  if (!(s && s.fxAdded)) {
    const have = new Set(out.instruments.map(i => i.sym));
    DEFAULT_INSTRUMENTS.filter(i => i.mkt === 'forex' && !have.has(i.sym)).forEach(i => out.instruments.push(Object.assign({}, i)));
  }
  out.fxAdded = true;
  out.instruments.forEach(i => { if (!i.mkt) i.mkt = i.pip ? 'forex' : 'futures'; });
  if (!Array.isArray(out.markets) || !out.markets.length) out.markets = ['futures', 'forex'];
  if (!out.markets.includes(out.defaultMarket)) out.defaultMarket = out.markets[0];
  out.defaultLots = Number(out.defaultLots) || 1;
  ['start','target','maxDD','dailyLimit','riskPerTrade','defaultQty'].forEach(k => { out[k] = Number(out[k]) || 0; });
  return out;
}

/* =========================================================
   Storage adapters — same interface: init(onData, onMode) → mode, put(id, body), remove(id)
   ========================================================= */
function partition(entries) {
  const out = {trades: [], days: {}, settings: null};
  for (const [id, b] of entries) {
    if (!b || typeof b !== 'object') continue;
    if (b.kind === 'trade' && b.date) out.trades.push(Object.assign({}, b, {id}));
    else if (b.kind === 'day' && b.date) out.days[b.date] = Object.assign({}, b);
    else if (b.kind === 'settings') out.settings = Object.assign({}, b);
  }
  return out;
}

/* Supabase: tables trades / journal_days / profiles, protected by row-level security (supabase/schema.sql) */
function makeSupabaseStore(sb, uid) {
  let mode = 'loading', cb = null, loadedAt = 0, busy = null;
  const cache = {trades: new Map(), days: new Map(), settings: null};
  const emit = () => cb && cb({
    trades: [...cache.trades].map(([id, b]) => Object.assign({}, b, {id})),
    days: Object.fromEntries(cache.days),
    settings: cache.settings
  });
  async function pageAll(table, cols, orderCol) {
    const out = [], PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const {data, error} = await sb.from(table).select(cols).order(orderCol, {ascending: true}).range(from, from + PAGE - 1);
      if (error) throw error;
      out.push(...data);
      if (data.length < PAGE) break;
    }
    return out;
  }
  async function fetchAll() {
    const [trades, days, prof] = await Promise.all([
      pageAll('trades', 'id,data', 'trade_date'),
      pageAll('journal_days', 'day,data', 'day'),
      sb.from('profiles').select('settings').eq('id', uid).maybeSingle()
    ]);
    if (prof.error) throw prof.error;
    cache.trades = new Map(trades.map(r => [r.id, Object.assign({}, r.data, {kind: 'trade'})]));
    cache.days = new Map(days.map(r => [r.day, Object.assign({}, r.data, {kind: 'day', date: r.day})]));
    const st = prof.data && prof.data.settings;
    cache.settings = st && typeof st === 'object' && Object.keys(st).length ? Object.assign({}, st, {kind: 'settings'}) : null;
    loadedAt = Date.now();
    mode = 'cloud';
    emit();
  }
  const now = () => new Date().toISOString();
  const strip = b => { const c = Object.assign({}, b); delete c.id; delete c.sample; return c; };
  return {
    get mode() { return mode; },
    async init(onData) { cb = onData; await fetchAll(); return mode; },
    async refresh() {
      if (busy || Date.now() - loadedAt < 20000) return;
      busy = fetchAll().catch(() => {}).finally(() => { busy = null; });
    },
    async put(id, body) {
      const b = strip(body);
      let res;
      if (b.kind === 'trade') {
        res = await sb.from('trades').upsert({user_id: uid, id, trade_date: b.date, data: b, updated_at: now()}, {onConflict: 'user_id,id'});
        if (!res.error) cache.trades.set(id, b);
      } else if (b.kind === 'day') {
        res = await sb.from('journal_days').upsert({user_id: uid, day: b.date, data: b, updated_at: now()}, {onConflict: 'user_id,day'});
        if (!res.error) cache.days.set(b.date, b);
      } else if (b.kind === 'settings') {
        res = await sb.from('profiles').upsert({id: uid, settings: b, updated_at: now()}, {onConflict: 'id'});
        if (!res.error) cache.settings = b;
      } else return;
      if (res.error) throw res.error;
      emit();
    },
    async remove(id) {
      let res;
      if (id.startsWith('d-')) { const day = id.slice(2); res = await sb.from('journal_days').delete().eq('user_id', uid).eq('day', day); if (!res.error) cache.days.delete(day); }
      else { res = await sb.from('trades').delete().eq('user_id', uid).eq('id', id); if (!res.error) cache.trades.delete(id); }
      if (res.error) throw res.error;
      emit();
    },
  };
}

function writeError(e) {
  const c = e && e.code, m = String((e && e.message) || '').toLowerCase();
  if (c === 'quota_exceeded') return 'Your journal storage is full. Export a backup in Settings, then delete old trades to make room.';
  if (c === 'invalid_argument' || c === '42501') return 'You are not allowed to change this journal, so nothing was saved.';
  if (c === 'resource_exhausted') return 'Saving too quickly. Wait a few seconds and try again.';
  if (c === 'revoked') return 'The connection to your synced journal was lost. Reload the page and try again.';
  if (c === '42P01' || m.includes('does not exist') || m.includes('schema cache')) return 'The database tables are missing. Run supabase/schema.sql in the Supabase SQL Editor (setup guide, step 2).';
  if (c === '23514') return 'That entry is too large to save. Shorten the notes and try again.';
  if (m.includes('jwt') || m.includes('not authenticated')) return 'Your session expired. Sign in again.';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Could not reach the server. Check your connection and try again.';
  return 'Could not save right now. Check your connection and try again.';
}

/* =========================================================
   Sample data — generated in memory, never saved
   ========================================================= */
// the demo should show a healthy, believable journal: re-roll the random sample until it's moderately profitable
function makeSample() {
  let best = null;
  for (let k = 0; k < 40; k++) {
    const smp = makeSampleWith(20261013 + k), net = smp.trades.reduce((a, t) => a + t.pnl, 0);
    if (net >= 1500 && net <= 6000) return smp;
    if (!best || net > best.net) best = Object.assign(smp, {net});
  }
  return best;
}
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function makeSampleWith(seed) {
  const R = mulberry32(seed);
  const pick = a => a[Math.floor(R() * a.length)];
  const picks = (a, n) => { const c = a.slice(), out = []; while (out.length < n && c.length) out.push(c.splice(Math.floor(R() * c.length), 1)[0]); return out; };
  const rint = (a, b) => a + Math.floor(R() * (b - a + 1));
  const spec = {
    NQ: {pv:20, qty:1, stop:30, tgt:32, px:26350, tick:.25, fee:4.5, drift:220},
    MNQ: {pv:2, qty:5, stop:30, tgt:32, px:26350, tick:.25, fee:1.5, drift:220},
    GC: {pv:100, qty:1, stop:6, tgt:6.4, px:4185, tick:.1, fee:4.6, drift:45},
    MGC: {pv:10, qty:5, stop:6, tgt:6.4, px:4185, tick:.1, fee:1.6, drift:45}
  };
  const REASONS = {
    'Liquidity sweep': 'Swept the overnight low, reclaimed it on the 1m, and I entered on the retest with my stop under the wick.',
    'Breakout': 'Price coiled under yesterday\'s high for 40 minutes. Took the 5m close through it with volume picking up.',
    'Pullback': 'Strong trend off the open. Waited for the first pullback into VWAP and entered on the rejection candle.',
    'Reversal': 'Ran into the prior day high with divergence on my indicator. Took the lower high after the failed push.',
    'Opening range': 'Marked the first 15-minute range. Took the break and retest of the range in the direction of my higher-timeframe bias.',
    'VWAP reclaim': 'Lost VWAP early, then reclaimed it with a full-bodied candle. Entered on the hold with my stop below the reclaim bar.',
    'Indicator signal': 'My projection indicator flagged an outlier move into the band. Entered on the signal bar close, exactly per my rules.',
    'Trend continuation': 'Higher highs and higher lows on the 15m. Entered the 2m flag break with my stop under the flag.'
  };
  const REVENGE_REASON = 'I was down from the last trade and wanted it back. Jumped on a fast candle without a real setup.';
  const FOMO_REASON = 'The move started without me and I chased it. The setup was real but my entry was late and my stop was too tight.';
  const WELL_WIN = ['Waited for my level instead of front-running it.','Let it run to target without touching it.','Sized right and kept the stop where it belonged.','Pulled the trigger without hesitating once my rules lined up.'];
  const WELL_LOSS = ['Took the stop without moving it.','Kept the loss to my planned size.','Stepped away after this one instead of forcing another trade.'];
  const DIFF_GOOD = ['Nothing. That was the plan.','Could have taken a partial at 1R.','Wait for one more confirmation candle.'];
  const DIFF_BAD = ['Walk away for 15 minutes after a loss before looking for the next trade.','Only trade my marked levels. No level, no trade.','Wait for the candle to close instead of entering mid-bar.','Stick to my size. Never size up to make it back.'];
  const LESSONS = ['The best trades feel boring. If I feel rushed, it probably is not my setup.','My first trade sets the tone for the day, so be picky with it.','My win rate drops right after a loss. A break is part of the plan.','Gold respects the London range. Mark it every morning.','Targets get hit when I leave the trade alone.','FOMO entries come with worse fills and worse R.'];
  const PLANS = [
    'Bias bullish above the overnight low. Watching ONH and yesterday\'s close for sweeps. Max 2 trades, done after the daily loss limit.',
    'Gold ranging under 4,200. Only fades at the range extremes. Data at 8:30, so no trades before 9:45.',
    'Chop risk today. Waiting for the opening range to set. One A+ setup or nothing.',
    'Trend day setup on NQ if we hold above VWAP after the open. Pullbacks only, no chasing.'
  ];
  const trades = [], days = {};
  const base = new Date(); base.setHours(0, 0, 0, 0);
  let n = 0;
  for (let i = 48; i >= 0; i--) {
    const d = addDays(base, -i), wd = d.getDay();
    if (wd === 0 || wd === 6) continue;
    if (R() < 0.15) continue;
    const date = ymd(d);
    const count = R() < 0.5 ? 1 : (R() < 0.72 ? 2 : 3);
    let lostPrev = false, dayNet = 0, dayHadRevenge = false, minute = 0;
    for (let k = 0; k < count; k++) {
      const sym = R() < 0.56 ? (R() < 0.7 ? 'NQ' : 'MNQ') : (R() < 0.7 ? 'GC' : 'MGC');
      const sp = spec[sym];
      const revenge = lostPrev && R() < 0.55;
      const good = !revenge && R() < 0.66;
      const fomo = !good && !revenge && R() < 0.5;
      if (revenge) dayHadRevenge = true;
      const emoBefore = revenge ? ['Revenge','Impatient'] : good ? picks(['Calm','Focused','Confident','Patient'], R() < 0.4 ? 2 : 1) : fomo ? ['FOMO', pick(['Anxious','Impatient','Excited'])] : picks(['Anxious','Bored','Impatient','Tired','Greedy','Distracted'], R() < 0.4 ? 2 : 1);
      const followedPlan = good ? (R() < 0.86 ? 'yes' : 'partly') : revenge ? 'no' : (R() < 0.4 ? 'partly' : 'no');
      const win = R() < (good ? 0.72 : revenge ? 0.22 : 0.36);
      let pts, exitReason;
      if (win) {
        if (R() < 0.72) { pts = sp.tgt; exitReason = 'Hit target'; }
        else { pts = Math.round(sp.tgt * (0.35 + R() * 0.5) / sp.tick) * sp.tick; exitReason = good ? 'Manual – per plan' : 'Manual – fear'; }
      } else {
        if (R() < 0.78) { pts = -sp.stop; exitReason = 'Hit stop'; }
        else { pts = -Math.round(sp.stop * (0.3 + R() * 0.5) / sp.tick) * sp.tick; exitReason = good ? 'Manual – per plan' : 'Manual – fear'; }
      }
      const side = R() < 0.55 ? 'long' : 'short', dir = side === 'long' ? 1 : -1;
      const entry = round2(Math.round((sp.px + (R() - 0.5) * 2 * sp.drift) / sp.tick) * sp.tick);
      const exit = round2(entry + pts * dir);
      const qty = sp.qty, fees = round2(sp.fee * qty);
      const pnl = round2(pts * sp.pv * qty - fees);
      const risk = sp.stop * sp.pv * qty;
      let startMin;
      if ((sym === 'GC' || sym === 'MGC') && R() < 0.4) startMin = rint(180, 330);
      else if (R() < 0.82) startMin = rint(573, 690);
      else startMin = rint(820, 930);
      startMin = Math.max(startMin, minute + 12);
      minute = startMin + rint(4, 46);
      const tt = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
      const setup = pick(DEFAULT_SETUPS);
      const mistakes = revenge ? (R() < 0.5 ? ['Revenge trade','No clear setup','Oversized'] : ['Revenge trade','No clear setup'])
        : fomo ? ['Chased entry', ...(R() < 0.4 ? ['Late entry'] : [])]
        : !good ? picks(['Late entry','Exited too early','Moved stop','Ignored my plan'], 1)
        : (exitReason === 'Manual – fear' ? ['Exited too early'] : []);
      trades.push({
        kind: 'trade', id: 's-' + (++n), sample: true, date,
        entryTime: tt(startMin), exitTime: tt(minute), sym, side, qty,
        entry, exit, stop: round2(entry - sp.stop * dir), target: round2(entry + sp.tgt * dir), fees, pnl,
        risk, r: round2(pnl / risk), session: sessionFor(tt(startMin)),
        setup: revenge ? null : setup, timeframe: pick(['1m','2m','5m','5m','15m']),
        confluences: revenge ? [] : picks(CONFLUENCES.slice(0, 7), rint(1, 3)),
        origin: good ? (R() < 0.6 ? ORIGINS[0] : ORIGINS[1]) : revenge ? ORIGINS[2] : (R() < 0.5 ? ORIGINS[1] : ORIGINS[2]),
        reason: revenge ? REVENGE_REASON : fomo ? FOMO_REASON : REASONS[setup],
        emoBefore,
        emoDuring: win ? picks(['Calm','In control','Patient'], 1) : picks(['Nervous','Fearful','Hopeful','Frozen'], 1),
        emoAfter: [win ? pick(['Satisfied','Proud','Relieved']) : good ? pick(['Neutral','Disappointed']) : pick(['Frustrated','Angry','Regret'])],
        confidence: good ? rint(3, 5) : rint(1, 3), stress: good ? rint(2, 5) : rint(6, 9),
        ready: good ? 'yes' : revenge ? 'no' : 'unsure', followedPlan, mistakes, exitReason,
        wentWell: win ? pick(WELL_WIN) : pick(WELL_LOSS),
        differently: good ? pick(DIFF_GOOD) : pick(DIFF_BAD),
        lesson: R() < 0.45 ? pick(LESSONS) : '',
        grade: followedPlan === 'yes' ? (win ? 'A' : 'B') : followedPlan === 'partly' ? 'C' : (revenge ? 'F' : 'D'),
        chartUrl: '', createdAt: d.getTime() + startMin * 60000, updatedAt: d.getTime() + minute * 60000
      });
      lostPrev = pnl < 0; dayNet += pnl;
    }
    if (R() < 0.7) {
      days[date] = {
        kind: 'day', date, sample: true, sleep: rint(2, 5), mood: picks(['Sharp','Calm','Motivated','Tired','Stressed'], R() < 0.5 ? 1 : 2),
        bias: pick(['Bullish','Bearish','Neutral']), plan: pick(PLANS), maxTrades: 2,
        feel: [dayNet >= 0 ? pick(['Satisfied','Proud','Relieved']) : pick(['Frustrated','Disappointed','Neutral'])],
        followedPlan: dayHadRevenge ? 'no' : dayNet >= 0 ? 'yes' : 'mostly',
        discipline: dayHadRevenge ? rint(3, 5) : rint(7, 10),
        wentWell: dayNet >= 0 ? 'Waited for my levels and did not force anything.' : 'Kept my losses to plan size.',
        improve: dayHadRevenge ? 'After a loss, stand up and walk away for 15 minutes.' : 'Take a partial at 1R on the runner.',
        lesson: dayHadRevenge ? 'Revenge trades are where my red days come from.' : pick(LESSONS), notes: ''
      };
    }
  }
  return {trades, days};
}

/* =========================================================
   State + routing
   ========================================================= */
const PERIODS = [
  {id:'today', label:'Today', g:'day'}, {id:'week', label:'This week', g:'week'}, {id:'month', label:'This month', g:'month'},
  {id:'year', label:'This year', g:'year'}, {id:'all', label:'All time', g:'all'}
];
const GRAN = [{id:'day', l:'Day'}, {id:'week', l:'Week'}, {id:'month', l:'Month'}, {id:'year', l:'Year'}, {id:'all', l:'All time'}];
const GRAN_IDS = GRAN.map(g => g.id);
const VIEWS = ['home', 'reports', 'calendar', 'trades', 'mindset', 'settings'];
const NAV = [{id:'home', l:'Home'}, {id:'reports', l:'Reports'}, {id:'calendar', l:'Calendar'}, {id:'trades', l:'Trades'}, {id:'mindset', l:'Mindset'}];
const S = {
  settings: defaultSettings(),
  trades: [], days: {},
  sample: null, previewOn: false, loading: true, loadError: null,
  started: false, uid: null, user: null,
  route: {view: 'home'}, lastG: 'week', calMonth: todayStr().slice(0, 7), mindP: 'all',
  filters: {q:'', sym:'all', res:'all', setup:'all', period:'all', sort:'date-desc', range: null},
  listLimit: 60, form: null, sheetKind: null, importData: null, wipeArmed: false, delArmed: false
};
let Store = null;
const data = () => S.previewOn ? S.sample : {trades: S.trades, days: S.days};
const inst = sym => S.settings.instruments.find(i => i.sym === sym);
const tradeMkt = t => t.market || mktOf(inst(t.sym)) || 'futures';
const defaultSymFor = m => m === 'forex' ? (S.settings.defaultFx || 'EURUSD') : (S.settings.defaultSym || 'NQ');

function routeKey(g, anchor) {
  if (g === 'day') return anchor;
  if (g === 'week') return weekStartStr(anchor);
  if (g === 'month') return anchor.slice(0, 7);
  if (g === 'year') return anchor.slice(0, 4);
  return '';
}
const repRoute = (g, anchor) => g === 'all' ? 'reports/all' : `reports/${g}/${routeKey(g, anchor || todayStr())}`;
function parseRoute(h) {
  const parts = String(h || '').replace(/^#\/?/, '').split('/').filter(Boolean);
  let view = parts[0] || 'home';
  if (view === 'dashboard') view = 'home';
  if (!VIEWS.includes(view)) view = 'home';
  const r = {view};
  if (view === 'reports') {
    r.g = GRAN_IDS.includes(parts[1]) ? parts[1] : (S.lastG || 'week');
    const k = parts[2] || '';
    r.anchor = /^\d{4}-\d{2}-\d{2}$/.test(k) ? k : /^\d{4}-\d{2}$/.test(k) ? k + '-01' : /^\d{4}$/.test(k) ? k + '-01-01' : todayStr();
  }
  if (view === 'calendar') r.month = /^\d{4}-\d{2}$/.test(parts[1] || '') ? parts[1] : (S.calMonth || todayStr().slice(0, 7));
  return r;
}
function routeStr(r) {
  if (r.view === 'reports') return repRoute(r.g, r.anchor);
  if (r.view === 'calendar') return 'calendar/' + (r.month || S.calMonth);
  return r.view;
}
function go(target, opts) {
  const r = typeof target === 'string' ? parseRoute(target) : target;
  const h = '#' + routeStr(r);
  try {
    if (opts && opts.replace) history.replaceState(null, '', h);
    else if (location.hash !== h) history.pushState(null, '', h);
  } catch (e) {}
  applyRoute(r, opts);
}
function applyRoute(r, opts) {
  S.route = r;
  if (r.view === 'reports') S.lastG = r.g;
  if (r.view === 'calendar') S.calMonth = r.month;
  closeMenu();
  VIEWS.forEach(v => { const el = $('#v-' + v); if (el) el.hidden = v !== r.view; });
  S.wipeArmed = false; S.delArmed = false;
  renderNav();
  renderAll();
  if (!(opts && opts.keepScroll)) window.scrollTo({top: 0});
}
window.addEventListener('popstate', () => { if (S.started) applyRoute(parseRoute(location.hash), {}); });

/* =========================================================
   Analytics
   ========================================================= */
const tkey = t => `${t.date} ${t.entryTime || '99:99'} ${String(t.createdAt || 0).padStart(14, '0')}`;
const sortTrades = ts => ts.slice().sort((a, b) => { const x = tkey(a), y = tkey(b); return x < y ? -1 : x > y ? 1 : 0; });
function inPeriod(date, p) {
  const t = todayStr();
  if (p === 'today') return date === t;
  if (p === 'week') return weekStartStr(date) === weekStartStr(t);
  if (p === 'month') return date.slice(0, 7) === t.slice(0, 7);
  if (p === 'year') return date.slice(0, 4) === t.slice(0, 4);
  return true;
}
function periodSub(p) {
  const t = todayStr(), d = parseYmd(t);
  if (p === 'today') return prettyDate(t);
  if (p === 'week') { const ws = weekStartStr(t); return `${shortDate(ws)} – ${shortDate(ymd(addDays(parseYmd(ws), 6)))}`; }
  if (p === 'month') return MONTHS_LONG[d.getMonth()];
  if (p === 'year') return String(d.getFullYear());
  return 'Every trade';
}
function rangeFor(g, anchor) {
  const d = parseYmd(anchor), y = d.getFullYear(), m = d.getMonth();
  if (g === 'day') return {from: anchor, to: anchor, title: prettyDate(anchor, true), kind: 'Daily'};
  if (g === 'week') { const ws = weekStartStr(anchor), we = ymd(addDays(parseYmd(ws), 6)); return {from: ws, to: we, title: `${shortDate(ws)} – ${shortDate(we)}, ${parseYmd(we).getFullYear()}`, kind: 'Weekly'}; }
  if (g === 'month') return {from: `${y}-${pad(m + 1)}-01`, to: ymd(new Date(y, m + 1, 0)), title: `${MONTHS_LONG[m]} ${y}`, kind: 'Monthly'};
  if (g === 'year') return {from: `${y}-01-01`, to: `${y}-12-31`, title: String(y), kind: 'Yearly'};
  return {from: '0000-01-01', to: '9999-12-31', title: 'All time', kind: 'All-time'};
}
function shiftAnchor(g, anchor, dir) {
  const d = parseYmd(anchor);
  if (g === 'day') return ymd(addDays(d, dir));
  if (g === 'week') return ymd(addDays(parseYmd(weekStartStr(anchor)), 7 * dir));
  if (g === 'month') return ymd(new Date(d.getFullYear(), d.getMonth() + dir, 1));
  if (g === 'year') return `${d.getFullYear() + dir}-01-01`;
  return anchor;
}
const inRange = (date, r) => date >= r.from && date <= r.to;
function stats(trades) {
  const ts = sortTrades(trades);
  let wins = 0, losses = 0, gw = 0, gl = 0, net = 0, rSum = 0, rN = 0, maxW = 0, maxL = 0, cw = 0, cl = 0, bw = 0, bl = 0;
  const byDay = new Map();
  for (const t of ts) {
    const p = Number(t.pnl) || 0;
    net += p;
    if (p > 0) { wins++; gw += p; cw++; cl = 0; bw = Math.max(bw, cw); maxW = Math.max(maxW, p); }
    else if (p < 0) { losses++; gl -= p; cl++; cw = 0; bl = Math.max(bl, cl); maxL = Math.min(maxL, p); }
    if (isNum(t.r)) { rSum += t.r; rN++; }
    byDay.set(t.date, (byDay.get(t.date) || 0) + p);
  }
  let best = null, worst = null, green = 0, red = 0;
  for (const [d, v] of byDay) {
    if (v > 0) green++; else if (v < 0) red++;
    if (!best || v > best[1]) best = [d, v];
    if (!worst || v < worst[1]) worst = [d, v];
  }
  return {
    n: ts.length, wins, losses, net, gw, gl,
    winRate: wins + losses ? wins / (wins + losses) : null,
    pf: gl ? gw / gl : (gw ? Infinity : null),
    avgWin: wins ? gw / wins : null, avgLoss: losses ? -gl / losses : null,
    exp: ts.length ? net / ts.length : null, avgR: rN ? rSum / rN : null,
    maxW: wins ? maxW : null, maxL: losses ? maxL : null, bestWin: bw, bestLoss: bl,
    days: byDay.size, green, red, best, worst, byDay, sorted: ts
  };
}
function group(trades, keyFn) {
  const m = new Map();
  for (const t of trades) {
    let keys = keyFn(t);
    if (!Array.isArray(keys)) keys = [keys];
    for (const k of keys) {
      if (k == null || k === '') continue;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(t);
    }
  }
  return [...m.entries()].map(([key, ts]) => {
    const w = ts.filter(x => x.pnl > 0).length, l = ts.filter(x => x.pnl < 0).length;
    const net = sum(ts, x => x.pnl);
    return {key, n: ts.length, net, avg: net / ts.length, wr: w + l ? w / (w + l) : null};
  });
}
function accountState(trades, s) {
  const ts = sortTrades(trades), t = todayStr();
  const dayNets = new Map();
  for (const x of ts) dayNets.set(x.date, (dayNets.get(x.date) || 0) + (Number(x.pnl) || 0));
  let bal = s.start, peak = s.start;
  for (const [d, v] of dayNets) { bal += v; if (d < t) peak = Math.max(peak, bal); }
  const level = s.ddType === 'trailing' ? Math.min(peak - s.maxDD, s.start) : s.start - s.maxDD;
  const todayNet = dayNets.get(t) || 0;
  return {bal, profit: bal - s.start, level, buffer: bal - level, todayNet, dailyUsed: Math.max(0, -todayNet), peak};
}
function projection(trades, s, acct) {
  const ts = sortTrades(trades), recent = ts.slice(-30);
  if (recent.length < 5) return null;
  const exp = sum(recent, x => x.pnl) / recent.length;
  const tpd = recent.length / new Set(recent.map(x => x.date)).size;
  const daily = exp * tpd;
  const remaining = s.target - acct.profit;
  const days = remaining <= 0 ? 0 : daily > 0 ? Math.ceil(remaining / daily) : null;
  const now = new Date(), t = todayStr();
  const monthNet = sum(ts.filter(x => x.date.slice(0, 7) === t.slice(0, 7)), x => x.pnl);
  let rem = 0;
  for (let d = addDays(now, 1); d.getMonth() === now.getMonth(); d = addDays(d, 1)) { const w = d.getDay(); if (w > 0 && w < 6) rem++; }
  return {exp, tpd, daily, remaining, days, monthEnd: monthNet + rem * daily, rem, n: recent.length};
}
const GRADE_SCORE = {A: 4, B: 3, C: 2, D: 1, F: 0};
function mindSnap(ts) {
  const wp = ts.filter(x => x.followedPlan);
  const graded = ts.filter(x => x.grade && x.grade in GRADE_SCORE);
  const gpa = graded.length ? sum(graded, x => GRADE_SCORE[x.grade]) / graded.length : null;
  const emo = group(ts, x => x.emoBefore);
  const rd = ts.filter(x => x.ready);
  return {
    followed: wp.length ? wp.filter(x => x.followedPlan === 'yes').length / wp.length : null, planN: wp.length,
    grade: gpa == null ? null : ['F', 'D', 'C', 'B', 'A'][Math.round(gpa)],
    topEmo: emo.slice().sort((a, b) => b.n - a.n || b.net - a.net)[0] || null,
    costEmo: emo.filter(r => r.net < 0).sort((a, b) => a.net - b.net)[0] || null,
    costMis: group(ts, x => x.mistakes).filter(r => r.net < 0).sort((a, b) => a.net - b.net)[0] || null,
    ready: rd.length ? rd.filter(x => x.ready === 'yes').length / rd.length : null
  };
}

/* =========================================================
   Charts (hand-drawn SVG, colors from tokens)
   ========================================================= */
const ro = 'ResizeObserver' in window ? new ResizeObserver(entries => {
  for (const e of entries) { const el = e.target, w = Math.round(e.contentRect.width); if (el._draw && el._w !== w && el.isConnected) el._draw(); }
}) : null;
function mount(el, fn) {
  if (!el) return;
  el._draw = () => { el._w = Math.round(el.clientWidth); fn(el); };
  el._draw();
  if (ro) ro.observe(el);
}
function niceTicks(lo, hi, count) {
  const span = hi - lo || 1, raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw))), e = raw / mag;
  const step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag;
  const out = [];
  for (let v = Math.floor(lo / step) * step; v <= Math.ceil(hi / step) * step + step / 2; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}
function showTip(html, x, y) {
  const tip = $('#tip');
  tip.innerHTML = html; tip.hidden = false;
  const r = tip.getBoundingClientRect();
  let left = x + 14, top = y + 14;
  if (left + r.width > innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > innerHeight - 8) top = y - r.height - 14;
  tip.style.left = Math.max(8, left) + 'px';
  tip.style.top = Math.max(8, top) + 'px';
}
const hideTip = () => { const t = $('#tip'); if (t) t.hidden = true; };
function yAxis(ticks, Y, padL, x2) {
  return ticks.map(v => `<line x1="${padL}" x2="${x2}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" style="stroke:${v === 0 ? 'var(--line)' : 'var(--line-soft)'}" stroke-width="1"/>`
    + `<text x="${padL - 8}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end" style="fill:var(--fg-3)">${moneyK(v)}</text>`).join('');
}
function barPath(cx, y0, y1, w, r) {
  const x0 = cx - w / 2, x1 = cx + w / 2, h = Math.abs(y1 - y0);
  r = Math.min(r, h, w / 2);
  if (y1 < y0) return `M${x0},${y0}V${y1 + r}Q${x0},${y1} ${x0 + r},${y1}H${x1 - r}Q${x1},${y1} ${x1},${y1 + r}V${y0}Z`;
  return `M${x0},${y0}V${y1 - r}Q${x0},${y1} ${x0 + r},${y1}H${x1 - r}Q${x1},${y1} ${x1},${y1 - r}V${y0}Z`;
}
function drawEquity(el, series, emptyMsg) {
  const W = Math.max(240, el.clientWidth), H = W < 520 ? 210 : 250;
  el.style.height = H + 'px';
  if (series.length < 2) { el.innerHTML = `<div class="chart-empty">${esc(emptyMsg)}</div>`; el.onpointermove = el.onpointerleave = null; return; }
  const padL = W < 520 ? 46 : 56, padR = 12, padT = 14, padB = 26, iw = W - padL - padR, ih = H - padT - padB;
  const vals = series.map(p => p.value);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (hi - lo < 1) { hi += 100; lo -= 100; }
  const ticks = niceTicks(lo, hi, 4); lo = ticks[0]; hi = ticks[ticks.length - 1];
  const X = i => padL + i * iw / (series.length - 1);
  const Y = v => padT + (hi - v) / (hi - lo) * ih;
  const y0 = Y(0);
  const pts = series.map((p, i) => [X(i), Y(p.value)]);
  const line = 'M' + pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join('L');
  const last = pts[pts.length - 1];
  const area = `${line}L${last[0].toFixed(1)},${y0.toFixed(1)}L${pts[0][0].toFixed(1)},${y0.toFixed(1)}Z`;
  const u = 'eq' + Math.random().toString(36).slice(2, 7);
  const idxs = [...new Set([1, Math.round(series.length / 2), series.length - 1])].filter(i => i > 0 && i < series.length);
  const xl = idxs.map((i, k) => `<text x="${X(i).toFixed(1)}" y="${H - 6}" text-anchor="${k === idxs.length - 1 ? 'end' : k === 0 && idxs.length > 1 ? 'start' : 'middle'}" style="fill:var(--fg-3)">${esc(series[i].axis || series[i].label)}</text>`).join('');
  const endV = series[series.length - 1].value;
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Running P&amp;L, ending at ${money(endV)}">
    <defs>
      <clipPath id="${u}a"><rect x="0" y="0" width="${W}" height="${Math.max(0, y0).toFixed(1)}"/></clipPath>
      <clipPath id="${u}b"><rect x="0" y="${y0.toFixed(1)}" width="${W}" height="${Math.max(0, H - y0).toFixed(1)}"/></clipPath>
      <linearGradient id="${u}g" gradientUnits="userSpaceOnUse" x1="0" y1="${padT}" x2="0" y2="${y0.toFixed(1)}"><stop offset="0" style="stop-color:var(--win);stop-opacity:.34"/><stop offset="1" style="stop-color:var(--win);stop-opacity:0"/></linearGradient>
      <linearGradient id="${u}r" gradientUnits="userSpaceOnUse" x1="0" y1="${(padT + ih).toFixed(1)}" x2="0" y2="${y0.toFixed(1)}"><stop offset="0" style="stop-color:var(--loss);stop-opacity:.34"/><stop offset="1" style="stop-color:var(--loss);stop-opacity:0"/></linearGradient>
    </defs>
    ${yAxis(ticks, Y, padL, W - padR)}
    <path d="${area}" clip-path="url(#${u}a)" style="fill:url(#${u}g)"/>
    <path d="${area}" clip-path="url(#${u}b)" style="fill:url(#${u}r)"/>
    <path d="${line}" clip-path="url(#${u}a)" style="fill:none;stroke:var(--win)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="${line}" clip-path="url(#${u}b)" style="fill:none;stroke:var(--loss)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
    <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="5" style="fill:${endV >= 0 ? 'var(--win)' : 'var(--loss)'};stroke:var(--surface)" stroke-width="2.5"/>
    ${xl}
    <g class="xh" style="display:none"><line y1="${padT}" y2="${padT + ih}" style="stroke:var(--fg-3)" stroke-dasharray="3 3"/><circle r="5" style="stroke:var(--surface)" stroke-width="2.5"/></g>
  </svg>`;
  const svg = el.firstElementChild, xh = $('.xh', svg), xl2 = $('line', xh), xc = $('circle', xh);
  el.onpointermove = e => {
    const r = svg.getBoundingClientRect();
    const i = clamp(Math.round((e.clientX - r.left - padL) / (iw / (series.length - 1))), 0, series.length - 1);
    const p = series[i];
    xh.style.display = '';
    xl2.setAttribute('x1', X(i)); xl2.setAttribute('x2', X(i));
    xc.setAttribute('cx', X(i)); xc.setAttribute('cy', Y(p.value));
    xc.style.fill = p.value >= 0 ? 'var(--win)' : 'var(--loss)';
    showTip(`<b class="${cls(p.value)}">${money(p.value)}</b>${esc(p.label)}${isNum(p.delta) && i > 0 ? `<br>${esc(p.deltaLabel || 'Change')}: <span class="${cls(p.delta)}">${money(p.delta)}</span>` : ''}`, e.clientX, e.clientY);
  };
  el.onpointerleave = () => { xh.style.display = 'none'; hideTip(); };
}
function drawBars(el, items, o) {
  const opt = o || {};
  const W = Math.max(240, el.clientWidth), H = opt.height || (W < 520 ? 180 : 210);
  el.style.height = H + 'px';
  el.classList.toggle('pickable', !!opt.onPick && items.length > 0);
  if (!items.length) { el.innerHTML = `<div class="chart-empty">${esc(opt.empty || 'No trades yet')}</div>`; el.onpointermove = el.onpointerleave = el.onclick = null; return; }
  const padL = W < 520 ? 44 : 54, padR = 10, padT = 18, padB = 24, iw = W - padL - padR, ih = H - padT - padB;
  const vals = items.map(d => d.value).concat(isNum(opt.avg) ? [opt.avg] : []);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  if (hi - lo < 1) { hi += 100; lo -= 100; }
  const ticks = niceTicks(lo, hi, 4); lo = ticks[0]; hi = ticks[ticks.length - 1];
  const Y = v => padT + (hi - v) / (hi - lo) * ih, y0 = Y(0);
  const band = iw / items.length, bw = clamp(band * 0.62, 3, 30);
  const step = Math.max(1, Math.ceil(34 / band));
  let bars = '', labels = '';
  items.forEach((d, i) => {
    const cx = padL + band * (i + 0.5), y1 = Y(d.value);
    if (Math.abs(y1 - y0) < 1.5) bars += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${(y0 - 1).toFixed(1)}" width="${bw.toFixed(1)}" height="2" style="fill:${d.empty ? 'var(--line)' : 'var(--flat)'}"/>`;
    else bars += `<path d="${barPath(cx, y0, y1, bw, 4)}" style="fill:${d.value > 0 ? 'var(--win)' : 'var(--loss)'}"/>`;
    if (i % step === 0) labels += `<text x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle" style="fill:var(--fg-3)">${esc(d.label)}</text>`;
  });
  const avg = isNum(opt.avg) ? `<line x1="${padL}" x2="${padL + iw}" y1="${Y(opt.avg).toFixed(1)}" y2="${Y(opt.avg).toFixed(1)}" style="stroke:var(--amber)" stroke-width="1.5" stroke-dasharray="5 4"/><text x="${padL + iw}" y="${(Y(opt.avg) - 6).toFixed(1)}" text-anchor="end" style="fill:var(--amber)">${esc(opt.avgLabel || 'avg')} ${money(opt.avg)}</text>` : '';
  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opt.aria || 'Bar chart')}">
    ${yAxis(ticks, Y, padL, W - padR)}
    <rect class="hl" y="${padT}" height="${ih}" width="${band.toFixed(1)}" rx="6" style="fill:var(--surface-3);display:none"/>
    ${bars}${avg}${labels}
  </svg>`;
  const svg = el.firstElementChild, hl = $('.hl', svg);
  const idxAt = e => { const r = svg.getBoundingClientRect(); return Math.floor((e.clientX - r.left - padL) / band); };
  el.onpointermove = e => {
    const i = idxAt(e);
    if (i < 0 || i >= items.length) { hl.style.display = 'none'; hideTip(); return; }
    hl.style.display = ''; hl.setAttribute('x', (padL + band * i).toFixed(1));
    showTip(items[i].tip, e.clientX, e.clientY);
  };
  el.onpointerleave = () => { hl.style.display = 'none'; hideTip(); };
  el.onclick = opt.onPick ? e => { const i = idxAt(e); if (i >= 0 && i < items.length) { hideTip(); opt.onPick(i); } } : null;
}
function miniBars(values) {
  if (!values.length) return `<svg class="mini" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="100" y1="12" y2="12" style="stroke:var(--line)" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`;
  const v = values.slice(-24), m = Math.max(...v.map(Math.abs)) || 1, bw = 100 / v.length;
  return `<svg class="mini" viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><line x1="0" x2="100" y1="12" y2="12" style="stroke:var(--line)" stroke-width="1" vector-effect="non-scaling-stroke"/>${v.map((x, i) => { const h = Math.max(1, Math.abs(x) / m * 11); return `<rect x="${(i * bw + bw * 0.18).toFixed(2)}" width="${(bw * 0.64).toFixed(2)}" y="${(x >= 0 ? 12 - h : 12).toFixed(2)}" height="${h.toFixed(2)}" style="fill:${x >= 0 ? 'var(--win)' : 'var(--loss)'}"/>`; }).join('')}</svg>`;
}
function equitySeries(ts, perTrade) {
  let c = 0;
  if (perTrade) return [{label: 'Start', value: 0}].concat(ts.map(x => { c += Number(x.pnl) || 0; return {label: `${x.entryTime || ''} ${x.sym} ${x.side === 'short' ? 'short' : 'long'}`.trim(), axis: x.entryTime || shortMD(x.date), value: c, delta: x.pnl, deltaLabel: 'Trade'}; }));
  const byDay = new Map();
  for (const x of ts) byDay.set(x.date, (byDay.get(x.date) || 0) + (Number(x.pnl) || 0));
  return [{label: 'Start', value: 0}].concat([...byDay.entries()].map(([d, v]) => { c += v; return {label: prettyDate(d), axis: shortDate(d), value: c, delta: v, deltaLabel: 'Day'}; }));
}

/* =========================================================
   Shared components
   ========================================================= */
function tradeRow(t) {
  const emo = (t.emoBefore || [])[0];
  const meta = [emo, t.followedPlan ? PLAN_LABEL[t.followedPlan] : null].filter(Boolean).join(' · ');
  return `<button class="trow" data-act="open-trade" data-id="${esc(t.id)}">
    <span class="c-date"><span>${esc(shortDate(t.date))}</span><small>${esc(t.entryTime || '')}</small></span>
    <span class="c-sym">${esc(t.sym)} <span class="side ${t.side === 'short' ? 'short' : 'long'}">${t.side === 'short' ? 'Short' : 'Long'}</span></span>
    <span class="c-setup"><span>${esc(t.setup || 'No setup tagged')}</span>${meta ? `<small>${esc(meta)}</small>` : ''}</span>
    <span class="c-r">${fmtR(t.r)}</span>
    <span class="c-pnl num ${cls(t.pnl)}">${money(t.pnl)}</span>
  </button>`;
}
function breakdownRows(rows, emptyMsg) {
  if (!rows.length) return emptyMsg ? `<p class="empty-note">${esc(emptyMsg)}</p>` : '';
  const m = Math.max(...rows.map(r => Math.abs(r.net))) || 1;
  return `<div class="brows">${rows.map(r => `<div class="brow">
      <div class="brow-l">${esc(r.label != null ? r.label : r.key)}<small>${plural(r.n, 'trade')} · ${pct(r.wr)} win${r.extra ? ' · ' + esc(r.extra) : ''}</small></div>
      <div class="dbar" aria-hidden="true"><i class="${r.net >= 0 ? 'pos' : 'neg'}" style="width:${(Math.abs(r.net) / m * 50).toFixed(1)}%"></i></div>
      <div class="brow-v num ${cls(r.net)}">${money(r.net)}</div>
    </div>`).join('')}</div>`;
}
function chipGroup(field, options, selected, o) {
  const opt = o || {};
  const sel = new Set([].concat(selected == null ? [] : selected).map(String));
  return `<div class="chips ${opt.cls || ''}" data-field="${field}" data-multi="${opt.multi ? 1 : 0}" role="group" aria-label="${esc(opt.label || field)}">${options.map(x => {
    const v = typeof x === 'object' ? x.v : x, l = typeof x === 'object' ? x.l : x;
    const t = opt.tone === 'emo' ? tone(v) : (opt.tone || '');
    return `<button type="button" class="chip ${t}" data-v="${esc(v)}" aria-pressed="${sel.has(String(v))}">${esc(l)}</button>`;
  }).join('')}</div>`;
}
function readChips(root, field) {
  const g = $(`[data-field="${field}"]`, root);
  if (!g) return null;
  const v = $$('.chip[aria-pressed="true"]', g).map(b => b.dataset.v);
  return g.dataset.multi === '1' ? v : (v[0] != null ? v[0] : null);
}
const staticChips = (arr, t) => (arr && arr.length) ? `<div class="chips">${arr.map(v => `<span class="chip on ${t === 'emo' ? tone(v) : (t || '')}">${esc(v)}</span>`).join('')}</div>` : '<span class="hint">Not recorded</span>';
function toast(msg, kind) {
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
const loadingCard = () => S.loadError
  ? `<div class="card"><div class="eyebrow">Could not load your journal</div><p class="h3" style="margin:6px 0 12px">${esc(S.loadError)}</p><button class="btn btn-primary btn-sm" data-act="retry-load">Try again</button></div>`
  : `<div class="card loading-card"><span class="spinner" aria-hidden="true"></span>Loading your journal…</div>`;
const firstName = () => (S.user && S.user.name ? S.user.name.split(' ')[0] : '');

/* =========================================================
   Sheet (drawer / modal)
   ========================================================= */
let lastFocus = null;
function openSheet(html, size) {
  const ov = $('#overlay'), sh = $('#sheet');
  lastFocus = document.activeElement;
  sh.className = 'sheet ' + (size || '');
  sh.innerHTML = html;
  ov.hidden = false;
  document.body.classList.add('locked');
  requestAnimationFrame(() => { ov.classList.add('open'); const f = $('.sheet-head .icon-btn', sh); if (f) f.focus({preventScroll: true}); });
  hideTip(); closeMenu();
}
function closeSheet() {
  const ov = $('#overlay');
  ov.classList.remove('open');
  ov.hidden = true;
  $('#sheet').innerHTML = '';
  document.body.classList.remove('locked');
  S.form = null; S.sheetKind = null;
  if (lastFocus && lastFocus.isConnected) lastFocus.focus({preventScroll: true});
}

/* =========================================================
   Shell: nav, account menu, sync status, banner
   ========================================================= */
function navRoute(id) {
  if (id === 'reports') return repRoute(S.lastG || 'week', todayStr());
  if (id === 'calendar') return 'calendar/' + S.calMonth;
  return id;
}
function renderNav() {
  const cur = S.route.view;
  $('#topNav').innerHTML = NAV.map(n => `<a class="tab" href="#${navRoute(n.id)}" data-go="${navRoute(n.id)}" ${n.id === cur ? 'aria-current="page"' : ''}>${ICON[n.id]}<span>${n.l}</span></a>`).join('');
  $('#bottomNav').innerHTML = NAV.map(n => `<a class="bnav" href="#${navRoute(n.id)}" data-go="${navRoute(n.id)}" ${n.id === cur ? 'aria-current="page"' : ''}><span class="ico">${ICON[n.id]}</span>${n.l}</a>`).join('');
  renderAcctBtn();
}
function renderAcctBtn() {
  const b = $('#acctBtn'), u = S.user;
  b.innerHTML = u && u.avatar ? `<img src="${esc(u.avatar)}" alt="" referrerpolicy="no-referrer">` : ICON.user;
}
function openMenu() {
  const m = $('#acctMenu'), u = S.user || {};
  m.innerHTML = `${(u.name || u.email) ? `<div class="menu-who">${u.avatar ? `<img src="${esc(u.avatar)}" alt="" referrerpolicy="no-referrer">` : ''}<div><b>${esc(u.name || 'Your account')}</b>${u.email ? `<span>${esc(u.email)}</span>` : ''}</div></div>` : ''}
    <a class="menu-item" role="menuitem" href="#settings" data-go="settings">${ICON.settings}Settings</a>
    <button class="menu-item" role="menuitem" data-act="export-json">${ICON.download}Export backup</button>
    ${SITE ? `<button class="menu-item danger" role="menuitem" data-act="sign-out">${ICON.logout}Sign out</button>` : ''}`;
  m.hidden = false;
  $('#acctBtn').setAttribute('aria-expanded', 'true');
}
function closeMenu() {
  const m = $('#acctMenu');
  if (m && !m.hidden) { m.hidden = true; $('#acctBtn').setAttribute('aria-expanded', 'false'); }
}
function renderSync() {
  const el = $('#sync');
  let c = 'loading', t = 'Connecting…';
  const mode = Store ? Store.mode : 'loading';
  if (S.previewOn) { c = 'sample'; t = 'Sample preview'; }
  else if (mode === 'cloud') { c = 'cloud'; t = 'Synced'; }
  else if (mode === 'local') { c = 'local'; t = 'Saved on this device'; }
  else if (mode === 'error') { c = 'err'; t = 'Not syncing — reload'; }
  el.className = 'sync ' + c;
  el.innerHTML = `<i></i><span>${t}</span>`;
  el.title = t;
}
function renderBanner() {
  $('#banner').innerHTML = S.previewOn && !S.loading ? `<div class="preview-banner">
      <div><div class="eyebrow">Sample preview</div><p>These trades are made-up examples so you can see how every screen works. Nothing here is yours. Your real journal starts when you log your first trade.</p></div>
      <div class="row"><button class="btn btn-primary" data-act="log">Log my first trade</button><button class="btn" data-act="hide-sample">Hide sample</button></div>
    </div>` : '';
}

/* =========================================================
   Views
   ========================================================= */
// sample preview: a funded account sized to the sample trades, so the demo never shows as blown
function sampleAccount() {
  if (S.sampleAcct) return S.sampleAcct;
  const days = new Map();
  for (const t of sortTrades(S.sample.trades)) days.set(t.date, (days.get(t.date) || 0) + t.pnl);
  let c = 0, peak = 0, dd = 0, worst = 0;
  for (const v of days.values()) { c += v; peak = Math.max(peak, c); dd = Math.max(dd, peak - c); worst = Math.min(worst, v); }
  const up = (v, n) => Math.ceil(v / n) * n;
  S.sampleAcct = {accountName: 'Sample 50K funded account', start: 50000, ddType: 'trailing', riskPerTrade: 600,
    target: up(Math.max(3000, c + 1500), 500), maxDD: up(Math.max(2500, dd - Math.min(0, c) + 1000), 500), dailyLimit: up(Math.max(1000, -worst * 1.3), 100)};
  return S.sampleAcct;
}
const acctSettings = () => S.previewOn ? Object.assign({}, S.settings, sampleAccount()) : S.settings;
function accountCard(trades) {
  const s = acctSettings();
  if (!(s.start > 0)) return {a: null, s, html: `<div class="card">
    <div class="eyebrow">Account</div><p class="h3" style="margin-top:6px">Track a funded account</p>
    <p class="excerpt">Add your account size, profit target, max drawdown and daily loss limit to see your balance and how close you are to each rule.</p>
    <a class="btn btn-sm btn-primary" href="#settings" data-go="settings">Set up account</a>
  </div>`};
  const a = accountState(trades, s);
  const tgtPct = s.target ? clamp(a.profit / s.target, 0, 1) : 0;
  const bufPct = s.maxDD ? clamp(a.buffer / s.maxDD, 0, 1) : 0;
  const dayPct = s.dailyLimit ? clamp(a.dailyUsed / s.dailyLimit, 0, 1) : 0;
  const meters = [
    s.target > 0 ? `<div class="meter"><div class="meter-top"><span>Profit target</span><b>${money(Math.max(0, a.profit), {sign: false})} / ${money(s.target, {sign: false})}</b></div><div class="meter-track"><div class="meter-fill" style="width:${(tgtPct * 100).toFixed(1)}%"></div></div><span class="hint">${a.profit >= s.target ? 'Target reached.' : `${money(s.target - a.profit, {sign: false})} to go`}</span></div>` : '',
    s.maxDD > 0 ? `<div class="meter"><div class="meter-top"><span>Drawdown buffer</span><b>${money(Math.max(0, a.buffer), {sign: false})} left</b></div><div class="meter-track"><div class="meter-fill ${bufPct > 0.5 ? 'good' : bufPct > 0.25 ? 'warn' : 'bad'}" style="width:${(bufPct * 100).toFixed(1)}%"></div></div><span class="hint">Account fails below ${money(a.level, {sign: false})}${s.ddType === 'trailing' ? ' · trails end-of-day highs, locks at starting balance' : ''}</span></div>` : '',
    s.dailyLimit > 0 ? `<div class="meter"><div class="meter-top"><span>Daily loss used</span><b>${money(a.dailyUsed, {sign: false})} / ${money(s.dailyLimit, {sign: false})}</b></div><div class="meter-track"><div class="meter-fill ${dayPct < 0.5 ? 'good' : dayPct < 0.85 ? 'warn' : 'bad'}" style="width:${(dayPct * 100).toFixed(1)}%"></div></div><span class="hint">${dayPct >= 1 ? 'Daily limit hit. Done for today.' : `Today: <span class="${cls(a.todayNet)}">${money(a.todayNet)}</span>`}</span></div>` : ''
  ].join('');
  return {a, s, html: `<div class="card">
    <div class="card-head"><div><div class="eyebrow">Account</div><h2 class="h3">${esc(s.accountName || 'My account')}</h2></div>${S.previewOn ? '<span class="pill">Sample</span>' : '<a class="link" href="#settings" data-go="settings">Edit rules</a>'}</div>
    <div class="acct-bal"><span class="num big">${money(a.bal, {sign: false})}</span><span class="num ${cls(a.profit)}" style="font-size:15px">${money(a.profit)} total</span></div>
    ${meters ? `<div class="meters">${meters}</div>` : ''}
  </div>`};
}
function projectionCard(trades, acct) {
  if (!acct.a) return '';
  const s = acct.s;
  if (!(s.target > 0)) return `<div class="card"><div class="eyebrow">Projection</div><p class="h3" style="margin-top:6px">Add a profit target</p><p class="hint" style="margin-top:8px">Set a profit target in Settings to see how many trading days it could take at your current pace.</p></div>`;
  const pr = projection(trades, s, acct.a);
  if (!pr) return `<div class="card"><div class="eyebrow">Projection</div><p class="proj-head" style="margin-top:6px">Log 5 trades to see your pace</p><p class="hint" style="margin-top:8px">Projects when you'll hit your profit target from your recent expectancy and how many trades you take per day.</p></div>`;
  const head = pr.days === 0 ? '<em>Target reached</em>' : pr.days != null ? `<em>~${plural(pr.days, 'trading day')}</em> to target` : 'Not on pace for target';
  return `<div class="card gborder"><div class="eyebrow">Projection</div><p class="proj-head" style="margin-top:6px">${head}</p>
    <dl class="kv">
      <dt>Expectancy per trade</dt><dd class="${cls(pr.exp)}">${money(pr.exp)}</dd>
      <dt>Trades per day</dt><dd>${pr.tpd.toFixed(1)}</dd>
      <dt>Projected per day</dt><dd class="${cls(pr.daily)}">${money(pr.daily)}</dd>
      <dt>Month-end pace</dt><dd class="${cls(pr.monthEnd)}">${money(pr.monthEnd)}</dd>
    </dl>
    <p class="hint" style="margin-top:12px">${pr.days == null ? 'Your recent expectancy is negative. The Mindset tab shows what is costing you. ' : ''}Based on your last ${pr.n} trades and ${plural(pr.rem, 'trading day')} left this month. A pace, not a promise.</p></div>`;
}
function todayJournalCard(days) {
  const t = todayStr(), td = days[t];
  if (td && (td.plan || (td.mood && td.mood.length) || td.bias)) return `<div class="card">
      <div class="card-head"><div><div class="eyebrow">Today's journal</div><h2 class="h3">${esc(prettyDate(t))}</h2></div>${td.bias ? `<span class="pill ${td.bias === 'Bullish' ? 'good' : td.bias === 'Bearish' ? 'bad' : ''}">${esc(td.bias)}</span>` : ''}</div>
      ${td.mood && td.mood.length ? staticChips(td.mood, 'emo') : ''}
      ${td.plan ? `<p class="excerpt">${esc(trunc(td.plan, 240))}</p>` : ''}
      <div class="row"><button class="btn btn-sm" data-act="open-day" data-date="${t}">Edit journal</button><a class="link" href="#${repRoute('day', t)}" data-go="${repRoute('day', t)}">Today's report</a></div>
    </div>`;
  return `<div class="card"><div class="eyebrow">Today's journal</div><p class="h3" style="margin-top:6px">No pre-market plan yet</p><p class="excerpt">Write your bias, key levels and rules before the open. Traders who plan first take fewer impulse trades.</p><button class="btn btn-sm btn-primary" data-act="open-day" data-date="${t}">Write today's plan</button></div>`;
}

function renderHome() {
  const el = $('#v-home');
  if (S.loading) { el.innerHTML = loadingCard(); return; }
  const {trades, days} = data(), t = todayStr();
  const per = PERIODS.map(p => { const ts = trades.filter(x => inPeriod(x.date, p.id)); return {p, ts, st: stats(ts)}; });
  const hr = new Date().getHours();
  const greet = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
  const name = firstName();
  const welcome = (!trades.length && !S.previewOn) ? `<div class="card welcome gborder">
      <div><div class="eyebrow">Welcome</div><h2 class="h2">Start your trading journal</h2><p>Log each trade with why you took it and how you felt. After a couple of weeks, the Mindset tab shows which emotions, mistakes and setups make or cost you money.</p></div>
      <div style="display:grid;gap:10px">
        <div class="row"><span class="small">What do you trade?</span><div class="seg" role="group" aria-label="What do you trade">${[['futures', 'Futures'], ['forex', 'Forex'], ['both', 'Both']].map(([v, l]) => { const cur = S.settings.markets.length > 1 ? 'both' : S.settings.markets[0]; return `<button type="button" class="chip" data-act="set-markets" data-m="${v}" aria-pressed="${cur === v}">${l}</button>`; }).join('')}</div></div>
        <div class="row"><button class="btn btn-primary" data-act="log">Log a trade</button><button class="btn" data-act="open-day" data-date="${t}">Write today's plan</button><button class="btn btn-ghost" data-act="show-sample">See a sample</button></div>
      </div>
    </div>` : '';
  const pcard = x => {
    const vals = x.p.id === 'today' ? x.st.sorted.map(y => y.pnl) : [...x.st.byDay.values()];
    const route = repRoute(x.p.g, t);
    return `<a class="pcard" href="#${route}" data-go="${route}" aria-label="${x.p.label}: ${money(x.st.net)}. Open report">
      <span class="pcard-top"><span class="eyebrow">${x.p.label}</span><span class="pcard-sub">${esc(periodSub(x.p.id))}</span></span>
      <span class="pnl num ${cls(x.st.net)}">${money(x.st.net)}</span>
      <span class="pcard-meta">${plural(x.st.n, 'trade')}${x.st.winRate != null ? ` · ${pct(x.st.winRate)} win` : ''}</span>
      ${miniBars(vals)}
      <span class="pcard-go"><span>View report</span><span aria-hidden="true">→</span></span>
    </a>`;
  };
  const month = per[2];
  const all = sortTrades(trades);
  const hit = n => {
    const r = all.slice(-n);
    if (!r.length) return `<div class="hit"><span class="k">L${n}</span><span class="v num">—</span><span class="s">no trades</span></div>`;
    const w = r.filter(x => x.pnl > 0).length, l = r.filter(x => x.pnl < 0).length, rate = w + l ? w / (w + l) : 0;
    return `<div class="hit ${rate >= 0.5 ? 'good' : 'bad'}"><span class="k">L${n}</span><span class="v num">${pct(rate)}</span><span class="s">${w} of ${r.length} won</span></div>`;
  };
  let streak = '';
  if (all.length) {
    const s0 = Math.sign(all[all.length - 1].pnl);
    let k = 0;
    for (let i = all.length - 1; i >= 0 && Math.sign(all[i].pnl) === s0; i--) k++;
    if (s0 !== 0) streak = `<div class="hit ${s0 > 0 ? 'good' : 'bad'}"><span class="k">STREAK</span><span class="v num">${s0 > 0 ? 'W' : 'L'}${k}</span><span class="s">current run</span></div>`;
  }
  const last20 = all.slice(-20);
  const avg20 = last20.length ? sum(last20, x => x.pnl) / last20.length : null;
  const recent = all.slice(-6).reverse();
  const acct = accountCard(trades);
  const monthRoute = repRoute('month', t);

  el.innerHTML = `<div class="greet"><div><div class="eyebrow">${esc(prettyDate(t, true))}</div><h1 class="h1">${greet}${name ? ', ' + esc(name) : ''}</h1></div></div>
    ${welcome}
    <div class="period-strip">${per.map(pcard).join('')}</div>
    <div class="dash-grid">
      <div class="col">
        <div class="card">
          <div class="card-head">
            <div><div class="eyebrow">Equity curve</div><h2 class="h2">This month <span class="muted">${esc(periodSub('month'))}</span></h2></div>
            <div style="text-align:right"><div class="num big ${cls(month.st.net)}">${money(month.st.net)}</div><a class="link" href="#${monthRoute}" data-go="${monthRoute}">Month report</a></div>
          </div>
          <div class="chart" id="chEquity"></div>
        </div>
        <div class="card">
          <div class="card-head"><div><div class="eyebrow">Recent form</div><h2 class="h2">Last 20 trades</h2></div><div class="hits">${hit(5)}${hit(10)}${hit(20)}${streak}</div></div>
          <div class="chart" id="chLast20"></div>
        </div>
      </div>
      <div class="col">${acct.html}${projectionCard(trades, acct)}${todayJournalCard(days)}</div>
    </div>
    <div class="card">
      <div class="card-head"><div><div class="eyebrow">Journal</div><h2 class="h2">Recent trades</h2></div>${all.length ? '<a class="link" href="#trades" data-go="trades">All trades</a>' : ''}</div>
      ${recent.length ? `<div class="tlist">${recent.map(tradeRow).join('')}</div>` : '<p class="empty-note">Your trades will show up here.</p>'}
    </div>`;
  mount($('#chEquity'), e => drawEquity(e, equitySeries(month.ts, month.st.days <= 1), 'No trades this month yet. Your equity curve starts with your first trade.'));
  mount($('#chLast20'), e => drawBars(e, last20.map(x => ({
    value: x.pnl, label: shortMD(x.date), id: x.id,
    tip: `<b class="${cls(x.pnl)}">${money(x.pnl)}</b>${esc(x.sym)} ${x.side === 'short' ? 'short' : 'long'} · ${esc(prettyDate(x.date))}${x.setup ? '<br>' + esc(x.setup) : ''}`
  })), {avg: avg20, avgLabel: 'avg', aria: 'P&L of the last 20 trades', empty: 'Your last 20 trades will chart here.', onPick: i => openTradeDetail(last20[i].id)}));
}

function journalBlocks(d) {
  if (!d) return '';
  const pre = (d.sleep || d.bias || (d.mood && d.mood.length) || d.plan || d.maxTrades != null);
  const post = ((d.feel && d.feel.length) || d.followedPlan || d.discipline || d.wentWell || d.improve || d.lesson || d.notes);
  const qa = (q, a) => a ? `<div><div class="qlabel">${q}</div><p class="quote">${esc(a)}</p></div>` : '';
  return `${pre ? `<div class="jblock"><div class="eyebrow">Before the open</div>
      <div class="row">${d.bias ? `<span class="pill ${d.bias === 'Bullish' ? 'good' : d.bias === 'Bearish' ? 'bad' : ''}">${esc(d.bias)} bias</span>` : ''}${d.sleep ? `<span class="pill">Sleep ${d.sleep}/5</span>` : ''}${d.maxTrades != null ? `<span class="pill">Max ${plural(d.maxTrades, 'trade')}</span>` : ''}</div>
      ${d.mood && d.mood.length ? staticChips(d.mood, 'emo') : ''}${qa('Plan', d.plan)}</div>` : ''}
    ${post ? `<div class="jblock"><div class="eyebrow">After the close</div>
      <div class="row">${d.followedPlan ? `<span class="pill ${d.followedPlan === 'yes' ? 'good' : d.followedPlan === 'no' ? 'bad' : 'mid'}">${PLAN_LABEL[d.followedPlan] || esc(d.followedPlan)}</span>` : ''}${d.discipline ? `<span class="pill">Discipline ${d.discipline}/10</span>` : ''}</div>
      ${d.feel && d.feel.length ? staticChips(d.feel, 'emo') : ''}${qa('What went well', d.wentWell)}${qa('What to improve', d.improve)}${qa('Lesson', d.lesson)}${qa('Notes', d.notes)}</div>` : ''}`;
}

function renderReports() {
  const el = $('#v-reports');
  if (S.loading) { el.innerHTML = loadingCard(); return; }
  const {trades, days} = data();
  const {g, anchor} = S.route;
  const r = rangeFor(g, anchor), t = todayStr();
  const ts = sortTrades(trades.filter(x => inRange(x.date, r)));
  const st = stats(ts);
  const cur = inRange(t, r);
  const prevA = shiftAnchor(g, anchor, -1), nextA = shiftAnchor(g, anchor, 1);
  const nextOff = g === 'all' || rangeFor(g, nextA).from > t;
  const prevSt = g === 'all' ? null : stats(trades.filter(x => inRange(x.date, rangeFor(g, prevA))));
  const switchAnchor = cur ? t : (ts.length ? ts[ts.length - 1].date : anchor);
  const PREV = {day: 'previous day', week: 'previous week', month: 'previous month', year: 'previous year'};
  const THIS = {day: 'Today', week: 'This week', month: 'This month', year: 'This year'};
  const NOUN = {day: 'day', week: 'week', month: 'month', year: 'year'};

  let vs = '';
  if (prevSt && (prevSt.n || st.n)) {
    const d = st.net - prevSt.net;
    vs = `<span class="pill ${d > 0 ? 'good' : d < 0 ? 'bad' : ''}">${d >= 0 ? '▲' : '▼'} ${money(Math.abs(d), {sign: false})} vs ${PREV[g]}</span><span class="hint">${PREV[g][0].toUpperCase() + PREV[g].slice(1)}: ${money(prevSt.net)}</span>`;
  }
  const holds = ts.map(holdMinutes).filter(isNum);
  const kpi = (k, v, c) => `<div><dt>${k}</dt><dd class="num ${c || ''}">${v}</dd></div>`;
  const kpis = [
    kpi('Trades', st.n),
    kpi('Win rate', `${pct(st.winRate)} <small>${st.wins}W ${st.losses}L</small>`),
    kpi('Profit factor', st.pf == null ? '—' : st.pf === Infinity ? '∞' : st.pf.toFixed(2), st.pf != null ? (st.pf >= 1 ? 'pos' : 'neg') : ''),
    kpi('Average R', fmtR(st.avgR), cls(st.avgR)),
    kpi('Expectancy', money(st.exp), cls(st.exp)),
    kpi('Best trade', money(st.maxW), st.maxW ? 'pos' : ''),
    kpi('Worst trade', money(st.maxL), st.maxL ? 'neg' : ''),
    g === 'day' ? kpi('Average hold', holds.length ? `${Math.round(sum(holds) / holds.length)} <small>min</small>` : '—')
      : kpi('Green / red days', `<span class="pos">${st.green}</span> <small>/</small> <span class="neg">${st.red}</span>`)
  ].join('');

  // bar breakdown
  let bars = [], barTitle = '', pick = null;
  const dayTip = (ds, v, n) => `<b class="${cls(v)}">${n ? money(v) : 'No trades'}</b>${esc(prettyDate(ds))}${n ? ' · ' + plural(n, 'trade') : ''}`;
  if (g === 'day') {
    barTitle = 'P&L by trade';
    bars = ts.map((x, i) => ({value: x.pnl, label: x.entryTime || `#${i + 1}`, tip: `<b class="${cls(x.pnl)}">${money(x.pnl)}</b>${esc(x.sym)} ${x.side === 'short' ? 'short' : 'long'}${x.setup ? ' · ' + esc(x.setup) : ''}`}));
    pick = i => openTradeDetail(ts[i].id);
  } else if (g === 'week' || g === 'month') {
    barTitle = 'P&L by day';
    const counts = new Map(); ts.forEach(x => counts.set(x.date, (counts.get(x.date) || 0) + 1));
    for (let d = parseYmd(r.from); ymd(d) <= r.to; d = addDays(d, 1)) {
      const ds = ymd(d), v = st.byDay.get(ds) || 0, n = counts.get(ds) || 0;
      bars.push({value: v, empty: !n, label: g === 'week' ? WEEKDAYS[d.getDay()] : String(d.getDate()), tip: dayTip(ds, v, n), route: repRoute('day', ds)});
    }
    pick = i => go(bars[i].route);
  } else {
    barTitle = 'P&L by month';
    let months = [];
    if (g === 'year') { const y = r.from.slice(0, 4); months = MONTHS.map((_, i) => `${y}-${pad(i + 1)}`); }
    else if (ts.length) {
      const f = parseYmd(ts[0].date), l = parseYmd(ts[ts.length - 1].date > t ? ts[ts.length - 1].date : t);
      for (let d = new Date(f.getFullYear(), f.getMonth(), 1); d <= l; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) months.push(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
    }
    bars = months.map((key, i) => {
      const mts = ts.filter(x => x.date.slice(0, 7) === key), v = sum(mts, x => x.pnl), mi = Number(key.slice(5)) - 1;
      const label = g === 'year' || (mi !== 0 && i !== 0) ? MONTHS[mi] : `${MONTHS[mi]} ’${key.slice(2, 4)}`;
      return {value: v, empty: !mts.length, label, tip: `<b class="${cls(v)}">${mts.length ? money(v) : 'No trades'}</b>${MONTHS_LONG[mi]} ${key.slice(0, 4)}${mts.length ? ' · ' + plural(mts.length, 'trade') : ''}`, route: repRoute('month', key + '-01')};
    });
    pick = i => go(bars[i].route);
  }

  // mindset snapshot
  const ms = mindSnap(ts);
  const msHtml = ts.length ? `<dl class="kv" style="margin-top:0">
      <dt>Followed my plan</dt><dd>${ms.followed == null ? '—' : `${pct(ms.followed)} <span class="muted">of ${ms.planN}</span>`}</dd>
      <dt>Average execution grade</dt><dd>${ms.grade ? `<span class="grade g-${ms.grade}" style="width:24px;height:24px;font-size:13px">${ms.grade}</span>` : '—'}</dd>
      <dt>In the right headspace</dt><dd>${pct(ms.ready)}</dd>
      <dt>Most common feeling before entry</dt><dd>${ms.topEmo ? `${esc(ms.topEmo.key)} <span class="${cls(ms.topEmo.net)}">${money(ms.topEmo.net)}</span>` : '—'}</dd>
      <dt>Costliest feeling</dt><dd>${ms.costEmo ? `${esc(ms.costEmo.key)} <span class="neg">${money(ms.costEmo.net)}</span>` : '—'}</dd>
      <dt>Costliest mistake</dt><dd>${ms.costMis ? `${esc(ms.costMis.key)} <span class="neg">${money(ms.costMis.net)}</span>` : '—'}</dd>
    </dl>` : '<p class="empty-note">No trades in this period.</p>';

  // journal
  let jHtml;
  if (g === 'day') {
    const d = days[anchor];
    const body = journalBlocks(d);
    jHtml = `<div class="card-head"><div><div class="eyebrow">Journal</div><h2 class="h3">${esc(shortDate(anchor))}</h2></div><button class="btn btn-sm ${body ? '' : 'btn-primary'}" data-act="open-day" data-date="${anchor}">${body ? 'Edit journal' : 'Write journal'}</button></div>
      ${body || '<p class="empty-note">No journal for this day yet. Write your plan before the open and a short review after.</p>'}`;
  } else if (g === 'week' || g === 'month') {
    const jd = Object.values(days).filter(d => inRange(d.date, r)).sort((a, b) => a.date < b.date ? 1 : -1);
    jHtml = `<div class="card-head"><div><div class="eyebrow">Journal</div><h2 class="h3">${plural(jd.length, 'entry')}</h2></div></div>
      ${jd.length ? `<div class="jlist">${jd.map(d => `<a class="jrow" href="#${repRoute('day', d.date)}" data-go="${repRoute('day', d.date)}"><b>${esc(prettyDate(d.date))}</b><p>${esc(trunc(d.lesson || d.improve || d.plan || d.wentWell || 'Journal written', 110))}</p>${d.discipline ? `<span class="pill">${d.discipline}/10</span>` : '<span></span>'}</a>`).join('')}</div>` : `<p class="empty-note">No journal entries this ${NOUN[g]}.</p>`}`;
  } else {
    const lessons = [];
    for (const x of ts) if (x.lesson) lessons.push({text: x.lesson, date: x.date, src: `${x.sym} trade`});
    for (const d of Object.values(days)) if (d.lesson && inRange(d.date, r)) lessons.push({text: d.lesson, date: d.date, src: 'Daily review'});
    lessons.sort((a, b) => a.date < b.date ? 1 : -1);
    jHtml = `<div class="card-head"><div><div class="eyebrow">Notebook</div><h2 class="h3">Lessons</h2></div></div>
      ${lessons.length ? `<div class="lessons">${lessons.slice(0, 8).map(l => `<div class="lesson"><p>${esc(l.text)}</p><small>${esc(prettyDate(l.date))} · ${esc(l.src)}</small></div>`).join('')}</div>` : '<p class="empty-note">Lessons from your trades and daily reviews collect here.</p>'}`;
  }

  const bInst = group(ts, x => x.sym).sort((x, y) => y.net - x.net).map(x => Object.assign(x, {extra: inst(x.key) ? inst(x.key).name : ''}));
  const bSetup = group(ts, x => x.setup).sort((x, y) => y.net - x.net);
  const bSess = group(ts, x => x.session).sort((x, y) => SESSIONS.indexOf(x.key) - SESSIONS.indexOf(y.key));
  const listed = ts.slice().reverse();
  const shown = g === 'day' ? listed : listed.slice(0, 25);
  const emptyMsg = `No trades this ${NOUN[g] || 'period'}.`;

  el.innerHTML = `<div class="rep-head">
      <div class="rep-title"><div class="eyebrow">${r.kind} report</div><h1 class="h1">${esc(r.title)}</h1></div>
      <div class="rep-ctrls">
        <div class="seg" role="group" aria-label="Report length">${GRAN.map(x => { const rt = repRoute(x.id, switchAnchor); return `<a class="chip" href="#${rt}" data-go="${rt}" data-replace="1" ${x.id === g ? 'aria-current="page"' : ''}>${x.l}</a>`; }).join('')}</div>
        ${g !== 'all' ? `<div class="row">
          <a class="icon-btn" href="#${repRoute(g, prevA)}" data-go="${repRoute(g, prevA)}" aria-label="Previous ${NOUN[g]}">‹</a>
          ${!cur ? `<a class="btn btn-sm" href="#${repRoute(g, t)}" data-go="${repRoute(g, t)}">${THIS[g]}</a>` : ''}
          <a class="icon-btn" href="#${repRoute(g, nextA)}" data-go="${repRoute(g, nextA)}" aria-label="Next ${NOUN[g]}" ${nextOff ? 'aria-disabled="true" tabindex="-1"' : ''}>›</a>
        </div>` : ''}
      </div>
    </div>
    <div class="card rep-hero gborder">
      <div class="rep-pnl"><div class="eyebrow">Net P&amp;L</div><div class="num huge ${cls(st.net)}">${money(st.net)}</div><div class="row">${vs}</div></div>
      <dl class="kpis">${kpis}</dl>
    </div>
    <div class="rep-charts">
      <div class="card"><div class="card-head"><div><div class="eyebrow">Breakdown</div><h2 class="h3">${barTitle}</h2></div>${bars.length ? '<span class="hint">Tap a bar to open it</span>' : ''}</div><div class="chart" id="chRepBars"></div></div>
      <div class="card"><div class="card-head"><div><div class="eyebrow">Equity</div><h2 class="h3">Running P&amp;L</h2></div></div><div class="chart" id="chRepEq"></div></div>
    </div>
    <div class="rep-grid2">
      <div class="card"><div class="card-head"><div><div class="eyebrow">Mindset</div><h2 class="h3">How I traded</h2></div><a class="link" href="#mindset" data-go="mindset">Full analysis</a></div>${msHtml}</div>
      <div class="card">${jHtml}</div>
    </div>
    <div class="rep-grid3">
      <div class="card"><div class="card-head"><div><div class="eyebrow">Breakdown</div><h2 class="h3">By instrument</h2></div></div>${breakdownRows(bInst, emptyMsg)}</div>
      <div class="card"><div class="card-head"><div><div class="eyebrow">Breakdown</div><h2 class="h3">By setup</h2></div></div>${breakdownRows(bSetup, emptyMsg)}</div>
      <div class="card"><div class="card-head"><div><div class="eyebrow">Breakdown</div><h2 class="h3">By session</h2></div></div>${breakdownRows(bSess, emptyMsg)}</div>
    </div>
    <div class="card">
      <div class="card-head"><div><div class="eyebrow">Trades</div><h2 class="h2">${plural(ts.length, 'trade')}</h2></div>
        <div class="row">${g === 'day' ? `<button class="btn btn-sm" data-act="log" data-date="${anchor}">+ Log a trade on this day</button>` : ''}${ts.length > shown.length ? `<button class="btn btn-sm" data-act="trades-range" data-from="${r.from}" data-to="${r.to}" data-title="${esc(r.title)}">See all ${ts.length}</button>` : ''}</div></div>
      ${shown.length ? `<div class="tlist">${shown.map(tradeRow).join('')}</div>` : `<p class="empty-note">${emptyMsg}</p>`}
    </div>`;

  mount($('#chRepBars'), e => drawBars(e, bars, {aria: barTitle, empty: emptyMsg, onPick: pick}));
  mount($('#chRepEq'), e => drawEquity(e, equitySeries(ts, g === 'day' || st.days <= 1), `${emptyMsg} The running P&L appears once you log one.`));
}

function renderCalendar() {
  const el = $('#v-calendar');
  if (S.loading) { el.innerHTML = loadingCard(); return; }
  const {trades, days} = data();
  const [y, m] = S.calMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1), off = first.getDay(), dim = new Date(y, m, 0).getDate();
  const mt = trades.filter(x => x.date.slice(0, 7) === S.calMonth);
  const st = stats(mt);
  const byDate = new Map();
  for (const x of mt) { if (!byDate.has(x.date)) byDate.set(x.date, []); byDate.get(x.date).push(x); }
  const maxAbs = Math.max(1, ...[...st.byDay.values()].map(Math.abs));
  const t = todayStr(), compact = window.innerWidth < 760;
  const weeks = Math.ceil((off + dim) / 7);
  let grid = WEEKDAYS.map(d => `<div class="cal-h">${d}</div>`).join('') + '<div class="cal-h wk">Week</div>';
  const weekRows = [];
  for (let w = 0; w < weeks; w++) {
    let wNet = 0, wN = 0, wDays = 0, from = null, to = null;
    for (let d = 0; d < 7; d++) {
      const dayNum = w * 7 + d - off + 1;
      if (dayNum < 1 || dayNum > dim) { grid += '<div class="cpad" aria-hidden="true"></div>'; continue; }
      const ds = `${y}-${pad(m)}-${pad(dayNum)}`;
      from = from || ds; to = ds;
      const list = byDate.get(ds) || [], net = sum(list, x => x.pnl), jd = days[ds];
      const hasJ = jd && (jd.plan || jd.lesson || jd.wentWell || jd.improve || jd.notes || (jd.mood && jd.mood.length));
      if (list.length) { wNet += net; wN += list.length; wDays++; }
      const tint = list.length ? (12 + Math.abs(net) / maxAbs * 34).toFixed(0) + '%' : '';
      const c = list.length ? cls(net) : '';
      const rt = repRoute('day', ds);
      grid += `<a class="cday ${c === 'pos' || c === 'neg' ? c : ''} ${d === 0 || d === 6 ? 'wkend' : ''} ${ds === t ? 'today' : ''}" href="#${rt}" data-go="${rt}" ${tint ? `style="--t:${tint}"` : ''} aria-label="${esc(prettyDate(ds, true))}${list.length ? ', ' + money(net) + ', ' + plural(list.length, 'trade') : ', no trades'}${hasJ ? ', journal written' : ''}">
        <span class="cday-n">${dayNum}</span>${hasJ ? '<span class="cday-j" aria-hidden="true"></span>' : ''}
        ${list.length ? `<span class="cday-pnl num">${compact ? moneyK(net, true) : money(net)}</span><span class="cday-meta">${plural(list.length, 'trade')}</span>` : ''}
      </a>`;
    }
    const wsRoute = repRoute('week', from || `${y}-${pad(m)}-01`);
    grid += `<a class="cweek" href="#${wsRoute}" data-go="${wsRoute}"><span>Week ${w + 1}</span>${wN ? `<b class="num ${cls(wNet)}">${money(wNet)}</b><span>${plural(wN, 'trade')} · ${plural(wDays, 'day')}</span>` : '<span>No trades</span>'}</a>`;
    if (from) weekRows.push({label: `${shortDate(from)} – ${shortDate(to)}`, net: wNet, n: wN, route: wsRoute});
  }
  const yearCells = MONTHS.map((mn, i) => {
    const key = `${y}-${pad(i + 1)}`, ts = trades.filter(x => x.date.slice(0, 7) === key), net = sum(ts, x => x.pnl);
    return `<a class="ym" href="#calendar/${key}" data-go="calendar/${key}" data-replace="1" aria-current="${key === S.calMonth}"><span>${mn}</span><b class="num ${ts.length ? cls(net) : 'flat'}">${ts.length ? moneyK(net, true) : '—'}</b><i class="${ts.length ? cls(net) : ''}"></i></a>`;
  }).join('');
  const yNet = sum(trades.filter(x => x.date.slice(0, 4) === String(y)), x => x.pnl);
  const prevM = (() => { const d = new Date(y, m - 2, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; })();
  const nextM = (() => { const d = new Date(y, m, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; })();
  const monthRoute = repRoute('month', `${S.calMonth}-01`);

  el.innerHTML = `<div class="card">
      <div class="cal-head">
        <div class="cal-nav">
          <a class="icon-btn" href="#calendar/${prevM}" data-go="calendar/${prevM}" data-replace="1" aria-label="Previous month">‹</a>
          <h1 class="cal-month">${MONTHS_LONG[m - 1]} ${y}</h1>
          <a class="icon-btn" href="#calendar/${nextM}" data-go="calendar/${nextM}" data-replace="1" aria-label="Next month">›</a>
        </div>
        <div class="row">${S.calMonth !== t.slice(0, 7) ? `<a class="btn btn-sm" href="#calendar/${t.slice(0, 7)}" data-go="calendar/${t.slice(0, 7)}" data-replace="1">Today</a>` : ''}<a class="btn btn-sm btn-primary" href="#${monthRoute}" data-go="${monthRoute}">Month report</a></div>
      </div>
      <div class="mstats">
        <div class="mstat"><span>Month P&amp;L</span><b class="num ${cls(st.net)}">${money(st.net)}</b></div>
        <div class="mstat"><span>Trades</span><b class="num">${st.n}</b></div>
        <div class="mstat"><span>Win rate</span><b class="num">${pct(st.winRate)}</b></div>
        <div class="mstat"><span>Green days</span><b class="num pos">${st.green}</b></div>
        <div class="mstat"><span>Red days</span><b class="num neg">${st.red}</b></div>
        <div class="mstat"><span>Best day</span><b class="num ${st.best && st.best[1] > 0 ? 'pos' : 'flat'}">${st.best && st.best[1] > 0 ? money(st.best[1]) : '—'}</b></div>
      </div>
      <div class="cal">${grid}</div>
      <div class="week-list">${weekRows.map(w => `<a class="wl-row" href="#${w.route}" data-go="${w.route}"><span>${esc(w.label)}</span><span>${w.n ? plural(w.n, 'trade') : 'No trades'}</span><b class="num ${cls(w.net)}">${w.n ? money(w.net) : '—'}</b></a>`).join('')}</div>
      <div class="legend"><span><i style="background:var(--win)"></i>Green day</span><span><i style="background:var(--loss)"></i>Red day</span><span><i style="background:var(--amber);border-radius:50%"></i>Journal written</span><span>Tap a day or week to open its report.</span></div>
    </div>
    <div class="card">
      <div class="card-head"><div><div class="eyebrow">Year</div><h2 class="h2">${y} at a glance</h2></div><div class="row"><span class="num big ${cls(yNet)}">${money(yNet)}</span><a class="btn btn-sm" href="#${repRoute('year', `${y}-01-01`)}" data-go="${repRoute('year', `${y}-01-01`)}">Year report</a></div></div>
      <div class="year-strip">${yearCells}</div>
    </div>`;
}

function filteredTrades() {
  const f = S.filters, q = f.q.trim().toLowerCase();
  let ts = data().trades.filter(x => {
    if (f.range && !inRange(x.date, f.range)) return false;
    if (f.sym !== 'all' && x.sym !== f.sym) return false;
    if (f.res === 'win' && !(x.pnl > 0)) return false;
    if (f.res === 'loss' && !(x.pnl < 0)) return false;
    if (f.res === 'be' && x.pnl !== 0) return false;
    if (f.setup !== 'all' && x.setup !== f.setup) return false;
    if (f.period !== 'all' && !inPeriod(x.date, f.period)) return false;
    if (q) {
      const hay = [x.sym, x.setup, x.reason, x.lesson, x.wentWell, x.differently, x.exitReason, x.session, ...(x.emoBefore || []), ...(x.emoDuring || []), ...(x.emoAfter || []), ...(x.mistakes || []), ...(x.confluences || [])].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  ts = sortTrades(ts);
  if (f.sort === 'date-desc') ts.reverse();
  else if (f.sort === 'pnl-desc') ts.sort((a, b) => b.pnl - a.pnl);
  else if (f.sort === 'pnl-asc') ts.sort((a, b) => a.pnl - b.pnl);
  return ts;
}
function renderTrades() {
  const el = $('#v-trades');
  if (S.loading) { el.innerHTML = loadingCard(); return; }
  const {trades} = data(), f = S.filters;
  const syms = [...new Set(trades.map(x => x.sym))].sort();
  const setups = [...new Set(trades.map(x => x.setup).filter(Boolean))].sort();
  const opt = (v, l, cur) => `<option value="${esc(v)}" ${v === cur ? 'selected' : ''}>${esc(l)}</option>`;
  el.innerHTML = `<div class="view-head"><div><div class="eyebrow">Journal</div><h1 class="h1">Trades</h1></div><button class="btn btn-primary" data-act="log">+ Log trade</button></div>
    <div class="card">
      ${f.range ? `<div class="row" style="margin-bottom:12px"><span class="pill">Showing ${esc(f.range.title)} <button data-act="clear-range" aria-label="Show all dates">×</button></span></div>` : ''}
      <div class="filters">
        <div class="field f-q"><label for="f-q">Search</label><input id="f-q" type="search" placeholder="Setup, emotion, lesson…" value="${esc(f.q)}"></div>
        <div class="field"><label for="f-period">Period</label><select id="f-period">${opt('all', 'All time', f.period)}${PERIODS.slice(0, 4).map(p => opt(p.id, p.label, f.period)).join('')}</select></div>
        <div class="field"><label for="f-sym">Instrument</label><select id="f-sym">${opt('all', 'All', f.sym)}${syms.map(x => opt(x, x, f.sym)).join('')}</select></div>
        <div class="field"><label for="f-res">Result</label><select id="f-res">${opt('all', 'All', f.res)}${opt('win', 'Wins', f.res)}${opt('loss', 'Losses', f.res)}${opt('be', 'Breakeven', f.res)}</select></div>
        <div class="field"><label for="f-setup">Setup</label><select id="f-setup">${opt('all', 'All', f.setup)}${setups.map(x => opt(x, x, f.setup)).join('')}</select></div>
        <div class="field"><label for="f-sort">Sort</label><select id="f-sort">${opt('date-desc', 'Newest first', f.sort)}${opt('date-asc', 'Oldest first', f.sort)}${opt('pnl-desc', 'Biggest win', f.sort)}${opt('pnl-asc', 'Biggest loss', f.sort)}</select></div>
      </div>
    </div>
    <div id="tradeList"></div>`;
  renderTradeList();
}
function renderTradeList() {
  const box = $('#tradeList');
  if (!box) return;
  const ts = filteredTrades(), st = stats(ts), shown = ts.slice(0, S.listLimit);
  box.innerHTML = `<div class="sumline"><span><b>${plural(ts.length, 'trade')}</b></span><span>Net <b class="num ${cls(st.net)}">${money(st.net)}</b></span><span>Win rate <b>${pct(st.winRate)}</b></span><span>Avg R <b>${fmtR(st.avgR)}</b></span></div>
    ${ts.length ? `<div class="tlist" style="margin-top:10px">${shown.map(tradeRow).join('')}</div>${ts.length > shown.length ? `<div class="row" style="justify-content:center;margin-top:14px"><button class="btn" data-act="more">Show ${Math.min(60, ts.length - shown.length)} more</button></div>` : ''}`
      : `<div class="card" style="margin-top:10px"><p class="empty-note">${data().trades.length ? 'No trades match these filters.' : 'No trades yet. Log your first one to start your journal.'}</p></div>`}`;
}

function takeaways(ts) {
  const out = [];
  if (ts.length < 3) return out;
  const yes = group(ts, x => x.followedPlan).find(r => r.key === 'yes');
  const off = ts.filter(x => x.followedPlan === 'no' || x.followedPlan === 'partly');
  if (yes && off.length) {
    const offAvg = sum(off, x => x.pnl) / off.length;
    out.push({c: yes.avg > offAvg ? 'pos' : 'neg', t: `When you follow your plan you average ${money(yes.avg)} per trade (${plural(yes.n, 'trade')}). When you don't, you average ${money(offAvg)} (${plural(off.length, 'trade')}).`});
  }
  const emo = group(ts, x => x.emoBefore).filter(r => r.n >= 2).sort((a, b) => a.net - b.net);
  if (emo.length && emo[0].net < 0) out.push({c: 'neg', t: `Feeling "${emo[0].key}" before entry has cost you ${money(emo[0].net)} across ${plural(emo[0].n, 'trade')}. When you notice it, wait or walk away.`});
  const bestEmo = emo[emo.length - 1];
  if (bestEmo && bestEmo.net > 0) out.push({c: 'pos', t: `You trade best when you feel "${bestEmo.key}": ${money(bestEmo.net)} over ${plural(bestEmo.n, 'trade')} with a ${pct(bestEmo.wr)} win rate.`});
  const mis = group(ts, x => x.mistakes).sort((a, b) => a.net - b.net);
  if (mis.length && mis[0].net < 0) out.push({c: 'neg', t: `Your most expensive mistake is "${mis[0].key}": ${plural(mis[0].n, 'time')}, ${money(mis[0].net)} total.`});
  const setups = group(ts, x => x.setup).filter(r => r.n >= 3).sort((a, b) => b.net - a.net);
  if (setups.length && setups[0].net > 0) out.push({c: 'pos', t: `"${setups[0].key}" is your best setup: ${money(setups[0].net)} over ${plural(setups[0].n, 'trade')}.`});
  const sess = group(ts, x => x.session).filter(r => r.n >= 3).sort((a, b) => b.avg - a.avg);
  if (sess.length > 1) out.push({c: sess[sess.length - 1].avg < 0 ? 'neg' : '', t: `Best session: ${sess[0].key} (${money(sess[0].avg)} per trade). Weakest: ${sess[sess.length - 1].key} (${money(sess[sess.length - 1].avg)} per trade).`});
  return out.slice(0, 6);
}
function renderMindset() {
  const el = $('#v-mindset');
  if (S.loading) { el.innerHTML = loadingCard(); return; }
  const {trades, days} = data();
  const all = sortTrades(trades);
  const P = S.mindP;
  const ts = P === 'last30' ? all.slice(-30) : all.filter(x => inPeriod(x.date, P));
  const seg = [['all', 'All time'], ['year', 'This year'], ['month', 'This month'], ['last30', 'Last 30 trades']];
  const tk = takeaways(ts);
  const ms = mindSnap(ts);
  const planRows = ['yes', 'partly', 'no'].map(k => group(ts.filter(x => x.followedPlan === k), () => PLAN_LABEL[k])[0]).filter(Boolean);
  const emoRows = group(ts, x => x.emoBefore).sort((a, b) => b.net - a.net);
  const misRows = group(ts, x => x.mistakes).sort((a, b) => a.net - b.net);
  const readyRows = ['yes', 'unsure', 'no'].map(k => group(ts.filter(x => x.ready === k), () => ({yes: 'Right headspace', unsure: 'Unsure', no: 'Wrong headspace'})[k])[0]).filter(Boolean);
  const originRows = group(ts, x => x.origin).sort((a, b) => b.net - a.net);
  const exitRows = group(ts, x => x.exitReason).sort((a, b) => b.n - a.n);
  const conf = group(ts, x => x.confidence != null ? Number(x.confidence) : null).sort((a, b) => a.key - b.key);
  const STRESS = ['Low stress (1–3)', 'Medium stress (4–6)', 'High stress (7–10)'];
  const stressRows = group(ts, x => x.stress == null ? null : STRESS[x.stress <= 3 ? 0 : x.stress <= 6 ? 1 : 2]).sort((a, b) => STRESS.indexOf(a.key) - STRESS.indexOf(b.key));
  const hours = group(ts, x => x.entryTime ? Number(x.entryTime.split(':')[0]) : null).sort((a, b) => a.key - b.key);
  const lessons = [];
  for (const x of all) if (x.lesson) lessons.push({text: x.lesson, date: x.date, src: `${x.sym} trade`});
  for (const d of Object.values(days)) if (d.lesson) lessons.push({text: d.lesson, date: d.date, src: 'Daily review'});
  lessons.sort((a, b) => a.date < b.date ? 1 : -1);

  el.innerHTML = `<div class="view-head"><div><div class="eyebrow">Psychology</div><h1 class="h1">Mindset</h1></div>
      <div class="seg" role="group" aria-label="Period">${seg.map(([v, l]) => `<button type="button" class="chip" data-act="mind-p" data-p="${v}" aria-pressed="${v === P}">${l}</button>`).join('')}</div></div>
    <div class="card gborder">
      <div class="card-head"><div><div class="eyebrow">What your journal says</div><h2 class="h2">Key takeaways</h2></div><span class="hint">${plural(ts.length, 'trade')} analysed</span></div>
      ${tk.length ? `<ul class="takeaways">${tk.map(x => `<li><i class="${x.c}" aria-hidden="true"></i><span>${esc(x.t)}</span></li>`).join('')}</ul>` : '<p class="empty-note">Log a few trades with the "How I felt" and "Review" questions filled in. Patterns appear here after about 3 trades.</p>'}
    </div>
    <div class="mind-grid">
      <div class="card">
        <div class="card-head"><div><div class="eyebrow">Discipline</div><h2 class="h3">Did I follow my plan?</h2></div></div>
        <div class="bigstat"><span class="num big">${pct(ms.followed)}</span><span class="small">of trades fully followed the plan</span><span class="grade g-${ms.grade || 'none'}" title="Average execution grade">${ms.grade || '—'}</span><span class="small">avg grade</span></div>
        ${breakdownRows(planRows, 'Answer "Did I follow my plan?" when you log trades.')}
      </div>
      <div class="card"><div class="card-head"><div><div class="eyebrow">Emotions</div><h2 class="h3">How I felt before entry</h2></div></div>${breakdownRows(emoRows, 'Tag how you felt before entry to see which emotions pay.')}</div>
      <div class="card"><div class="card-head"><div><div class="eyebrow">Mistakes</div><h2 class="h3">What my mistakes cost</h2></div></div>${breakdownRows(misRows, 'No mistakes tagged yet.')}</div>
      <div class="card"><div class="card-head"><div><div class="eyebrow">State</div><h2 class="h3">Was I in the right headspace?</h2></div></div>${breakdownRows(readyRows, 'Answer the headspace question when you log trades.')}<div style="margin-top:14px">${breakdownRows(stressRows, '')}</div></div>
      <div class="card"><div class="card-head"><div><div class="eyebrow">Confidence</div><h2 class="h3">Average P&amp;L by confidence (1–5)</h2></div></div><div class="chart" id="chConf"></div></div>
      <div class="card"><div class="card-head"><div><div class="eyebrow">Timing</div><h2 class="h3">P&amp;L by hour of entry</h2></div></div><div class="chart" id="chHour"></div></div>
      <div class="card"><div class="card-head"><div><div class="eyebrow">Origin</div><h2 class="h3">Where the trade came from</h2></div></div>${breakdownRows(originRows, 'Tag whether a trade was planned, spotted live or an impulse.')}</div>
      <div class="card"><div class="card-head"><div><div class="eyebrow">Exits</div><h2 class="h3">How I got out</h2></div></div>${breakdownRows(exitRows, 'Tag your exit reason to see if fear or greed is closing your trades.')}</div>
    </div>
    <div class="card">
      <div class="card-head"><div><div class="eyebrow">Notebook</div><h2 class="h2">Lessons I've written</h2></div><span class="hint">${plural(lessons.length, 'lesson')}</span></div>
      ${lessons.length ? `<div class="lessons">${lessons.slice(0, 12).map(l => `<div class="lesson"><p>${esc(l.text)}</p><small>${esc(prettyDate(l.date))} · ${esc(l.src)}</small></div>`).join('')}</div>` : '<p class="empty-note">Lessons from your trades and daily reviews collect here.</p>'}
    </div>`;
  mount($('#chConf'), e => drawBars(e, conf.map(r => ({value: r.avg, label: String(r.key), tip: `<b class="${cls(r.avg)}">${money(r.avg)} avg</b>Confidence ${r.key} · ${plural(r.n, 'trade')} · ${pct(r.wr)} win`})), {height: 190, aria: 'Average P&L by confidence level', empty: 'Rate your confidence when you log trades.'}));
  mount($('#chHour'), e => drawBars(e, hours.map(r => ({value: r.net, label: hourLabel(r.key), tip: `<b class="${cls(r.net)}">${money(r.net)}</b>${hourLabel(r.key)} hour · ${plural(r.n, 'trade')} · ${pct(r.wr)} win`})), {height: 190, aria: 'Net P&L by hour of entry', empty: 'Add entry times to see your best hours.'}));
}

function renderSettings() {
  const el = $('#v-settings');
  const s = S.settings, mode = Store ? Store.mode : 'loading';
  const u = S.user || {};
  const provider = {google: 'Google', apple: 'Apple', github: 'GitHub', discord: 'Discord', twitter: 'X', email: 'email and password'}[u.provider] || u.provider;
  const modeText = 'Your journal is stored in your account and syncs to any device you sign in on. Only you can see it.';
  const f = (id, label, val, extra) => `<div class="field"><label for="${id}">${label}</label><input id="${id}" ${extra || 'type="number" inputmode="decimal" step="any"'} value="${esc(val)}"></div>`;
  const accountCardHtml = SITE ? `<div class="card" style="grid-column:1/-1">
      <div class="card-head"><div><div class="eyebrow">Your account</div><h2 class="h3">Profile</h2></div></div>
      <div class="row" style="justify-content:space-between;gap:16px">
        <div class="who">${u.avatar ? `<img src="${esc(u.avatar)}" alt="" referrerpolicy="no-referrer">` : ''}<div><b>${esc(u.name || 'Trader')}</b><span>${esc(u.email || '')}</span><span class="hint">Signed in with ${esc(provider || 'email')}</span></div></div>
        <button class="btn" data-act="sign-out">Sign out</button>
      </div>
      <div style="border-top:1px solid var(--line-soft);margin-top:16px;padding-top:16px" id="delAcctZone">
        ${S.delArmed ? `<p class="small" style="margin-bottom:10px">This permanently deletes your account, all ${plural(S.trades.length, 'trade')} and your journal. Export a backup first if you might want them. Type DELETE to confirm.</p>
          <div class="row" style="flex-wrap:nowrap"><input id="delConfirm" type="text" autocomplete="off" placeholder="DELETE" style="max-width:160px"><button class="btn btn-danger" data-act="delete-account-confirm">Delete my account</button><button class="btn" data-act="delete-account-cancel">Cancel</button></div>`
          : '<button class="btn btn-danger btn-sm" data-act="delete-account">Delete account</button>'}
      </div>
    </div>` : '';
  el.innerHTML = `<div class="view-head"><div><div class="eyebrow">Your setup</div><h1 class="h1">Settings</h1></div></div>
    <div class="set-grid">
      ${accountCardHtml}
      <div class="card">
        <div class="card-head"><div><div class="eyebrow">Prop account</div><h2 class="h3">Account rules</h2></div></div>
        <div class="field" style="margin-bottom:14px"><span class="lbl">Markets I trade</span><div class="chips">${MARKETS.map(m => `<button type="button" class="chip" data-act="toggle-market" data-m="${m.v}" aria-pressed="${s.markets.includes(m.v)}">${m.l}</button>`).join('')}</div></div>
        <div class="frow" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
          ${f('st-name', 'Account name', s.accountName, 'type="text" maxlength="60" placeholder="e.g. 50K funded account"')}
          ${f('st-start', 'Starting balance ($)', s.start || '', 'type="number" inputmode="decimal" step="any" placeholder="e.g. 50000"')}
          ${f('st-target', 'Profit target ($)', s.target || '', 'type="number" inputmode="decimal" step="any" placeholder="e.g. 3000"')}
          ${f('st-dd', 'Max drawdown ($)', s.maxDD || '', 'type="number" inputmode="decimal" step="any" placeholder="e.g. 2000"')}
          <div class="field"><label for="st-ddtype">Drawdown type</label><select id="st-ddtype"><option value="trailing" ${s.ddType === 'trailing' ? 'selected' : ''}>End-of-day trailing</option><option value="static" ${s.ddType === 'static' ? 'selected' : ''}>Static</option></select></div>
          ${f('st-daily', 'Daily loss limit ($)', s.dailyLimit || '', 'type="number" inputmode="decimal" step="any" placeholder="Optional"')}
          ${f('st-risk', 'Default risk per trade ($)', s.riskPerTrade || '', 'type="number" inputmode="decimal" step="any" placeholder="Optional"')}
          ${s.markets.includes('futures') ? f('st-qty', 'Default contracts', s.defaultQty, 'type="number" inputmode="numeric" min="1" step="1"') : ''}
          <div class="field"><label for="st-dmkt">Default market</label><select id="st-dmkt">${MARKETS.filter(m => s.markets.includes(m.v)).map(m => `<option value="${m.v}" ${m.v === s.defaultMarket ? 'selected' : ''}>${m.l}</option>`).join('')}</select></div>
          ${s.markets.includes('futures') ? `<div class="field"><label for="st-sym">Default futures contract</label><select id="st-sym">${s.instruments.filter(i => mktOf(i) === 'futures').map(i => `<option ${i.sym === s.defaultSym ? 'selected' : ''}>${esc(i.sym)}</option>`).join('')}</select></div>` : ''}
          ${s.markets.includes('forex') ? `<div class="field"><label for="st-fx">Default forex pair</label><select id="st-fx">${s.instruments.filter(i => mktOf(i) === 'forex').map(i => `<option ${i.sym === s.defaultFx ? 'selected' : ''}>${esc(i.sym)}</option>`).join('')}</select></div>
          ${f('st-lots', 'Default lot size', s.defaultLots, 'type="number" inputmode="decimal" min="0.01" step="0.01"')}` : ''}
        </div>
        <p class="hint" style="margin-top:12px">Leave the account fields blank if you don't trade a funded or prop account. Default risk is used for R-multiples when a trade has no stop price.</p>
        <div class="row" style="margin-top:14px"><button class="btn btn-primary" data-act="save-account">Save account rules</button></div>
      </div>
      <div class="card">
        <div class="card-head"><div><div class="eyebrow">Playbook</div><h2 class="h3">Setups</h2></div></div>
        <div class="chips">${s.setups.map((x, i) => `<button type="button" class="chip on" data-act="remove-setup" data-i="${i}" aria-label="Remove ${esc(x)}">${esc(x)}<span class="x" aria-hidden="true">×</span></button>`).join('')}</div>
        <div class="row" style="margin-top:12px;flex-wrap:nowrap"><input id="st-newsetup" type="text" placeholder="Add a setup, e.g. London breakout" maxlength="40"><button class="btn" data-act="add-setup">Add</button></div>
      </div>
      <div class="card">
        <div class="card-head"><div><div class="eyebrow">Contracts &amp; pairs</div><h2 class="h3">Instruments</h2></div><span class="hint">Pinned ones show as quick picks when logging</span></div>
        <div class="inst-wrap"><table class="inst-table">
          <thead><tr><th>Symbol</th><th>Name</th><th>Value</th><th>Pinned</th><th></th></tr></thead>
          <tbody>${s.instruments.map((i, k) => s.markets.includes(mktOf(i)) ? `<tr>
            <td class="sym">${esc(i.sym)}<div class="hint">${mktOf(i) === 'forex' ? 'Forex' : 'Futures'}</div></td><td>${esc(i.name || '')}</td>
            <td>${mktOf(i) === 'forex'
              ? `<div class="row" style="flex-wrap:nowrap;gap:6px"><label class="hint" for="ilot${k}">Lot</label><input id="ilot${k}" type="number" step="any" inputmode="decimal" data-inst-lot="${k}" value="${esc(i.lot)}" style="width:96px"><label class="hint" for="ipip${k}">Pip</label><input id="ipip${k}" type="number" step="any" inputmode="decimal" data-inst-pip="${k}" value="${esc(i.pip)}" style="width:84px"></div>`
              : `<div class="row" style="flex-wrap:nowrap;gap:6px"><label class="hint" for="ipv${k}">$/pt</label><input id="ipv${k}" type="number" step="any" inputmode="decimal" data-inst-pv="${k}" value="${esc(i.pv)}" style="width:96px"></div>`}</td>
            <td><input type="checkbox" data-inst-pin="${k}" ${i.pinned ? 'checked' : ''} aria-label="Pin ${esc(i.sym)}"></td>
            <td><button class="btn btn-ghost btn-sm" data-act="remove-inst" data-i="${k}" aria-label="Remove ${esc(i.sym)}">Remove</button></td>
          </tr>` : '').join('')}</tbody>
        </table></div>
        <div class="frow" style="margin-top:12px;align-items:end">
          <div class="field"><label for="st-imkt">Market</label><select id="st-imkt">${MARKETS.filter(m => s.markets.includes(m.v)).map(m => `<option value="${m.v}">${m.l}</option>`).join('')}</select></div>
          <div class="field"><label for="st-isym">Symbol</label><input id="st-isym" type="text" maxlength="8" placeholder="${s.markets[0] === 'forex' ? 'AUDJPY' : 'PL'}"></div>
          <div class="field"><label for="st-iname">Name</label><input id="st-iname" type="text" maxlength="40" placeholder="${s.markets[0] === 'forex' ? 'Aussie / Yen' : 'Platinum'}"></div>
          <div class="field" id="st-ifut" ${s.markets[0] === 'futures' ? '' : 'hidden'}><label for="st-ipv">$ per point</label><input id="st-ipv" type="number" step="any" inputmode="decimal" placeholder="50"></div>
          <div class="field" id="st-ifx" ${s.markets[0] === 'forex' ? '' : 'hidden'}><label for="st-ipip">Pip size</label><input id="st-ipip" type="number" step="any" inputmode="decimal" placeholder="0.0001 (0.01 for JPY)"></div>
          <div class="field" id="st-ifx2" ${s.markets[0] === 'forex' ? '' : 'hidden'}><label for="st-ilot">Units per lot</label><input id="st-ilot" type="number" step="any" inputmode="decimal" placeholder="100000"></div>
          <button class="btn" data-act="add-inst">Add instrument</button>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><div><div class="eyebrow">Data</div><h2 class="h3">Backup &amp; sync</h2></div><span class="sync ${S.previewOn ? '' : mode === 'cloud' ? 'cloud' : mode === 'local' ? 'local' : mode === 'error' ? 'err' : ''}"><i></i><span style="display:inline">${mode === 'cloud' ? 'Synced' : mode === 'local' ? 'This device' : mode === 'error' ? 'Not syncing' : 'Connecting'}</span></span></div>
        <p class="small" style="max-width:62ch">${esc(modeText)}</p>
        <div class="row" style="margin-top:16px">
          <button class="btn" data-act="export-json">Export backup (.json)</button>
          <button class="btn" data-act="export-csv">Export trades (.csv)</button>
          <button class="btn" data-act="import">Import backup</button>
        </div>
        <p class="hint" style="margin-top:10px">Moving from another copy of Edge Journal? Export a backup there and import it here.</p>
        <div id="importZone"></div>
        <div class="row" style="margin-top:16px">
          ${S.previewOn ? '<button class="btn btn-ghost" data-act="hide-sample">Hide sample preview</button>' : (!S.trades.length ? '<button class="btn btn-ghost" data-act="show-sample">Show sample preview</button>' : '')}
        </div>
        <div style="border-top:1px solid var(--line-soft);margin-top:16px;padding-top:16px">
          ${S.wipeArmed ? `<p class="small" style="margin-bottom:10px">Delete all ${plural(S.trades.length, 'trade')} and ${plural(Object.keys(S.days).length, 'journal day')}? This cannot be undone. Export a backup first if you might want them.</p><div class="row"><button class="btn btn-danger" data-act="wipe-confirm">Yes, delete everything</button><button class="btn" data-act="wipe-cancel">Keep my data</button></div>` : `<button class="btn btn-danger btn-sm" data-act="wipe" ${S.trades.length || Object.keys(S.days).length ? '' : 'disabled'}>Delete all journal data</button>`}
        </div>
      </div>
    </div>`;
}

const RENDER = {home: renderHome, reports: renderReports, calendar: renderCalendar, trades: renderTrades, mindset: renderMindset, settings: renderSettings};
function renderAll() {
  if (!S.started) return;
  if (ro) ro.disconnect();
  hideTip();
  renderSync();
  renderBanner();
  (RENDER[S.route.view] || renderHome)();
}

/* =========================================================
   Trade form
   ========================================================= */
function openTradeForm(t, presetDate) {
  const s = S.settings, isEdit = !!t;
  const market = (t && (t.market || mktOf(inst(t.sym)))) || (s.markets.includes(s.defaultMarket) ? s.defaultMarket : s.markets[0]) || 'futures';
  t = t || {date: presetDate || todayStr(), sym: defaultSymFor(market), side: 'long', qty: market === 'forex' ? s.defaultLots : s.defaultQty, fees: 0};
  const setupOpts = [...s.setups];
  const setupIsOther = t.setup && !setupOpts.includes(t.setup);
  const v = x => x == null ? '' : esc(x);
  const html = `<div class="sheet-head"><div><div class="eyebrow">${isEdit ? 'Edit' : 'New entry'}</div><h2 class="h2" id="sheetTitle">${isEdit ? 'Edit trade' : 'Log a trade'}</h2></div><button class="icon-btn" data-act="close" aria-label="Close">×</button></div>
  <nav class="stepnav" aria-label="Form sections">
    <button type="button" class="chip" data-act="jump" data-to="sec-trade">1 · The trade</button>
    <button type="button" class="chip" data-act="jump" data-to="sec-why">2 · Why I took it</button>
    <button type="button" class="chip" data-act="jump" data-to="sec-feel">3 · How I felt</button>
    <button type="button" class="chip" data-act="jump" data-to="sec-review">4 · Review</button>
  </nav>
  <form class="sheet-body" id="tradeForm" novalidate>
    <section class="fsec" id="sec-trade">
      <div class="fsec-title"><span class="step">01</span><div><h3 class="h3">The trade</h3><p>Prices fill in the P&amp;L for you. Or just type the P&amp;L.</p></div></div>
      <div class="frow">
        <div class="field"><label for="tf-date">Date</label><input id="tf-date" type="date" value="${v(t.date)}" required></div>
        <div class="field"><label for="tf-in">Entry time</label><input id="tf-in" type="time" value="${v(t.entryTime)}"></div>
        <div class="field"><label for="tf-out">Exit time</label><input id="tf-out" type="time" value="${v(t.exitTime)}"></div>
      </div>
      <div class="field" ${s.markets.length > 1 || market !== s.markets[0] ? '' : 'hidden'}><span class="lbl">Market</span><div>${chipGroup('market', MARKETS, market, {cls: 'seg', label: 'Market'})}</div></div>
      <div class="field"><span class="lbl">Instrument</span><div id="tf-symbox">${symPicker(market, t.sym)}</div></div>
      <div class="frow">
        <div class="field"><span class="lbl">Direction</span><div>${chipGroup('side', [{v: 'long', l: 'Long'}, {v: 'short', l: 'Short'}], t.side || 'long', {cls: 'seg', label: 'Direction'})}</div></div>
        <div class="field"><label for="tf-qty" id="tf-qty-label">${market === 'forex' ? 'Lots' : 'Contracts'}</label><input id="tf-qty" type="number" inputmode="decimal" min="${market === 'forex' ? '0.01' : '1'}" step="${market === 'forex' ? '0.01' : '1'}" value="${v(t.qty)}"></div>
        <div class="field"><label for="tf-fees">Fees &amp; commission ($)</label><input id="tf-fees" type="number" inputmode="decimal" step="any" value="${v(t.fees)}" placeholder="0"></div>
      </div>
      <div class="frow">
        <div class="field"><label for="tf-entry">Entry price</label><input id="tf-entry" type="number" inputmode="decimal" step="any" value="${v(t.entry)}"></div>
        <div class="field"><label for="tf-exit">Exit price</label><input id="tf-exit" type="number" inputmode="decimal" step="any" value="${v(t.exit)}"></div>
        <div class="field"><label for="tf-stop">Stop price</label><input id="tf-stop" type="number" inputmode="decimal" step="any" value="${v(t.stop)}"></div>
        <div class="field"><label for="tf-target">Target price</label><input id="tf-target" type="number" inputmode="decimal" step="any" value="${v(t.target)}"></div>
      </div>
      <div class="frow">
        <div class="field"><label for="tf-pnl">Net P&amp;L ($)</label><input id="tf-pnl" type="number" inputmode="decimal" step="any" value="${v(t.pnl)}" placeholder="Fills from prices"><span class="hint" id="tf-pnl-hint">Calculated from prices minus fees. Type to override.</span></div>
        <div class="field"><span class="lbl">Session</span>${chipGroup('session', SESSIONS, t.session, {label: 'Session'})}<span class="hint">Picked from the entry time. Tap to change.</span></div>
      </div>
    </section>
    <section class="fsec" id="sec-why">
      <div class="fsec-title"><span class="step">02</span><div><h3 class="h3">Why I took it</h3><p>Write it so future you can judge the decision, not the outcome.</p></div></div>
      <div class="field"><span class="lbl">Setup</span>${chipGroup('setup', setupOpts, setupIsOther ? null : t.setup, {label: 'Setup'})}
        <input id="tf-setup-other" type="text" maxlength="40" placeholder="Other setup (saved to your playbook)" value="${setupIsOther ? v(t.setup) : ''}"></div>
      <div class="field"><span class="lbl">Timeframe</span>${chipGroup('timeframe', TIMEFRAMES, t.timeframe, {label: 'Timeframe'})}</div>
      <div class="field"><span class="lbl">What lined up? <span class="muted">(pick all)</span></span>${chipGroup('confluences', CONFLUENCES, t.confluences, {multi: true, label: 'Confluences'})}</div>
      <div class="field"><span class="lbl">Where did this trade come from?</span>${chipGroup('origin', ORIGINS, t.origin, {label: 'Trade origin'})}</div>
      <div class="field"><label for="tf-reason">Why did I take this trade? What did I see?</label><textarea id="tf-reason" placeholder="Price swept the overnight low into my level, reclaimed it on the 1m, and my indicator flipped long…">${v(t.reason)}</textarea></div>
    </section>
    <section class="fsec" id="sec-feel">
      <div class="fsec-title"><span class="step">03</span><div><h3 class="h3">How I felt</h3><p>Be honest. This is the part that finds your leaks.</p></div></div>
      <div class="field"><span class="lbl">Before entry</span>${chipGroup('emoBefore', EMO_BEFORE, t.emoBefore, {multi: true, tone: 'emo', label: 'Emotions before entry'})}</div>
      <div class="field"><span class="lbl">During the trade</span>${chipGroup('emoDuring', EMO_DURING, t.emoDuring, {multi: true, tone: 'emo', label: 'Emotions during'})}</div>
      <div class="field"><span class="lbl">After it closed</span>${chipGroup('emoAfter', EMO_AFTER, t.emoAfter, {multi: true, tone: 'emo', label: 'Emotions after'})}</div>
      <div class="frow" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr))">
        <div class="field"><span class="lbl">Confidence in the setup (1–5)</span>${chipGroup('confidence', [1, 2, 3, 4, 5], t.confidence, {cls: 'sq', label: 'Confidence'})}</div>
        <div class="field"><span class="lbl">Was I in the right headspace to trade?</span>${chipGroup('ready', READY_OPTS, t.ready, {label: 'Headspace'})}</div>
      </div>
      <div class="field"><span class="lbl">Stress level (1 calm – 10 panicked)</span>${chipGroup('stress', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], t.stress, {cls: 'sq', label: 'Stress level'})}</div>
    </section>
    <section class="fsec" id="sec-review">
      <div class="fsec-title"><span class="step">04</span><div><h3 class="h3">Execution review</h3><p>Grade the execution, not the result. A stopped-out A trade beats a lucky F.</p></div></div>
      <div class="frow" style="grid-template-columns:repeat(auto-fit,minmax(230px,1fr))">
        <div class="field"><span class="lbl">Did I follow my plan?</span>${chipGroup('followedPlan', PLAN_OPTS, t.followedPlan, {label: 'Followed plan'})}</div>
        <div class="field"><span class="lbl">Execution grade</span>${chipGroup('grade', ['A', 'B', 'C', 'D', 'F'], t.grade, {cls: 'sq', label: 'Grade'})}</div>
      </div>
      <div class="field"><span class="lbl">Mistakes <span class="muted">(pick any)</span></span>${chipGroup('mistakes', MISTAKES, t.mistakes, {multi: true, tone: 'bad', label: 'Mistakes'})}</div>
      <div class="field"><span class="lbl">How did I exit?</span>${chipGroup('exitReason', EXIT_REASONS, t.exitReason, {label: 'Exit reason'})}</div>
      <div class="field"><label for="tf-well">What did I do well?</label><textarea id="tf-well" placeholder="Waited for my level, sized correctly, let it work…">${v(t.wentWell)}</textarea></div>
      <div class="field"><label for="tf-diff">What would I do differently?</label><textarea id="tf-diff" placeholder="Wait for the candle close, skip the first 5 minutes…">${v(t.differently)}</textarea></div>
      <div class="field"><label for="tf-lesson">Lesson I'm taking forward</label><input id="tf-lesson" type="text" maxlength="240" placeholder="One sentence you'd tell yourself tomorrow morning" value="${v(t.lesson)}"></div>
      <div class="field"><label for="tf-chart">Chart link <span class="muted">(TradingView snapshot, optional)</span></label><input id="tf-chart" type="url" inputmode="url" placeholder="https://www.tradingview.com/x/…" value="${v(t.chartUrl)}"></div>
    </section>
  </form>
  <div class="sheet-foot">
    <div class="calc" id="tf-calc" aria-live="polite"></div>
    <span class="form-err" id="tf-err" role="alert"></span>
    <button class="btn" data-act="close">Cancel</button>
    <button class="btn btn-primary" data-act="save-trade" id="tf-save">${isEdit ? 'Save changes' : 'Save trade'}</button>
  </div>`;
  openSheet(html, 'lg');
  S.sheetKind = 'trade-form';
  S.form = {id: t.id || null, createdAt: t.createdAt || null, sessionAuto: !t.session};
  const c = formCalc();
  $('#tf-pnl').dataset.auto = (isEdit && isNum(t.pnl) && !(c.net != null && Math.abs(c.net - t.pnl) < 0.01)) ? '0' : '1';
  updateCalc();
}
const fval = id => { const e = document.getElementById(id); if (!e || e.value === '') return null; const n = Number(e.value); return isFinite(n) ? n : null; };
function formSym() {
  const chip = readChips($('#sheet'), 'sym'), other = $('#tf-sym-other');
  return chip || (other && other.value) || null;
}
function symPicker(market, sym) {
  const list = S.settings.instruments.filter(i => mktOf(i) === market);
  const pinned = list.filter(i => i.pinned).map(i => i.sym);
  if (sym && !pinned.includes(sym) && !list.some(i => i.sym === sym)) pinned.push(sym);
  const others = list.filter(i => !pinned.includes(i.sym));
  return `<div class="row">${chipGroup('sym', pinned, pinned.includes(sym) ? sym : null, {label: 'Instrument'})}
    ${others.length ? `<select id="tf-sym-other" aria-label="Other instrument" style="width:auto;min-width:120px"><option value="">More…</option>${others.map(i => `<option value="${esc(i.sym)}" ${i.sym === sym ? 'selected' : ''}>${esc(i.sym)} · ${esc(i.name || '')}</option>`).join('')}</select>` : ''}</div>`;
}
function switchMarket(m, sym) {
  const root = $('#sheet');
  const g = $('[data-field="market"]', root);
  if (g) $$('.chip', g).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === m)));
  $('#tf-symbox').innerHTML = symPicker(m, sym || defaultSymFor(m));
  $('#tf-qty-label').textContent = m === 'forex' ? 'Lots' : 'Contracts';
  const q = $('#tf-qty');
  q.min = q.step = m === 'forex' ? '0.01' : '1';
  q.value = m === 'forex' ? (S.settings.defaultLots || 1) : (S.settings.defaultQty || 1);
  updateCalc();
}
function formCalc() {
  const root = $('#sheet'), sym = formSym() || '', i = inst(sym);
  const m = mktOf(i) || readChips(root, 'market') || 'futures';
  const dir = (readChips(root, 'side') || 'long') === 'short' ? -1 : 1;
  const e = fval('tf-entry'), x = fval('tf-exit'), st = fval('tf-stop'), tg = fval('tf-target'), q = fval('tf-qty') || 0, fees = fval('tf-fees') || 0;
  const out = {market: m, points: null, gross: null, net: null, risk: null, reward: null, cross: false};
  if (m === 'forex') {
    // value in the quote currency, converted to dollars when the pair includes USD
    const lot = (i && Number(i.lot)) || 100000, pip = (i && Number(i.pip)) || (sym.endsWith('JPY') ? 0.01 : 0.0001);
    const base = sym.slice(0, 3), quote = sym.slice(3, 6);
    const usd = (amt, px) => quote === 'USD' ? amt : (base === 'USD' && px ? amt / px : null);
    if (!q) return out;
    if (e != null && x != null) {
      out.points = (x - e) * dir / pip;
      const g = usd((x - e) * dir * q * lot, x);
      if (g != null) { out.gross = g; out.net = round2(g - fees); } else out.cross = true;
    }
    if (e != null && st != null) out.risk = usd(Math.abs(e - st) * q * lot, st);
    if (e != null && tg != null) out.reward = usd(Math.abs(tg - e) * q * lot, tg);
    return out;
  }
  const pv = i ? Number(i.pv) : null;
  if (pv && q) {
    if (e != null && x != null) { out.points = (x - e) * dir; out.gross = out.points * pv * q; out.net = round2(out.gross - fees); }
    if (e != null && st != null) out.risk = Math.abs(e - st) * pv * q;
    if (e != null && tg != null) out.reward = Math.abs(tg - e) * pv * q;
  }
  return out;
}
function updateCalc() {
  const pnlEl = $('#tf-pnl'), box = $('#tf-calc');
  if (!pnlEl || !box) return;
  const c = formCalc();
  if (pnlEl.dataset.auto === '1') pnlEl.value = c.net != null ? String(c.net) : '';
  $('#tf-pnl-hint').textContent = pnlEl.dataset.auto !== '1' ? 'Manual P&L. Clear the box to go back to the calculated value.'
    : c.cross ? "This pair doesn't include USD, so type your P&L in dollars from your platform."
    : 'Calculated from prices minus fees. Type to override.';
  const pnl = fval('tf-pnl'), risk = c.risk || S.settings.riskPerTrade || null;
  const r = pnl != null && risk ? pnl / risk : null;
  const parts = [];
  if (c.points != null) parts.push(`${c.market === 'forex' ? 'Pips' : 'Pts'} <b>${c.points > 0 ? '+' : ''}${c.market === 'forex' ? Math.round(c.points * 10) / 10 : round2(c.points)}</b>`);
  if (c.risk != null) parts.push(`Risk <b>${money(c.risk, {sign: false})}</b>`);
  if (c.risk && c.reward) parts.push(`Plan R:R <b>${(c.reward / c.risk).toFixed(2)}</b>`);
  parts.push(`Net <b class="${cls(pnl)}">${pnl != null ? money(pnl) : '—'}</b>`);
  if (r != null) parts.push(`<b class="${cls(r)}">${fmtR(r)}</b>`);
  box.innerHTML = parts.map(p => `<span>${p}</span>`).join('');
}
async function saveTradeForm() {
  const root = $('#sheet'), err = $('#tf-err'), btn = $('#tf-save');
  const fail = (msg, focusId) => { err.textContent = msg; if (focusId) { const e = document.getElementById(focusId); if (e) e.focus(); } };
  err.textContent = '';
  const date = $('#tf-date').value;
  if (!date) return fail('Pick the trade date.', 'tf-date');
  const sym = formSym();
  if (!sym) return fail('Choose an instrument.');
  const c = formCalc();
  let pnl = fval('tf-pnl');
  if (pnl == null) pnl = c.net;
  if (pnl == null) return fail('Add entry and exit prices, or type the net P&L.', 'tf-entry');
  const risk = c.risk || S.settings.riskPerTrade || null;
  const now = Date.now();
  const id = S.form.id || ('t-' + now.toString(36) + '-' + Math.random().toString(36).slice(2, 7));
  const otherSetup = $('#tf-setup-other').value.trim();
  const txt = k => { const e = document.getElementById(k); return e ? e.value.trim() : ''; };
  const n = k => { const x = readChips(root, k); return x == null ? null : Number(x); };
  const chart = txt('tf-chart');
  const trade = {
    kind: 'trade', date,
    entryTime: $('#tf-in').value || null, exitTime: $('#tf-out').value || null,
    sym, market: c.market, side: readChips(root, 'side') || 'long', qty: fval('tf-qty'),
    entry: fval('tf-entry'), exit: fval('tf-exit'), stop: fval('tf-stop'), target: fval('tf-target'),
    fees: fval('tf-fees') || 0, pnl: round2(pnl),
    risk: risk ? round2(risk) : null, r: risk ? round2(pnl / risk) : null,
    session: readChips(root, 'session'), setup: readChips(root, 'setup') || otherSetup || null, timeframe: readChips(root, 'timeframe'),
    confluences: readChips(root, 'confluences'), origin: readChips(root, 'origin'), reason: txt('tf-reason'),
    emoBefore: readChips(root, 'emoBefore'), emoDuring: readChips(root, 'emoDuring'), emoAfter: readChips(root, 'emoAfter'),
    confidence: n('confidence'), stress: n('stress'), ready: readChips(root, 'ready'),
    followedPlan: readChips(root, 'followedPlan'), grade: readChips(root, 'grade'),
    mistakes: readChips(root, 'mistakes'), exitReason: readChips(root, 'exitReason'),
    wentWell: txt('tf-well'), differently: txt('tf-diff'), lesson: txt('tf-lesson'),
    chartUrl: /^https?:\/\//i.test(chart) ? chart : '',
    createdAt: S.form.createdAt || now, updatedAt: now
  };
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Saving…';
  try { await Store.put(id, trade); }
  catch (e) { btn.disabled = false; btn.textContent = label; return fail(writeError(e)); }
  const wasPreview = S.previewOn;
  S.previewOn = false;
  lsSet('ej.hasTrades', '1');
  closeSheet();
  toast(`${wasPreview ? 'Your journal has started. ' : ''}Trade saved · ${money(trade.pnl)}`, cls(trade.pnl));
  if (otherSetup && !S.settings.setups.includes(otherSetup)) { S.settings.setups.push(otherSetup); saveSettings(true); }
  renderAll();
}
function prefillFromTemplate(c) {
  const root = $('#sheet');
  const press = (field, val) => { const g = $(`[data-field="${field}"]`, root); if (!g) return; $$('.chip', g).forEach(x => x.setAttribute('aria-pressed', String([].concat(val || []).map(String).includes(x.dataset.v)))); };
  switchMarket(tradeMkt(c), c.sym);
  press('sym', c.sym);
  const o = $('#tf-sym-other');
  if (o && !$('[data-field="sym"] .chip[aria-pressed="true"]', root)) o.value = c.sym || '';
  press('side', c.side); press('setup', c.setup); press('timeframe', c.timeframe); press('confluences', c.confluences); press('origin', c.origin);
  const q = $('#tf-qty'); if (q && c.qty) q.value = c.qty;
  const f = $('#tf-fees'); if (f) f.value = c.fees || '';
  updateCalc();
}

/* =========================================================
   Trade detail + day journal
   ========================================================= */
function openTradeDetail(id) {
  const t = data().trades.find(x => x.id === id);
  if (!t) return;
  const fact = (k, val) => `<div><dt>${k}</dt><dd>${val}</dd></div>`;
  const i = inst(t.sym);
  const mk = tradeMkt(t), pip = (i && Number(i.pip)) || 0.0001;
  const mv = isNum(t.entry) && isNum(t.exit) ? (t.exit - t.entry) * (t.side === 'short' ? -1 : 1) : null;
  const pts = mv == null ? null : mk === 'forex' ? Math.round(mv / pip * 10) / 10 : round2(mv);
  const dots = n => `<span class="dots" aria-label="${n} of 5">${[1, 2, 3, 4, 5].map(k => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span>`;
  const qa = (q, a) => a ? `<div><div class="qlabel">${q}</div><p class="quote">${esc(a)}</p></div>` : '';
  const dayRoute = repRoute('day', t.date);
  openSheet(`<div class="sheet-head"><div><div class="eyebrow">${esc(prettyDate(t.date, true))}${t.entryTime ? ' · ' + esc(t.entryTime) : ''}${t.exitTime ? '–' + esc(t.exitTime) : ''}</div>
      <h2 class="h2" id="sheetTitle">${esc(t.sym)} <span class="side ${t.side === 'short' ? 'short' : 'long'}">${t.side === 'short' ? 'Short' : 'Long'}</span>${t.sample ? ' <span class="pill">Sample</span>' : ''}</h2></div>
      <button class="icon-btn" data-act="close" aria-label="Close">×</button></div>
    <div class="sheet-body">
      <div class="detail-hero"><div><div class="num huge ${cls(t.pnl)}">${money(t.pnl)}</div><div class="hint" style="margin-top:6px">${i ? esc(i.name) : esc(t.sym)}${t.qty ? ' · ' + qtyWord(mk, t.qty) : ''} · <a href="#${dayRoute}" data-go="${dayRoute}">View this day</a></div></div>
        <div class="row">${isNum(t.r) ? `<span class="pill ${t.r > 0 ? 'good' : t.r < 0 ? 'bad' : ''}">${fmtR(t.r)}</span>` : ''}${t.followedPlan ? `<span class="pill ${t.followedPlan === 'yes' ? 'good' : t.followedPlan === 'no' ? 'bad' : 'mid'}">${PLAN_LABEL[t.followedPlan]}</span>` : ''}${t.grade ? `<span class="grade g-${t.grade}" title="Execution grade">${t.grade}</span>` : ''}</div></div>
      <dl class="facts">
        ${fact('Entry', fmtPrice(t.entry))}${fact('Exit', fmtPrice(t.exit))}${fact(mk === 'forex' ? 'Pips' : 'Points', pts == null ? '—' : (pts > 0 ? '+' : '') + pts)}
        ${fact('Stop', fmtPrice(t.stop))}${fact('Target', fmtPrice(t.target))}${fact('Risk', t.risk ? money(t.risk, {sign: false}) : '—')}
        ${fact('Session', esc(t.session || '—'))}${fact('Timeframe', esc(t.timeframe || '—'))}${fact('Fees', money(t.fees || 0, {sign: false}))}
      </dl>
      <section class="dsec"><h3 class="eyebrow">Why I took it</h3>
        <div class="row">${t.setup ? `<span class="pill">${esc(t.setup)}</span>` : '<span class="pill bad">No setup</span>'}${t.origin ? `<span class="pill ${t.origin === 'Impulse' ? 'bad' : ''}">${esc(t.origin)}</span>` : ''}</div>
        ${t.confluences && t.confluences.length ? staticChips(t.confluences) : ''}
        ${qa('My reasoning', t.reason) || '<span class="hint">No reasoning written.</span>'}
      </section>
      <section class="dsec"><h3 class="eyebrow">How I felt</h3>
        <div><div class="qlabel">Before entry</div>${staticChips(t.emoBefore, 'emo')}</div>
        <div><div class="qlabel">During</div>${staticChips(t.emoDuring, 'emo')}</div>
        <div><div class="qlabel">After</div>${staticChips(t.emoAfter, 'emo')}</div>
        <div class="row" style="gap:18px">
          <span class="small">Confidence ${isNum(t.confidence) ? dots(t.confidence) : '—'}</span>
          <span class="small">Stress <b>${isNum(t.stress) ? t.stress + '/10' : '—'}</b></span>
          <span class="small">Headspace <b>${t.ready ? ({yes: 'Right', unsure: 'Unsure', no: 'Wrong'})[t.ready] : '—'}</b></span>
        </div>
      </section>
      <section class="dsec"><h3 class="eyebrow">Review</h3>
        <div><div class="qlabel">Mistakes</div>${t.mistakes && t.mistakes.length ? staticChips(t.mistakes, 'bad') : '<span class="hint">None tagged</span>'}</div>
        ${t.exitReason ? `<div><div class="qlabel">Exit</div><span class="pill">${esc(t.exitReason)}</span></div>` : ''}
        ${qa('What I did well', t.wentWell)}${qa('What I would do differently', t.differently)}${qa('Lesson', t.lesson)}
        ${t.chartUrl ? `<a class="btn btn-sm" href="${esc(t.chartUrl)}" target="_blank" rel="noopener noreferrer">Open chart ↗</a>` : ''}
      </section>
    </div>
    <div class="sheet-foot">${t.sample ? '<span class="hint" style="margin-right:auto">Sample trade. Log your own to start your journal.</span><button class="btn btn-primary" data-act="log">Log a trade</button>'
      : `<div id="delZone" class="row" style="margin-right:auto"><button class="btn btn-danger" data-act="delete-trade" data-id="${esc(id)}">Delete</button></div><button class="btn" data-act="duplicate-trade" data-id="${esc(id)}">Duplicate</button><button class="btn btn-primary" data-act="edit-trade" data-id="${esc(id)}">Edit trade</button>`}</div>`);
  S.sheetKind = 'trade-detail';
}
function openDay(date) {
  const {trades, days} = data();
  const list = sortTrades(trades.filter(x => x.date === date));
  const net = sum(list, x => x.pnl), d = days[date] || {}, ro2 = S.previewOn;
  const v = x => x == null ? '' : esc(x);
  openSheet(`<div class="sheet-head"><div><div class="eyebrow">Daily journal</div><h2 class="h2" id="sheetTitle">${esc(prettyDate(date, true))}</h2>
      <div class="row" style="margin-top:8px">${list.length ? `<span class="num ${cls(net)}" style="font-size:20px">${money(net)}</span><span class="small">${plural(list.length, 'trade')}</span>` : '<span class="small">No trades logged</span>'}</div></div>
      <button class="icon-btn" data-act="close" aria-label="Close">×</button></div>
    <div class="sheet-body">
      <fieldset ${ro2 ? 'disabled' : ''} id="dayForm">
        <section class="fsec">
          <div class="fsec-title"><span class="step">BEFORE</span><div><h3 class="h3">Pre-market plan</h3><p>Fill this in before the open.</p></div></div>
          <div class="frow" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
            <div class="field"><span class="lbl">Sleep quality (1–5)</span>${chipGroup('sleep', [1, 2, 3, 4, 5], d.sleep, {cls: 'sq', label: 'Sleep'})}</div>
            <div class="field"><span class="lbl">Market bias</span>${chipGroup('bias', ['Bullish', 'Bearish', 'Neutral', 'No read'], d.bias, {label: 'Bias'})}</div>
          </div>
          <div class="field"><span class="lbl">How I feel going in</span>${chipGroup('mood', DAY_MOODS, d.mood, {multi: true, tone: 'emo', label: 'Mood'})}</div>
          <div class="field"><label for="df-plan">Plan, key levels and what I'm waiting for</label><textarea id="df-plan" placeholder="ONH 26,388 / ONL 26,210. Long only above VWAP. Waiting for a sweep of the low…">${v(d.plan)}</textarea></div>
          <div class="field" style="max-width:220px"><label for="df-max">Max trades today</label><input id="df-max" type="number" inputmode="numeric" min="0" step="1" value="${v(d.maxTrades)}"></div>
        </section>
        <section class="fsec">
          <div class="fsec-title"><span class="step">AFTER</span><div><h3 class="h3">End-of-day review</h3><p>Fill this in after you're done trading.</p></div></div>
          <div class="field"><span class="lbl">How I feel about today</span>${chipGroup('feel', EMO_AFTER, d.feel, {multi: true, tone: 'emo', label: 'Feeling about today'})}</div>
          <div class="field"><span class="lbl">Did I follow my plan?</span>${chipGroup('dplan', [{v: 'yes', l: 'Yes'}, {v: 'mostly', l: 'Mostly'}, {v: 'no', l: 'No'}], d.followedPlan, {label: 'Followed plan'})}</div>
          <div class="field"><span class="lbl">Discipline score (1–10)</span>${chipGroup('discipline', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], d.discipline, {cls: 'sq', label: 'Discipline'})}</div>
          <div class="field"><label for="df-well">What went well?</label><textarea id="df-well">${v(d.wentWell)}</textarea></div>
          <div class="field"><label for="df-improve">What do I need to improve?</label><textarea id="df-improve">${v(d.improve)}</textarea></div>
          <div class="field"><label for="df-lesson">Lesson of the day</label><input id="df-lesson" type="text" maxlength="240" value="${v(d.lesson)}"></div>
          <div class="field"><label for="df-notes">Notes</label><textarea id="df-notes" placeholder="News, market conditions, anything else worth remembering">${v(d.notes)}</textarea></div>
        </section>
      </fieldset>
    </div>
    <div class="sheet-foot">${ro2 ? `<span class="hint" style="margin-right:auto">Sample day. Hide the sample to write your own journal.</span><button class="btn" data-act="hide-sample-day" data-date="${date}">Start my journal</button>`
      : `<span class="form-err" id="df-err" role="alert"></span><button class="btn" data-act="close">Close</button><button class="btn btn-primary" data-act="save-day" data-date="${date}" id="df-save">Save journal</button>`}</div>`);
  S.sheetKind = 'day';
}
async function saveDay(date) {
  const root = $('#sheet'), btn = $('#df-save');
  const txt = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
  const n = k => { const x = readChips(root, k); return x == null ? null : Number(x); };
  const day = {
    kind: 'day', date, sleep: n('sleep'), bias: readChips(root, 'bias'), mood: readChips(root, 'mood'),
    plan: txt('df-plan'), maxTrades: fval('df-max'), feel: readChips(root, 'feel'), followedPlan: readChips(root, 'dplan'),
    discipline: n('discipline'), wentWell: txt('df-well'), improve: txt('df-improve'), lesson: txt('df-lesson'), notes: txt('df-notes'),
    updatedAt: Date.now()
  };
  btn.disabled = true; btn.textContent = 'Saving…';
  try { await Store.put('d-' + date, day); }
  catch (e) { btn.disabled = false; btn.textContent = 'Save journal'; $('#df-err').textContent = writeError(e); return; }
  closeSheet();
  toast('Journal saved');
  renderAll();
}

/* =========================================================
   Settings actions, export/import
   ========================================================= */
async function saveSettings(silent) {
  const body = Object.assign({}, S.settings, {kind: 'settings', updatedAt: Date.now()});
  try { await Store.put('settings', body); if (!silent) toast('Settings saved'); }
  catch (e) { toast(writeError(e), 'bad'); }
}
function realExport() {
  return {app: 'edge-journal', version: 1, exportedAt: new Date().toISOString(), settings: S.settings, trades: sortTrades(S.trades), days: Object.values(S.days)};
}
function downloadText(filename, text) {
  const type = filename.endsWith('.csv') ? 'text/csv' : 'application/json';
  const url = URL.createObjectURL(new Blob([text], {type}));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function offerFile(filename, text) { downloadText(filename, text); toast('Export downloaded'); }
function toCSV(trades) {
  const cols = ['date','entryTime','exitTime','market','sym','side','qty','entry','exit','stop','target','fees','pnl','r','session','setup','timeframe','confluences','origin','reason','emoBefore','emoDuring','emoAfter','confidence','stress','ready','followedPlan','mistakes','exitReason','wentWell','differently','lesson','grade','chartUrl'];
  const cell = v => { if (v == null) return ''; if (Array.isArray(v)) v = v.join('; '); const s = String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.join(',')].concat(trades.map(t => cols.map(c => cell(c === 'market' ? tradeMkt(t) : t[c])).join(','))).join('\n');
}
async function runImport() {
  const d = S.importData;
  if (!d) return;
  const zone = $('#importZone');
  const items = [...d.trades.map(t => ['t', t]), ...d.days.map(x => ['d', x])];
  let done = 0, failed = 0;
  zone.innerHTML = `<p class="small" style="margin-top:12px" id="impProg">Importing… 0 / ${items.length}</p>`;
  for (const [k, x] of items) {
    try {
      if (k === 't') {
        const id = (typeof x.id === 'string' && /^[A-Za-z0-9_\-.~:@+]{1,120}$/.test(x.id) && !x.sample) ? x.id : ('t-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7));
        const body = Object.assign({}, x, {kind: 'trade'}); delete body.id; delete body.sample;
        await Store.put(id, body);
      } else {
        const body = Object.assign({}, x, {kind: 'day'}); delete body.sample;
        await Store.put('d-' + x.date, body);
      }
      done++;
    } catch (e) {
      failed++;
      if (e && (e.code === 'quota_exceeded' || e.code === 'invalid_argument' || e.code === 'revoked' || e.code === '42501' || e.code === '42P01')) { toast(writeError(e), 'bad'); break; }
      if (e && e.code === 'resource_exhausted') await sleep(1500);
    }
    if (done % 15 === 0) await sleep(250);
    const p = $('#impProg'); if (p) p.textContent = `Importing… ${done} / ${items.length}`;
  }
  if (d.settings) { S.settings = mergeSettings(d.settings); await saveSettings(true); }
  S.importData = null;
  if (done) { S.previewOn = false; lsSet('ej.hasTrades', '1'); }
  toast(`Imported ${done} of ${items.length}${failed ? ` · ${failed} failed` : ''}`);
  renderAll();
}

/* =========================================================
   Sign-in (website only)
   ========================================================= */
const PROVIDER_LABEL = {google: 'Google', apple: 'Apple', github: 'GitHub', discord: 'Discord', twitter: 'X'};
const A = {sb: null, mode: 'signin', err: '', msg: '', email: '', recovery: false};
const siteUrl = () => location.origin + location.pathname;
const logoSvg = gid => `<svg width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
  <defs><linearGradient id="${gid}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" style="stop-color:var(--violet)"/><stop offset=".55" style="stop-color:var(--magenta)"/><stop offset="1" style="stop-color:var(--amber)"/></linearGradient></defs>
  <rect width="30" height="30" rx="9" style="fill:var(--surface-3)"/>
  <g style="fill:url(#${gid});stroke:url(#${gid})" stroke-width="1.6" stroke-linecap="round">
    <line x1="8.5" y1="14" x2="8.5" y2="23"/><rect x="6.5" y="16" width="4" height="5" rx="1"/>
    <line x1="15" y1="10" x2="15" y2="20"/><rect x="13" y="12" width="4" height="6" rx="1"/>
    <line x1="21.5" y1="6" x2="21.5" y2="16"/><rect x="19.5" y="7.5" width="4" height="6.5" rx="1"/>
  </g></svg>`;
function authArt() {
  const s = S.sample || makeSample();
  const byDay = new Map();
  sortTrades(s.trades).forEach(x => byDay.set(x.date, (byDay.get(x.date) || 0) + x.pnl));
  let c = 0;
  const vals = [0, ...[...byDay.values()].map(v => (c += v))];
  const lo = Math.min(...vals), hi = Math.max(...vals), W = 560, H = 200;
  const X = i => i * W / (vals.length - 1), Y = v => 12 + (hi - v) / (hi - lo || 1) * (H - 24);
  const line = 'M' + vals.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('L');
  const bars = [...byDay.values()].map((v, i) => { const x = X(i + 1), h = Math.abs(v) / 1300 * 34; return `<rect x="${(x - 3).toFixed(1)}" y="${(v >= 0 ? H - h : H).toFixed(1)}" width="6" height="${h.toFixed(1)}" rx="2" style="fill:${v >= 0 ? 'var(--win)' : 'var(--loss)'};opacity:.55"/>`; }).join('');
  return `<svg class="auth-chart" viewBox="0 0 ${W} ${H + 40}" aria-hidden="true">
    <defs><linearGradient id="authg" x1="0" x2="1" y1="0" y2="0"><stop offset="0" style="stop-color:var(--violet)"/><stop offset=".55" style="stop-color:var(--magenta)"/><stop offset="1" style="stop-color:var(--amber)"/></linearGradient>
    <linearGradient id="autha" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:var(--magenta);stop-opacity:.25"/><stop offset="1" style="stop-color:var(--magenta);stop-opacity:0"/></linearGradient></defs>
    <path d="${line}L${W},${H}L0,${H}Z" style="fill:url(#autha)"/>
    <path d="${line}" style="fill:none;stroke:url(#authg)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <g transform="translate(0,34)">${bars}</g>
  </svg>`;
}
function authErr(e) {
  const m = String((e && e.message) || '').toLowerCase();
  if (m.includes('invalid login')) return 'Wrong email or password.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with this email already exists. Sign in instead.';
  if (m.includes('email not confirmed')) return 'Confirm your email first. The link is in your inbox.';
  if (m.includes('rate limit') || (e && e.status === 429)) return 'Too many attempts. Wait a minute, then try again.';
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) return 'That sign-in option is not turned on in Supabase yet (Authentication → Sign In / Providers).';
  if (m.includes('not authorized') && m.includes('email')) return 'Email sign-up is not set up yet. Use Google, or ask the site owner to set up email (setup guide, step 7).';
  if (m.includes('failed to fetch') || m.includes('network')) return 'Could not reach the server. Check your connection.';
  return (e && e.message) || 'Something went wrong. Try again.';
}
function renderAuth() {
  $('#boot').hidden = true; $('#app').hidden = true;
  const el = $('#auth'); el.hidden = false;
  const m = A.mode, email = !!CFG.emailAuth;
  const providers = (CFG.authProviders || []).filter(p => PROVIDER_LABEL[p]);
  const provBtns = verb => providers.map(p => `<button class="btn btn-provider" data-act="oauth" data-p="${p}">${verb} with ${PROVIDER_LABEL[p]}</button>`).join('');
  const msg = `${A.err ? `<p class="form-err" role="alert">${esc(A.err)}</p>` : ''}${A.msg && m !== 'check' ? `<p class="form-ok">${esc(A.msg)}</p>` : ''}`;
  let card = '';
  if (m === 'signin' || m === 'signup') {
    const up = m === 'signup';
    card = `<div><h2>${up ? 'Create your account' : 'Sign in'}</h2><p class="small" style="margin-top:6px">${up ? 'Free. Your journal is private to you.' : 'Welcome back. Your journal is waiting.'}</p></div>
      ${msg}
      ${provBtns(up ? 'Sign up' : 'Continue')}
      ${email ? `${providers.length ? '<div class="divider">or use email</div>' : ''}
        <form class="auth-form" id="authForm" novalidate>
          ${up ? '<div class="field"><label for="au-name">Name</label><input id="au-name" type="text" autocomplete="name" maxlength="60" required></div>' : ''}
          <div class="field"><label for="au-email">Email</label><input id="au-email" type="email" autocomplete="email" value="${esc(A.email)}" required></div>
          <div class="field"><label for="au-pass">Password${up ? ' <span class="muted">(8+ characters)</span>' : ''}</label><input id="au-pass" type="password" autocomplete="${up ? 'new-password' : 'current-password'}" minlength="8" required></div>
          <button class="btn btn-primary btn-block" type="submit" id="au-submit">${up ? 'Create account' : 'Sign in'}</button>
        </form>
        ${up ? '' : '<p class="auth-switch"><button class="textbtn" data-act="auth-mode" data-m="forgot">Forgot your password?</button></p>'}
        <p class="auth-switch">${up ? 'Already have an account? <button class="textbtn" data-act="auth-mode" data-m="signin">Sign in</button>' : 'New here? <button class="textbtn" data-act="auth-mode" data-m="signup">Create an account</button>'}</p>`
      : `<p class="hint" style="text-align:center">New here? Continue with ${esc(providers.map(p => PROVIDER_LABEL[p]).join(' or ')) || 'a provider'} and your account is created automatically.</p>`}`;
  } else if (m === 'forgot') {
    card = `<div><h2>Reset your password</h2><p class="small" style="margin-top:6px">We'll email you a link to choose a new one.</p></div>${msg}
      <form class="auth-form" id="authForm" novalidate>
        <div class="field"><label for="au-email">Email</label><input id="au-email" type="email" autocomplete="email" value="${esc(A.email)}" required></div>
        <button class="btn btn-primary btn-block" type="submit" id="au-submit">Send reset link</button>
      </form>
      <p class="auth-switch"><button class="textbtn" data-act="auth-mode" data-m="signin">Back to sign in</button></p>`;
  } else if (m === 'check') {
    card = `<div><h2>Check your email</h2><p class="small" style="margin-top:8px;line-height:1.55">${esc(A.msg)}</p></div>
      <p class="auth-switch"><button class="textbtn" data-act="auth-mode" data-m="signin">Back to sign in</button></p>`;
  } else if (m === 'reset') {
    card = `<div><h2>Choose a new password</h2><p class="small" style="margin-top:6px">Use at least 8 characters.</p></div>${msg}
      <form class="auth-form" id="authForm" novalidate>
        <div class="field"><label for="au-pass">New password</label><input id="au-pass" type="password" autocomplete="new-password" minlength="8" required></div>
        <div class="field"><label for="au-pass2">Repeat it</label><input id="au-pass2" type="password" autocomplete="new-password" minlength="8" required></div>
        <button class="btn btn-primary btn-block" type="submit" id="au-submit">Save password</button>
      </form>`;
  }
  el.innerHTML = `<section class="auth-art">
      <div class="brand" style="font-size:22px">${logoSvg('ejg-auth')}<span>Edge<b>Journal</b></span></div>
      <div><h1>Find what's <em>costing you</em> money.</h1>
        <p>Built for futures and forex traders. Log every trade with why you took it and how you felt. Edge Journal shows your P&amp;L by day, week, month and year, and which emotions and mistakes cost you the most.</p></div>
      ${authArt()}
      <ul class="auth-points"><li>Daily, weekly, monthly and yearly reports</li><li>Psychology questions on every trade</li><li>Prop account tracker with drawdown and daily loss limits</li></ul>
    </section>
    <section class="auth-panel"><div class="auth-card">${card}
      <p class="legal">By continuing you agree to the <a href="terms.html">Terms</a> and <a href="privacy.html">Privacy Policy</a>.${CFG.supportEmail ? ` Questions? ${esc(CFG.supportEmail)}` : ''}</p>
    </div></section>`;
  const first = $('#au-name') || $('#au-email') || $('#au-pass');
  if (first && !A.email) first.focus({preventScroll: true});
}
async function authSubmit() {
  const sb = A.sb, btn = $('#au-submit');
  const email = ($('#au-email') || {}).value ? $('#au-email').value.trim() : '';
  const pw = ($('#au-pass') || {}).value || '';
  A.err = ''; A.msg = ''; A.email = email;
  const label = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Working…'; }
  try {
    if (A.mode === 'signin') {
      if (!email || !pw) throw {message: 'Enter your email and password.'};
      const {error} = await sb.auth.signInWithPassword({email, password: pw});
      if (error) throw error;
    } else if (A.mode === 'signup') {
      const name = $('#au-name').value.trim();
      if (!email) throw {message: 'Enter your email.'};
      if (pw.length < 8) throw {message: 'Use at least 8 characters for your password.'};
      const {data, error} = await sb.auth.signUp({email, password: pw, options: {data: {full_name: name}, emailRedirectTo: siteUrl()}});
      if (error) throw error;
      if (!data.session) { A.mode = 'check'; A.msg = `We sent a confirmation link to ${email}. Open it to finish creating your account.`; renderAuth(); return; }
    } else if (A.mode === 'forgot') {
      if (!email) throw {message: 'Enter your email.'};
      const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: siteUrl()});
      if (error) throw error;
      A.mode = 'check'; A.msg = `If an account exists for ${email}, a reset link is on its way. It can take a minute.`; renderAuth(); return;
    } else if (A.mode === 'reset') {
      const pw2 = ($('#au-pass2') || {}).value || '';
      if (pw.length < 8) throw {message: 'Use at least 8 characters.'};
      if (pw !== pw2) throw {message: "The two passwords don't match."};
      const {error} = await sb.auth.updateUser({password: pw});
      if (error) throw error;
      A.recovery = false; A.mode = 'signin';
      const {data: {session}} = await sb.auth.getSession();
      if (session) { startApp(session); toast('Password updated'); } else renderAuth();
      return;
    }
  } catch (e) {
    A.err = authErr(e);
    renderAuth();
    return;
  }
  if (btn) { btn.disabled = false; btn.textContent = label; }
}
function setUserFrom(u) {
  const md = u.user_metadata || {};
  S.user = {name: md.full_name || md.name || '', email: u.email || '', avatar: md.avatar_url || md.picture || '', provider: (u.app_metadata && u.app_metadata.provider) || 'email'};
}
async function startApp(session) {
  const u = session.user;
  if (S.started && S.uid === u.id) return;
  S.started = true; S.uid = u.id; S.loadError = null;
  setUserFrom(u);
  S.trades = []; S.days = {}; S.settings = defaultSettings();
  S.loading = true; S.previewOn = false;
  Store = makeSupabaseStore(A.sb, u.id);
  $('#boot').hidden = true; $('#auth').hidden = true; $('#app').hidden = false;
  applyRoute(parseRoute(location.hash), {});
  loadSiteData();
}
async function loadSiteData() {
  S.loadError = null;
  try { await Store.init(onData); }
  catch (e) { S.loadError = writeError(e); S.loading = true; renderAll(); }
}
function endApp() {
  S.started = false; S.uid = null; S.user = null; Store = null;
  S.trades = []; S.days = {}; S.settings = defaultSettings(); S.loading = true;
  if (!$('#overlay').hidden) closeSheet();
}
function setupNeeded() {
  $('#boot').hidden = true;
  const el = $('#auth'); el.hidden = false;
  el.style.gridTemplateColumns = '1fr';
  el.innerHTML = `<section class="auth-panel"><div class="auth-card card gborder" style="width:min(560px,100%)">
    <div class="eyebrow">Almost there</div><h2>Connect your Supabase project</h2>
    <p class="small" style="line-height:1.6">Open <b>config.js</b> and paste your Supabase Project URL and publishable key, then reload this page. The setup guide (README.md) walks through every step.</p>
  </div></section>`;
}

/* =========================================================
   Events
   ========================================================= */
document.addEventListener('click', async e => {
  const menu = $('#acctMenu');
  if (menu && !menu.hidden && !e.target.closest('.acct')) closeMenu();
  // chip toggles inside forms
  const chip = e.target.closest('.chips[data-field] .chip[data-v]');
  if (chip && !chip.closest('fieldset:disabled')) {
    const g = chip.closest('.chips');
    const on = chip.getAttribute('aria-pressed') === 'true';
    if (g.dataset.field === 'market') { if (!on) switchMarket(chip.dataset.v); return; }
    if (g.dataset.multi !== '1') $$('.chip', g).forEach(b => b.setAttribute('aria-pressed', 'false'));
    chip.setAttribute('aria-pressed', String(!on));
    if (g.dataset.field === 'sym') { const o = $('#tf-sym-other'); if (o) o.value = ''; }
    if (g.dataset.field === 'session' && S.form) S.form.sessionAuto = false;
    if (g.dataset.field === 'setup') { const o = $('#tf-setup-other'); if (o && !on) o.value = ''; }
    if (S.sheetKind === 'trade-form') updateCalc();
    return;
  }
  // navigation links
  const nav = e.target.closest('[data-go]');
  if (nav) {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    if (nav.getAttribute('aria-disabled') === 'true') return;
    if (S.sheetKind) closeSheet();
    go(nav.dataset.go, {replace: nav.dataset.replace === '1', keepScroll: nav.dataset.replace === '1'});
    return;
  }
  const b = e.target.closest('[data-act]');
  if (!b) { if (e.target === $('#overlay')) closeSheet(); return; }
  const a = b.dataset.act;
  switch (a) {
    case 'acct-menu': { const m = $('#acctMenu'); if (m.hidden) openMenu(); else closeMenu(); break; }
    case 'log': { const date = b.dataset.date; closeMenu(); if (S.sheetKind) closeSheet(); openTradeForm(null, date); break; }
    case 'close': closeSheet(); break;
    case 'jump': { const t = document.getElementById(b.dataset.to); if (t) t.scrollIntoView({behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start'}); break; }
    case 'save-trade': saveTradeForm(); break;
    case 'open-trade': openTradeDetail(b.dataset.id); break;
    case 'edit-trade': { const t = data().trades.find(x => x.id === b.dataset.id); if (t) openTradeForm(t); break; }
    case 'duplicate-trade': {
      const t = data().trades.find(x => x.id === b.dataset.id);
      if (t) { closeSheet(); openTradeForm(null, todayStr()); setTimeout(() => prefillFromTemplate(t), 0); }
      break;
    }
    case 'delete-trade': $('#delZone').innerHTML = `<span class="small">Delete this trade?</span><button class="btn btn-danger btn-sm" data-act="confirm-delete" data-id="${esc(b.dataset.id)}">Yes, delete</button><button class="btn btn-sm" data-act="cancel-delete" data-id="${esc(b.dataset.id)}">Keep</button>`; break;
    case 'cancel-delete': $('#delZone').innerHTML = `<button class="btn btn-danger" data-act="delete-trade" data-id="${esc(b.dataset.id)}">Delete</button>`; break;
    case 'confirm-delete': {
      b.disabled = true;
      try { await Store.remove(b.dataset.id); closeSheet(); toast('Trade deleted'); renderAll(); }
      catch (err) { b.disabled = false; toast(writeError(err), 'bad'); }
      break;
    }
    case 'open-day': openDay(b.dataset.date); break;
    case 'save-day': saveDay(b.dataset.date); break;
    case 'hide-sample-day': { S.previewOn = false; lsSet('ej.hidePreview', '1'); const d = b.dataset.date; closeSheet(); renderAll(); openDay(d); break; }
    case 'mind-p': S.mindP = b.dataset.p; renderAll(); break;
    case 'trades-range': S.filters.range = {from: b.dataset.from, to: b.dataset.to, title: b.dataset.title}; S.filters.period = 'all'; S.listLimit = 60; go('trades'); break;
    case 'clear-range': S.filters.range = null; renderAll(); break;
    case 'hide-sample': S.previewOn = false; lsSet('ej.hidePreview', '1'); renderAll(); break;
    case 'show-sample': S.previewOn = true; lsSet('ej.hidePreview', '0'); renderAll(); break;
    case 'more': S.listLimit += 60; renderTradeList(); break;
    case 'retry-load': if (SITE && Store) { S.loadError = null; renderAll(); loadSiteData(); } else location.reload(); break;
    case 'save-account': {
      const s = S.settings, num = id => { const v = fval(id); return v == null ? 0 : v; };
      s.accountName = $('#st-name').value.trim();
      s.start = num('st-start'); s.target = num('st-target'); s.maxDD = num('st-dd'); s.ddType = $('#st-ddtype').value;
      s.dailyLimit = num('st-daily'); s.riskPerTrade = num('st-risk'); s.accountSet = s.start > 0;
      if ($('#st-qty')) s.defaultQty = Math.max(1, Math.round(num('st-qty')) || 1);
      if ($('#st-sym')) s.defaultSym = $('#st-sym').value;
      if ($('#st-fx')) s.defaultFx = $('#st-fx').value;
      if ($('#st-lots')) s.defaultLots = Math.max(0.01, num('st-lots') || 1);
      if ($('#st-dmkt')) s.defaultMarket = $('#st-dmkt').value;
      await saveSettings(); renderAll(); break;
    }
    case 'add-setup': {
      const inp = $('#st-newsetup'), v = inp.value.trim();
      if (!v) { inp.focus(); break; }
      if (!S.settings.setups.includes(v)) S.settings.setups.push(v);
      await saveSettings(true); renderAll(); const ni = $('#st-newsetup'); if (ni) ni.focus(); break;
    }
    case 'remove-setup': S.settings.setups.splice(Number(b.dataset.i), 1); await saveSettings(true); renderAll(); break;
    case 'add-inst': {
      const mk = $('#st-imkt').value, sym = $('#st-isym').value.trim().toUpperCase(), name = $('#st-iname').value.trim();
      if (!sym || !/^[A-Z0-9]{1,8}$/.test(sym)) { toast(`Enter a symbol using letters and numbers, like ${mk === 'forex' ? 'AUDJPY' : 'MCL'}.`, 'bad'); break; }
      let rec;
      if (mk === 'forex') {
        rec = {sym, name, mkt: 'forex', lot: fval('st-ilot') || 100000, pip: fval('st-ipip') || (sym.endsWith('JPY') ? 0.01 : 0.0001), pinned: true};
      } else {
        const pv = fval('st-ipv');
        if (!pv || pv <= 0) { toast('Enter the dollar value of one full point for ' + sym + '.', 'bad'); break; }
        rec = {sym, name, mkt: 'futures', pv, pinned: true};
      }
      const ex = inst(sym);
      if (ex) { Object.assign(ex, rec, {name: name || ex.name}); }
      else S.settings.instruments.push(rec);
      await saveSettings(true); toast(sym + ' added'); renderAll(); break;
    }
    case 'toggle-market': {
      const st = S.settings, set = new Set(st.markets), m = b.dataset.m;
      if (set.has(m)) { if (set.size === 1) { toast('Keep at least one market.', 'bad'); break; } set.delete(m); } else set.add(m);
      st.markets = MARKETS.map(x => x.v).filter(v => set.has(v));
      if (!st.markets.includes(st.defaultMarket)) st.defaultMarket = st.markets[0];
      await saveSettings(true); renderAll(); break;
    }
    case 'set-markets': {
      const st = S.settings, m = b.dataset.m;
      st.markets = m === 'both' ? ['futures', 'forex'] : [m];
      st.defaultMarket = m === 'both' ? (st.defaultMarket || 'futures') : m;
      await saveSettings(true); renderAll(); break;
    }
    case 'remove-inst': {
      const k = Number(b.dataset.i), sym = S.settings.instruments[k] && S.settings.instruments[k].sym;
      if (S.settings.instruments.length <= 1) { toast('Keep at least one instrument.', 'bad'); break; }
      S.settings.instruments.splice(k, 1);
      if (S.settings.defaultSym === sym) S.settings.defaultSym = S.settings.instruments[0].sym;
      await saveSettings(true); renderAll(); break;
    }
    case 'export-json': {
      closeMenu();
      if (!S.trades.length && !Object.keys(S.days).length) { toast('Nothing to export yet. The sample preview is not exported.'); break; }
      offerFile(`edge-journal-backup-${todayStr()}.json`, JSON.stringify(realExport(), null, 2)); break;
    }
    case 'export-csv': {
      if (!S.trades.length) { toast('No trades to export yet.'); break; }
      offerFile(`edge-journal-trades-${todayStr()}.csv`, toCSV(sortTrades(S.trades))); break;
    }
    case 'import': $('#importFile').click(); break;
    case 'import-go': runImport(); break;
    case 'import-cancel': S.importData = null; $('#importZone').innerHTML = ''; break;
    case 'copy-box': {
      const box = $('#copyBox');
      try { await navigator.clipboard.writeText(box.value); toast('Copied'); }
      catch (err) { box.focus(); box.select(); toast('Press Ctrl+C (or ⌘C) to copy the selected text.'); }
      break;
    }
    case 'wipe': S.wipeArmed = true; renderAll(); break;
    case 'wipe-cancel': S.wipeArmed = false; renderAll(); break;
    case 'wipe-confirm': {
      b.disabled = true;
      const ids = S.trades.map(t => t.id).concat(Object.keys(S.days).map(d => 'd-' + d));
      let n = 0;
      for (const id of ids) { try { await Store.remove(id); n++; } catch (err) { toast(writeError(err), 'bad'); break; } if (n % 15 === 0) await sleep(250); }
      S.wipeArmed = false; lsSet('ej.hasTrades', '0');
      toast(`Deleted ${n} item${n === 1 ? '' : 's'}`); renderAll(); break;
    }
    /* website account */
    case 'sign-out': closeMenu(); if (A.sb) { await A.sb.auth.signOut(); } break;
    case 'delete-account': S.delArmed = true; renderAll(); break;
    case 'delete-account-cancel': S.delArmed = false; renderAll(); break;
    case 'delete-account-confirm': {
      const v = ($('#delConfirm') || {}).value || '';
      if (v.trim() !== 'DELETE') { toast('Type DELETE in capitals to confirm.', 'bad'); break; }
      b.disabled = true;
      const {error} = await A.sb.rpc('delete_my_account');
      if (error) { b.disabled = false; toast('Could not delete your account: ' + (error.message || 'try again.'), 'bad'); break; }
      A.msg = 'Your account and journal were deleted.';
      await A.sb.auth.signOut();
      break;
    }
    case 'oauth': {
      A.err = '';
      b.disabled = true;
      const {error} = await A.sb.auth.signInWithOAuth({provider: b.dataset.p, options: {redirectTo: siteUrl()}});
      if (error) { A.err = authErr(error); renderAuth(); }
      break;
    }
    case 'auth-mode': A.mode = b.dataset.m; A.err = ''; A.msg = ''; renderAuth(); break;
  }
});
document.addEventListener('submit', e => {
  if (e.target.id === 'authForm') { e.preventDefault(); authSubmit(); }
  else if (e.target.id === 'tradeForm') e.preventDefault();
});
document.addEventListener('input', e => {
  const t = e.target;
  if (S.sheetKind === 'trade-form' && t.closest('#sheet')) {
    if (t.id === 'tf-pnl') t.dataset.auto = t.value === '' ? '1' : '0';
    if (t.id === 'tf-in' && S.form && S.form.sessionAuto) {
      const s = sessionFor(t.value), g = $('[data-field="session"]', $('#sheet'));
      if (g) $$('.chip', g).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === s)));
    }
    if (t.id === 'tf-setup-other' && t.value) { const g = $('[data-field="setup"]', $('#sheet')); if (g) $$('.chip', g).forEach(b => b.setAttribute('aria-pressed', 'false')); }
    updateCalc();
    return;
  }
  if (t.id && t.id.startsWith('f-')) {
    const k = t.id.slice(2);
    if (k in S.filters) { S.filters[k] = t.value; S.listLimit = 60; renderTradeList(); }
  }
});
document.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'tf-sym-other') {
    if (t.value) { const g = $('[data-field="sym"]', $('#sheet')); if (g) $$('.chip', g).forEach(b => b.setAttribute('aria-pressed', 'false')); }
    updateCalc(); return;
  }
  if (t.dataset.instLot != null || t.dataset.instPip != null) {
    const k = Number(t.dataset.instLot != null ? t.dataset.instLot : t.dataset.instPip), i = S.settings.instruments[k], v = Number(t.value);
    if (i && v > 0) { if (t.dataset.instLot != null) i.lot = v; else i.pip = v; await saveSettings(true); toast(`${i.sym} updated`); }
    return;
  }
  if (t.id === 'st-imkt') {
    const fx = t.value === 'forex';
    $('#st-ifut').hidden = fx; $('#st-ifx').hidden = !fx; $('#st-ifx2').hidden = !fx;
    return;
  }
  if (t.dataset.instPv != null) {
    const i = S.settings.instruments[Number(t.dataset.instPv)], v = Number(t.value);
    if (i && v > 0) { i.pv = v; await saveSettings(true); toast(`${i.sym} set to $${v} per point`); }
    return;
  }
  if (t.dataset.instPin != null) {
    const i = S.settings.instruments[Number(t.dataset.instPin)];
    if (i) { i.pinned = t.checked; await saveSettings(true); }
    return;
  }
  if (t.id === 'importFile') {
    const file = t.files && t.files[0];
    t.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let d;
      try { d = JSON.parse(reader.result); } catch (err) { toast('That file is not valid JSON. Choose a backup exported from Edge Journal.', 'bad'); return; }
      const trades = Array.isArray(d && d.trades) ? d.trades.filter(x => x && x.date && /^\d{4}-\d{2}-\d{2}$/.test(x.date)) : [];
      const days = Array.isArray(d && d.days) ? d.days.filter(x => x && x.date && /^\d{4}-\d{2}-\d{2}$/.test(x.date)) : [];
      if (!trades.length && !days.length) { toast('No trades or journal days found in that file.', 'bad'); return; }
      S.importData = {trades, days, settings: d.settings && typeof d.settings === 'object' ? d.settings : null};
      const z = $('#importZone');
      if (z) z.innerHTML = `<div class="preview-banner" style="margin:14px 0 0"><div><div class="eyebrow">Ready to import</div><p>${plural(trades.length, 'trade')} and ${plural(days.length, 'journal day')}. Entries with the same id replace what's here.${S.importData.settings ? ' Your account rules will be replaced too.' : ''}</p></div><div class="row"><button class="btn btn-primary btn-sm" data-act="import-go">Import</button><button class="btn btn-sm" data-act="import-cancel">Cancel</button></div></div>`;
    };
    reader.onerror = () => toast('Could not read that file.', 'bad');
    reader.readAsText(file);
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!$('#overlay').hidden) { closeSheet(); return; }
    closeMenu();
  }
  const tag = (e.target.tagName || '').toLowerCase();
  if (e.key === 'n' && S.started && !e.metaKey && !e.ctrlKey && !e.altKey && $('#overlay').hidden && !['input', 'textarea', 'select'].includes(tag)) { e.preventDefault(); openTradeForm(null); }
});
let rT = null;
window.addEventListener('resize', () => { clearTimeout(rT); rT = setTimeout(() => { if (S.started && S.route.view === 'calendar') renderCalendar(); }, 200); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Store && Store.refresh) Store.refresh(); });

/* =========================================================
   Boot
   ========================================================= */
function onData(out) {
  S.trades = out.trades;
  S.days = out.days;
  if (out.settings) S.settings = mergeSettings(out.settings);
  S.loading = false; S.loadError = null;
  if (S.trades.length) { S.previewOn = false; lsSet('ej.hasTrades', '1'); }
  else { lsSet('ej.hasTrades', '0'); S.previewOn = lsGet('ej.hidePreview') === '0'; } // sample only when asked for
  renderAll();
}
async function bootSite() {
  S.sample = makeSample();
  const url = String(CFG.supabaseUrl || ''), key = String(CFG.supabaseKey || '');
  if (!window.supabase || !/^https:\/\/.+/.test(url) || url.includes('YOUR-PROJECT') || !key || key.startsWith('YOUR-')) { setupNeeded(); return; }
  // read what Supabase put in the URL before it cleans it up
  const hp = new URLSearchParams(location.hash.slice(1));
  if (hp.get('error_description')) { A.err = hp.get('error_description').replace(/\+/g, ' '); try { history.replaceState(null, '', location.pathname); } catch (e) {} }
  if (hp.get('type') === 'recovery') { A.recovery = true; A.mode = 'reset'; }
  A.sb = window.supabase.createClient(url, key, {auth: {persistSession: true, autoRefreshToken: true, detectSessionInUrl: true}});
  A.sb.auth.onAuthStateChange((event, session) => {
    // defer: Supabase recommends not awaiting other calls inside this callback
    setTimeout(() => {
      if (event === 'PASSWORD_RECOVERY') { A.recovery = true; A.mode = 'reset'; renderAuth(); return; }
      if (event === 'SIGNED_OUT') { endApp(); A.mode = 'signin'; renderAuth(); return; }
      if (event === 'USER_UPDATED' && session && S.started) { setUserFrom(session.user); renderNav(); return; }
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session && !A.recovery) startApp(session);
    }, 0);
  });
  const {data: {session}} = await A.sb.auth.getSession();
  if (A.recovery) renderAuth();
  else if (session) startApp(session);
  else renderAuth();
}
bootSite();
})();
