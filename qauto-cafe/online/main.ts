// Q-Auto Cafe online ordering — the customer site (qautocafe.vercel.app).
//
// Deliberately separate from the POS: nothing here imports the admin or barista
// app. It only calls the three public functions in supabase/online-orders.sql —
// read the menu, place an order, follow your own order. Prices and the staff
// discount are worked out by the server; the sums below are for display only.
import './style.css'
import '@fontsource/montserrat/latin-400.css'
import '@fontsource/montserrat/latin-500.css'
import '@fontsource/montserrat/latin-600.css'
import logo from '../src/assets/brand/qauto-logo.svg'
import word from '../src/assets/brand/qauto-wordmark.svg'
import wordWhite from '../src/assets/brand/qauto-wordmark-white.svg'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../src/sync/config'

type Branch = 'volkswagen' | 'audi'
type Who = 'guest' | 'retail'
type Pay = 'card' | 'cash'
type Milk = 'fresh' | 'lactose-free'
type Status = 'pending' | 'accepted' | 'onway' | 'delivered' | 'rejected'
type Kind = 'hot' | 'tea' | 'iced' | 'juice' | 'mojito' | 'soft' | 'pastry' | 'bar'

interface Item { id: string; name: string; price: number; milk: boolean; kind: Kind }
interface Category { name: string; items: Item[] }
interface CartLine { id: string; name: string; price: number; milk: Milk | null; qty: number }
interface Mine {
  id: string; token: string; no: number; branch: Branch; who: Who; pay: Pay; name: string; where: string
  lines: CartLine[]; subtotal: number; discountPct: number; total: number; status: Status; reason?: string; at: number
}

/* ---------- Server ---------- */
async function rpc<T>(fn: string, body: unknown): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  // The server's own refusals ("Add your name", "The cafe is busy…") are written for the customer.
  if (!res.ok) throw new Error((json && typeof json.message === 'string' && res.status < 500) ? json.message : 'Something went wrong. Please try again.')
  return json as T
}

/* ---------- Menu ---------- */
let MENU: Category[] = []
let ITEMS: Item[] = []
let POPULAR: Item[] = []

// The till's category names are upper case with stray spaces ("ICED  DRINKS ").
const tidy = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s-])\S/g, c => c.toUpperCase())
const kindOf = (category: string): Kind =>
  /tea/i.test(category) && /hot/i.test(category) ? 'tea'
    : /juice/i.test(category) ? 'juice'
      : /moj|lemonade/i.test(category) ? 'mojito'
        : /iced|frapp|cold/i.test(category) ? 'iced'
          : /soft|water/i.test(category) ? 'soft'
            : /pastr|food/i.test(category) ? 'pastry'
              : /protein|bar/i.test(category) ? 'bar'
                : 'hot'

async function loadMenu() {
  const m = await rpc<{ categories: { id: string; name: string }[]; items: { id: string; name: string; price: number; categoryId: string; milk: boolean }[] }>('online_menu', {})
  MENU = m.categories.map(c => ({
    name: tidy(c.name),
    items: m.items.filter(i => i.categoryId === c.id).map(i => ({ id: i.id, name: i.name.trim(), price: Number(i.price), milk: i.milk, kind: kindOf(c.name) })),
  })).filter(c => c.items.length)
  ITEMS = MENU.flatMap(c => c.items)
  const named = (n: string) => ITEMS.find(i => i.name.toLowerCase() === n.toLowerCase())
  POPULAR = ['Spanish Latte', 'Iced Spanish Latte', 'Cappuccino', 'Mint Lemonade Mojito', 'Hot Chocolate', 'Fresh Orange Juice'].map(named).filter((i): i is Item => !!i)
  if (POPULAR.length < 4) POPULAR = ITEMS.slice(0, 6)
}
const findItem = (id: string) => ITEMS.find(i => i.id === id)

/* ---------- State ---------- */
interface State {
  view: 'welcome' | 'menu' | 'cart' | 'thanks' | 'track'
  branch: Branch | null; cart: CartLine[]; sheet: { id: string; milk: Milk | null; qty: number } | null
  animate: boolean; cat: number; sending: boolean; sendError: string
  form: { name: string; ext: string; mobile: string; where: string; note: string; who: Who; pay: Pay }
  errors: Partial<Record<'name' | 'ext' | 'mobile' | 'where', string>>
}
let S: State
let mine: Mine | null = null
let lastBranch: Branch = 'volkswagen'
function fresh() {
  S = { view: 'welcome', branch: null, cart: [], sheet: null, animate: true, cat: 0, sending: false, sendError: '',
    form: { name: '', ext: '', mobile: '', where: '', note: '', who: 'guest', pay: 'card' }, errors: {} }
}
fresh()

// The last order and the customer's details stay on their phone, so a refresh
// keeps tracking and the next order is quicker.
const SAVE = 'qauto-online'
function save() { try { localStorage.setItem(SAVE, JSON.stringify({ mine, form: { ...S.form, ext: '', note: '' }, lastBranch })) } catch { /* private mode */ } }
function restore() {
  try {
    const v = JSON.parse(localStorage.getItem(SAVE) ?? 'null')
    if (!v) return
    if (v.form) Object.assign(S.form, v.form)
    if (v.lastBranch) lastBranch = v.lastBranch
    // An order still on its way is picked straight back up; an old one is not.
    if (v.mine && Date.now() - v.mine.at < 6 * 3600e3 && !['delivered', 'rejected'].includes(v.mine.status)) mine = v.mine
  } catch { /* ignore */ }
}

/* ---------- Helpers ---------- */
const CAFE: Record<Branch, string> = { volkswagen: 'VW Cafe', audi: 'Audi Cafe' }
const BUILDING: Record<Branch, string> = { volkswagen: 'Volkswagen', audi: 'Audi' }
const STAFF_DISCOUNT = 15
const qar = (n: number) => 'QAR ' + (Number.isInteger(n) ? n : n.toFixed(2))
const qar2 = (n: number) => 'QAR ' + n.toFixed(2)
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
const digits = (s: string) => s.replace(/\D/g, '')
const round2 = (n: number) => Math.round(n * 100) / 100
const applyDiscount = (sub: number, pct: number) => round2(sub * (1 - pct / 100))
const cartCount = () => S.cart.reduce((a, l) => a + l.qty, 0)
const cartTotal = () => round2(S.cart.reduce((a, l) => a + l.qty * l.price, 0))
const inCart = (id: string) => S.cart.filter(l => l.id === id).reduce((a, l) => a + l.qty, 0)
// 'Mr Smith' is greeted as Mr Smith, 'Sara Ahmed' as Sara.
const firstName = (n: string) => { const w = n.trim().split(/\s+/); return /^(mr|mrs|ms|miss|dr|eng|sheikh)\.?$/i.test(w[0]) && w[1] ? w[0] + ' ' + w[1] : w[0] }
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening' }
const milkLabel = (m: Milk) => m === 'lactose-free' ? 'Lactose-free milk' : 'Regular milk'
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/* ---------- Drink artwork, drawn per category so the menu has pictures without photos ---------- */
const TINT: [RegExp, string, string][] = [[/matcha|mint lemonade/i, '#7FA35B', '#EEF2E4'], [/hibiscus|karkade|pomegranate|watermelon|strawberry/i, '#C8344B', '#F8E6E6'], [/blue lagoon/i, '#2F86C9', '#E3EFF8'],
  [/blue ?berry/i, '#5B4A9E', '#ECE8F5'], [/passion|peach|orange|mango/i, '#F09A2B', '#FBEEDD'], [/apple|lemon|green tea/i, '#B9C24A', '#F3F3DE'], [/chocolate|mocha/i, '#5A3726', '#F1E7E1'],
  [/espresso|americano|turkish|red tea|karak/i, '#3B2418', '#F2EAE3'], [/water/i, '#5BA8D9', '#E6F1F8'], [/soft drink|can|cola/i, '#D23A2F', '#F8E5E3'], [/croissant/i, '#D59A45', '#F8EEDD'], [/protein/i, '#7A5C3E', '#F2EBE3']]
const tint = (n: string) => { for (const [re, c, b] of TINT) if (re.test(n)) return { c, b }; return { c: '#C69C72', b: '#F4EEE7' } }
function art(it: Item): string {
  const { c } = tint(it.name), k = /water/i.test(it.name) ? 'soft' : it.kind
  const glass = (fill: string, extra = '') => `<path d="M19 12h26l-3.2 42a4 4 0 0 1-4 3.7H26.2a4 4 0 0 1-4-3.7z" fill="#fff" fill-opacity=".75" stroke="#1d1d1f" stroke-opacity=".12" stroke-width="1.5"/>
    <path d="M21 24h22l-2.4 29.6a3 3 0 0 1-3 2.8H26.4a3 3 0 0 1-3-2.8z" fill="${fill}"/>${extra}`
  if (k === 'hot' || k === 'tea') return `<svg viewBox="0 0 64 64" aria-hidden="true"><ellipse cx="32" cy="52" rx="22" ry="5" fill="#fff" stroke="#1d1d1f" stroke-opacity=".1"/>
    <path d="M45 30h3a6 6 0 0 1 0 12h-5" fill="none" stroke="#fff" stroke-width="4"/><path d="M45 30h3a6 6 0 0 1 0 12h-5" fill="none" stroke="#1d1d1f" stroke-opacity=".12" stroke-width="1.5"/>
    <path d="M15 24h32v12a16 16 0 0 1-16 16h0a16 16 0 0 1-16-16z" fill="#fff" stroke="#1d1d1f" stroke-opacity=".12" stroke-width="1.5"/>
    <ellipse cx="31" cy="24.5" rx="15" ry="4" fill="${c}"/>${/latte|cappuccino|flat|cortado|macchiato|mocha|chocolate|matcha|spanish/i.test(it.name) ? `<path d="M27 24c2-2.5 6-2.5 8 0-2 1.6-6 1.6-8 0z" fill="#fff" fill-opacity=".8"/>` : ''}
    ${k === 'tea' ? `<path d="M38 22c3 4 3 10 1 14" fill="none" stroke="#1d1d1f" stroke-opacity=".3"/><rect x="36" y="35" width="6" height="7" rx="1" fill="${c}"/>` : ''}
    <g fill="none" stroke="${c}" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"><path d="M25 16c-2-3 2-5 0-8"/><path d="M32 16c-2-3 2-5 0-8"/><path d="M39 16c-2-3 2-5 0-8"/></g></svg>`
  if (k === 'iced') return `<svg viewBox="0 0 64 64" aria-hidden="true">${glass(c, `<rect x="24" y="26" width="8" height="8" rx="2" fill="#fff" fill-opacity=".55" transform="rotate(-12 28 30)"/><rect x="32" y="31" width="8" height="8" rx="2" fill="#fff" fill-opacity=".45" transform="rotate(10 36 35)"/>
    <path d="M23 24h18" stroke="#fff" stroke-opacity=".5" stroke-width="2"/>`)}<path d="M38 3l-4 40" stroke="#1d1d1f" stroke-width="3" stroke-linecap="round"/></svg>`
  if (k === 'juice' || k === 'mojito') return `<svg viewBox="0 0 64 64" aria-hidden="true">${glass(c, k === 'mojito'
    ? `<ellipse cx="28" cy="30" rx="5" ry="2.6" fill="#5E9A4A" transform="rotate(-30 28 30)"/><ellipse cx="35" cy="40" rx="5" ry="2.6" fill="#6FAE58" transform="rotate(25 35 40)"/><circle cx="30" cy="47" r="2" fill="#fff" fill-opacity=".6"/><circle cx="36" cy="28" r="1.6" fill="#fff" fill-opacity=".6"/>`
    : `<circle cx="30" cy="40" r="1.6" fill="#fff" fill-opacity=".5"/><circle cx="35" cy="33" r="1.2" fill="#fff" fill-opacity=".5"/>`)}
    <circle cx="45" cy="14" r="8" fill="${k === 'mojito' ? '#C6D86A' : c}" stroke="#fff" stroke-width="2"/><path d="M45 6v16M37 14h16" stroke="#fff" stroke-opacity=".7"/>
    <path d="M30 2l-3 42" stroke="#1d1d1f" stroke-width="3" stroke-linecap="round"/></svg>`
  if (k === 'soft') return /water/i.test(it.name)
    ? `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="27" y="5" width="10" height="6" rx="2" fill="#2F86C9"/><path d="M25 14c0-2 2-3 3-3h8c1 0 3 1 3 3l2 6v32a5 5 0 0 1-5 5H28a5 5 0 0 1-5-5V20z" fill="#DCEEF9" stroke="#5BA8D9" stroke-width="1.5"/><rect x="23" y="28" width="18" height="12" fill="#5BA8D9"/></svg>`
    : `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="20" y="10" width="24" height="46" rx="6" fill="${c}"/><ellipse cx="32" cy="11" rx="11" ry="3" fill="#E8E8E8" stroke="#bbb"/><path d="M20 30h24v8H20z" fill="#fff" fill-opacity=".9"/><path d="M24 16v34" stroke="#fff" stroke-opacity=".35" stroke-width="3"/></svg>`
  if (k === 'pastry') return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 40c4-14 16-22 24-22s20 8 24 22c-4 4-10 4-12 0-2 5-8 6-12 6s-10-1-12-6c-2 4-8 4-12 0z" fill="${c}"/><path d="M22 26l4 16M32 21v22M42 26l-4 16" stroke="#9A6A2C" stroke-width="2" stroke-linecap="round" opacity=".6"/></svg>`
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="10" y="24" width="44" height="18" rx="5" fill="${c}" transform="rotate(-12 32 33)"/><rect x="22" y="24" width="20" height="18" fill="#F2C14E" transform="rotate(-12 32 33)"/></svg>`
}
const artOf = (id: string) => { const it = findItem(id); return it ? art(it) : '' }

/* ---------- Screens ---------- */
const phone = document.getElementById('phone')!
const chevRight = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`

function welcomeHTML() {
  return `<div class="welcome has-video" id="welcome"><video class="bgvid" src="/splash.mp4" autoplay muted loop playsinline preload="auto" aria-hidden="true"></video><span class="scrim" aria-hidden="true"></span><span class="loader" aria-hidden="true"><i></i></span>
    <div class="brand-lock"><span class="mark"><img src="${logo}" alt=""></span><img class="word" src="${wordWhite}" alt="Q-Auto"></div>
    <div class="w-text"><h2 class="fade" style="animation-delay:1.75s">Welcome to Q-Auto Cafe</h2><p class="fade" style="animation-delay:1.85s">Fresh coffee, brought to you.</p></div>
    <div class="w-pick">
      <span class="lbl fade" style="animation-delay:2s">Select the branch</span>
      <button class="bld fade" style="animation-delay:2.08s" data-branch="volkswagen"><span><b>Volkswagen</b></span>${chevRight}</button>
      <button class="bld fade" style="animation-delay:2.16s" data-branch="audi"><span><b>Audi</b></span>${chevRight}</button>
    </div>
  </div>`
}
const plus = (it: Item) => { const q = inCart(it.id); return `<span class="plus ${q ? 'has' : ''}" aria-hidden="true">${q || '+'}</span>` }
// One category at a time: tapping a tab swaps the list instead of scrolling to it.
function sectionHTML(ci: number, animate: boolean) {
  const c = MENU[ci]
  return `<section class="section"><h3>${esc(c.name)} <small class="count">${c.items.length} item${c.items.length > 1 ? 's' : ''}</small></h3>${c.items.map((it, i) => `<button class="icard ${animate ? 'in' : ''}" ${animate ? `style="animation-delay:${(0.03 + 0.04 * i).toFixed(2)}s"` : ''} data-open="${it.id}">
        <span class="tile">${art(it)}</span>
        <span class="t"><b>${esc(it.name)}</b><span class="p num">${qar(it.price)}</span>${it.milk ? '<span class="badge">Choice of milk</span>' : ''}</span>
        ${plus(it)}</button>`).join('')}</section><div class="end" aria-hidden="true"></div>`
}
function menuHTML() {
  const a = S.animate; let n = 0; const d = () => a ? `style="animation-delay:${(0.05 + 0.045 * Math.min(n++, 12)).toFixed(2)}s"` : ''
  return `<div class="m-head ${a ? 'in' : ''}" ${d()}><div class="m-top"><span class="logo"><img src="${logo}" alt=""><img src="${word}" alt="Q-Auto"></span>
      <button class="where-btn" data-go="welcome" aria-label="Change branch">${BUILDING[S.branch!]} <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div>
      <div class="hi"><small>${greeting()}</small><h2>What can we get you?</h2></div></div>
    <div class="sec-h ${a ? 'in' : ''}" ${d()}><h3>Popular</h3><small>Swipe for more</small></div>
    <div class="rail">${POPULAR.map(it => `<button class="pcard ${a ? 'in' : ''}" ${d()} data-open="${it.id}"><span class="tile">${art(it)}${plus(it)}</span><span class="t"><b>${esc(it.name)}</b><small class="num">${qar(it.price)}</small></span></button>`).join('')}</div>
    <nav class="tabs ${a ? 'in' : ''}" ${d()} aria-label="Menu sections"><div class="tabs-in" id="tabs"><span class="ink" id="ink"></span>${MENU.map((c, i) => `<button data-tab="${i}" aria-current="${i === S.cat}">${esc(c.name)}</button>`).join('')}</div></nav>
    <div id="list">${sectionHTML(S.cat, a)}</div>`
}
function sheetHTML() {
  const it = findItem(S.sheet!.id)!, q = S.sheet!.qty
  return `<div class="sheet-bg" id="sheetbg" data-closesheet="1"><div class="sheet" role="dialog" aria-label="${esc(it.name)}"><span class="grab"></span>
    <div class="sb">
      <div class="hero-t">${art(it)}</div>
      <div class="nm"><h3>${esc(it.name)}</h3><span class="num">${qar(it.price)}</span></div>
      ${it.milk ? `<div><div class="lbl-row">Milk <span class="badge outline">Required</span></div><div class="radios">
        ${([['fresh', 'Regular milk', 'Fresh full-cream'], ['lactose-free', 'Lactose-free milk', 'Same taste, no lactose']] as const).map(([k, t, sub]) => `<button class="radio" data-milk="${k}" aria-pressed="${S.sheet!.milk === k}"><i></i><span><b>${t}</b><small>${sub}</small></span></button>`).join('')}</div></div>` : ''}
      <div class="addrow"><div class="qty"><button data-sq="-1" aria-label="One less">−</button><b class="num" id="sq">${q}</b><button data-sq="1" aria-label="One more">+</button></div>
        <button class="addbtn" id="addbtn"><span>Add to order</span><span class="num" id="sp">${qar(it.price * q)}</span></button></div>
    </div></div></div>`
}
function bagHTML() {
  return cartCount() ? `<button class="bag" id="bag" data-go="cart"><span class="cnt num">${cartCount()}</span><span class="l">View order</span><span class="r num">${qar(cartTotal())}</span></button>` : ''
}
function cartHTML() {
  const f = S.form, e = S.errors, guest = f.who === 'guest'
  return `<div class="c-head"><button class="back" data-go="menu" aria-label="Back to menu"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button><h2>Your order</h2></div>
  <div class="c-body">
    <div class="card"><div class="card-c" style="padding-top:20px">${S.cart.map((l, i) => `<div class="cl"><span class="tile">${artOf(l.id)}</span><span class="t"><b>${esc(l.name)}</b><small>${l.milk ? milkLabel(l.milk) : '&nbsp;'}</small></span>
        <span class="mini"><button data-ldec="${i}" aria-label="One less">−</button><b class="num">${l.qty}</b><button data-linc="${i}" aria-label="One more">+</button></span></div>`).join('')}
      ${guest ? `<div class="sum"><span>Total</span><span class="num"><s>${qar(cartTotal())}</s>Complimentary</span></div>`
        : `<div class="sum sum-d"><div class="row"><span>Subtotal</span><span class="num">${qar2(cartTotal())}</span></div>
           <div class="row disc"><span>Staff discount (${STAFF_DISCOUNT}%)</span><span class="num">−${qar2(round2(cartTotal() - applyDiscount(cartTotal(), STAFF_DISCOUNT)))}</span></div>
           <div class="row tot"><span>Total</span><span class="num">${qar2(applyDiscount(cartTotal(), STAFF_DISCOUNT))}</span></div></div>`}</div></div>

    <div class="card"><div class="card-h"><h3>Who's ordering?</h3><p>${guest ? "Complimentary. It goes on the department you're visiting." : 'Pay by cash or card when it arrives.'}</p></div>
      <div class="card-c">
      <div class="tg" data-at="${guest ? 0 : 1}" role="group" aria-label="I am"><span class="pill"></span>${([['guest', 'Q-Auto’s guest'], ['retail', 'Staff (retail)']] as const).map(([k, t]) => `<button data-who="${k}" aria-pressed="${f.who === k}">${t}</button>`).join('')}</div>
      <label class="field"><span>Name</span><input class="input" id="f-name" value="${esc(f.name)}" autocomplete="name" maxlength="60" placeholder="Your name">${e.name ? `<small class="error">${e.name}</small>` : ''}</label>
      ${guest ? `<label class="field"><span>Extension of the person you're visiting</span><input class="input num" id="f-ext" inputmode="numeric" maxlength="12" value="${esc(f.ext)}" placeholder="e.g. 302">
        ${e.ext ? `<small class="error">${e.ext}</small>` : "<small>Ask your host or reception if you don't know it.</small>"}</label>`
      : `<label class="field"><span>Mobile number</span><div class="prefix"><b>+974</b><input class="input num" id="f-mobile" inputmode="tel" autocomplete="tel-national" maxlength="12" value="${esc(f.mobile)}" placeholder="5555 1234"></div>
        ${e.mobile ? `<small class="error">${e.mobile}</small>` : '<small>So we can call you when it arrives.</small>'}</label>`}
      ${guest ? '' : `<div class="field reveal"><span>Pay by</span><div class="tg" data-at="${f.pay === 'card' ? 0 : 1}" role="group" aria-label="Pay by"><span class="pill"></span>${(['card', 'cash'] as const).map(m => `<button data-pay="${m}" aria-pressed="${f.pay === m}">${m === 'card' ? 'Card' : 'Cash'}</button>`).join('')}</div></div>`}
    </div></div>
    <div class="card"><div class="card-h"><h3>Bring it to</h3><p>Where should we deliver your order?</p></div><div class="card-c">
      <label class="field"><input class="input" id="f-where" value="${esc(f.where)}" maxlength="120" placeholder="e.g. Service reception, ground floor" aria-label="Where should we bring it?">${e.where ? `<small class="error">${e.where}</small>` : ''}</label>
    </div></div>
    <div class="card"><div class="card-h"><h3>Notes <small class="opt">Optional</small></h3></div><div class="card-c">
      <textarea class="input note" id="f-note" rows="2" maxlength="200" placeholder="e.g. Less sugar, extra hot" aria-label="Notes for the cafe">${esc(f.note)}</textarea>
    </div></div>
    <button class="sendbtn" id="place" ${S.sending ? 'disabled' : ''}>${S.sending ? 'Sending…' : guest ? 'Send order' : 'Send order · ' + qar2(applyDiscount(cartTotal(), STAFF_DISCOUNT))}</button>
    ${S.sendError ? `<p class="send-err" role="alert">${esc(S.sendError)}</p>` : ''}
  </div>`
}
function thanksHTML() {
  const o = mine!
  return `<div class="thanks">
    <span class="tick"><svg width="34" height="34" viewBox="0 0 34 34" aria-hidden="true"><path d="M9 17.5l5.5 5.5L25 12"/></svg></span>
    <div style="display:grid;gap:8px;justify-items:center">
      <h2 class="fade" style="animation-delay:.75s">Thank you, ${esc(firstName(o.name))}!</h2>
      <p class="fade" style="animation-delay:.9s">Your order is with the ${CAFE[o.branch]} team. We'll bring it to ${esc(o.where)}.</p>
    </div>
    <span class="badge outline fade num" style="animation-delay:1.05s">Order #${o.no}</span>
    <button class="btn fade" style="animation-delay:1.2s;position:relative" data-go="track">Track my order</button>
  </div>`
}
function trackHTML() {
  const o = mine!
  const stages: [Status, string][] = [['pending', 'Received'], ['accepted', 'Making'], ['onway', 'On its way'], ['delivered', 'Delivered']]
  const idx = stages.findIndex(s => s[0] === o.status)
  const head = {
    pending: ['Order received', 'Waiting for the cafe to confirm.'],
    accepted: ["We're making it", 'Your order is being made now.'],
    onway: ['On its way', `Heading to ${o.where}.`],
    delivered: [`Enjoy, ${firstName(o.name)}!`, 'Thank you for ordering from Q-Auto Cafe. See you next time.'],
    rejected: ["Sorry, we can't make this one", `${o.reason ?? 'The cafe could not take this order'}. Please order at the counter.`],
  }[o.status]
  const pay = o.pay === 'card' ? 'card' : 'cash'
  // Nothing is owed on an order the cafe turned down.
  const due = o.status === 'rejected' ? 'Total' : `Pay by ${pay} on delivery`
  return `<div class="trk">
    <div class="trk-h"><small>${CAFE[o.branch]} · Order #${o.no}</small><h2>${esc(head[0])}</h2><p>${esc(head[1])}</p></div>
    ${o.status === 'rejected' ? '' : `<div class="bars">${stages.map(([, t], i) => `<div class="${o.status === 'delivered' || i < idx ? 'done' : i === idx ? 'now' : ''}"><i></i><small>${t}</small></div>`).join('')}</div>`}
    <div class="card where-card"><span class="pin"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="9.5" r="2.5" fill="currentColor"/></svg></span>
      <span class="t"><small>Bringing it to</small><b>${esc(o.where)}</b></span></div>
    <div class="card"><div class="card-c" style="padding-top:20px">${o.lines.map(l => `<div class="cl"><span class="tile">${artOf(l.id)}</span><span class="t"><b>${l.qty} × ${esc(l.name)}</b><small>${l.milk ? milkLabel(l.milk) : '&nbsp;'}</small></span></div>`).join('')}
      ${o.discountPct && o.who !== 'guest' ? `<div class="sum sum-d"><div class="row"><span>Subtotal</span><span class="num">${qar2(o.subtotal)}</span></div><div class="row disc"><span>Staff discount (${o.discountPct}%)</span><span class="num">−${qar2(round2(o.subtotal - o.total))}</span></div><div class="row tot"><span>${due}</span><span class="num">${qar2(o.total)}</span></div></div>`
        : `<div class="sum"><span>${o.who === 'guest' ? 'Total' : due}</span><span class="num">${o.who === 'guest' ? 'Complimentary' : qar2(o.total)}</span></div>`}</div></div>
    <button class="btn outline lg" data-go="neworder">${o.status === 'delivered' || o.status === 'rejected' ? 'Order again' : 'Add another order'}</button>
  </div>`
}

let tracking: ReturnType<typeof setInterval> | null = null
function render(dir?: string) {
  const body = document.getElementById('pbody'); const top = body ? body.scrollTop : 0; const same = phone.dataset.view === S.view
  let h = ''
  if (S.view === 'welcome') h += welcomeHTML()
  else if (S.view === 'thanks') h += thanksHTML()
  else h += `<div class="p-body ${!same && dir ? dir : ''}" id="pbody">${S.view === 'menu' ? menuHTML() : S.view === 'cart' ? cartHTML() : trackHTML()}</div>`
  if (S.view === 'menu') h += bagHTML()
  if (S.sheet) h += sheetHTML()
  phone.innerHTML = h; phone.dataset.view = S.view
  const nb = document.getElementById('pbody')
  if (nb) { nb.style.scrollBehavior = 'auto'; nb.scrollTop = same ? top : 0; nb.style.scrollBehavior = '' }
  if (S.view === 'menu') { placeInk(); nb!.addEventListener('scroll', spy, { passive: true }) }
  S.animate = false
  // Follow the order while its page is open.
  const follow = S.view === 'track' || S.view === 'thanks'
  if (follow && !tracking) tracking = setInterval(poll, 5000)
  if (!follow && tracking) { clearInterval(tracking); tracking = null }
}
function placeInk() {
  const b = phone.querySelector<HTMLElement>(`[data-tab="${S.cat}"]`), ink = document.getElementById('ink'); if (!b || !ink) return
  ink.style.left = b.offsetLeft + 'px'; ink.style.width = b.offsetWidth + 'px'
  document.getElementById('tabs')!.scrollTo({ left: b.offsetLeft - 40, behavior: reduceMotion() ? 'auto' : 'smooth' })
}
// The tab bar gets a bottom edge once it sticks to the top.
function spy() {
  const bar = phone.querySelector('.tabs'); if (!bar) return
  bar.classList.toggle('stuck', bar.getBoundingClientRect().top - phone.getBoundingClientRect().top <= 1)
}
// A copy of the drink flies into the bag, then the bag bounces.
function fly(fromRect: DOMRect | undefined, it: Item) {
  const bag = document.getElementById('bag'); if (!bag || reduceMotion() || !fromRect) return
  const p = phone.getBoundingClientRect(), to = bag.getBoundingClientRect()
  const el = document.createElement('div'); el.className = 'flyer'; el.innerHTML = art(it)
  const x0 = fromRect.left - p.left + fromRect.width / 2 - 28, y0 = fromRect.top - p.top + fromRect.height / 2 - 28
  const x1 = to.left - p.left, y1 = to.top - p.top + to.height / 2 - 28
  el.style.left = x0 + 'px'; el.style.top = y0 + 'px'; phone.appendChild(el)
  el.animate([{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${(x1 - x0) * 0.5}px,${(y1 - y0) * 0.5 - 90}px) scale(.85)`, offset: 0.5 }, { transform: `translate(${x1 - x0}px,${y1 - y0}px) scale(.3)`, opacity: 0.6 }],
    { duration: 700, easing: 'cubic-bezier(.5,0,.75,0)' }).onfinish = () => { el.remove(); bag.classList.remove('bounce'); void bag.offsetWidth; bag.classList.add('bounce') }
}
function addToCart(id: string, milk: Milk | null, qty: number) {
  const it = findItem(id)!; const l = S.cart.find(x => x.id === id && x.milk === milk)
  if (l) l.qty = Math.min(20, l.qty + qty); else S.cart.push({ id, name: it.name, price: it.price, milk, qty })
}
function closeSheet(after?: () => void) {
  const bg = document.getElementById('sheetbg')
  if (!bg || reduceMotion()) { S.sheet = null; render(); after?.(); return }
  bg.classList.add('closing'); setTimeout(() => { S.sheet = null; render(); after?.() }, 240)
}
function readForm() {
  for (const k of ['name', 'ext', 'mobile', 'where', 'note'] as const) { const el = document.getElementById('f-' + k) as HTMLInputElement | HTMLTextAreaElement | null; if (el) S.form[k] = el.value }
}

phone.addEventListener('click', e => {
  const t = (e.target as HTMLElement).closest<HTMLElement>('button,[data-closesheet]'); if (!t) return
  if (S.view === 'cart') readForm()
  const d = t.dataset
  if (d.branch) {
    S.branch = d.branch as Branch; lastBranch = S.branch; S.view = 'menu'; S.animate = true; S.cat = 0
    const w = document.getElementById('welcome')!
    // Draw the menu underneath, then lift the welcome away.
    phone.insertAdjacentHTML('afterbegin', `<div class="p-body" id="pbody">${menuHTML()}</div>`)
    phone.dataset.view = 'menu'; S.animate = false; placeInk(); document.getElementById('pbody')!.addEventListener('scroll', spy, { passive: true })
    if (S.cart.length) phone.insertAdjacentHTML('beforeend', bagHTML())
    w.classList.add('leave'); setTimeout(() => w.remove(), reduceMotion() ? 0 : 450)
    return
  }
  if (d.closesheet !== undefined) { if (e.target === t) closeSheet(); return }
  if (d.open) { const it = findItem(d.open)!; S.sheet = { id: it.id, milk: it.milk ? 'fresh' : null, qty: 1 }; render(); return }
  if (d.milk) { S.sheet!.milk = d.milk as Milk; phone.querySelectorAll<HTMLElement>('[data-milk]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.milk === d.milk))); return }
  if (d.sq) {
    S.sheet!.qty = Math.max(1, Math.min(20, S.sheet!.qty + Number(d.sq))); const it = findItem(S.sheet!.id)!
    const q = document.getElementById('sq')!, p = document.getElementById('sp')!
    q.textContent = String(S.sheet!.qty); p.textContent = qar(it.price * S.sheet!.qty); [q, p].forEach(x => { x.classList.remove('roll'); void x.offsetWidth; x.classList.add('roll') })
    return
  }
  if (t.id === 'addbtn') {
    const it = findItem(S.sheet!.id)!, from = phone.querySelector('.hero-t svg')?.getBoundingClientRect()
    addToCart(it.id, S.sheet!.milk, S.sheet!.qty); closeSheet(() => fly(from, it)); return
  }
  if (d.tab !== undefined) {
    if (Number(d.tab) === S.cat) return
    S.cat = Number(d.tab); placeInk(); phone.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-current', String(b === t)))
    document.getElementById('list')!.innerHTML = sectionHTML(S.cat, true)
    // If the list was scrolled, bring its top back up under the tab bar.
    const body = document.getElementById('pbody')!, bar = phone.querySelector<HTMLElement>('.tabs')!
    if (body.scrollTop > bar.offsetTop) { body.style.scrollBehavior = 'auto'; body.scrollTop = bar.offsetTop; body.style.scrollBehavior = '' }
    return
  }
  if (d.go === 'neworder') { const form = S.form; fresh(); S.form = { ...form, ext: '', note: '', where: form.where }; S.view = 'menu'; S.branch = lastBranch; S.animate = true; render('view-back'); return }
  if (d.go === 'menu') { S.view = 'menu'; S.errors = {}; S.sendError = ''; render('view-back'); return }
  if (d.go === 'welcome') { S.view = 'welcome'; render(); return }
  if (d.go) { S.view = d.go as State['view']; S.errors = {}; render('view-in'); return }
  if (d.linc) { const l = S.cart[Number(d.linc)]; l.qty = Math.min(20, l.qty + 1) }
  else if (d.ldec) { const i = Number(d.ldec), l = S.cart[i]; l.qty--; if (!l.qty) S.cart.splice(i, 1); if (!S.cart.length) { S.view = 'menu'; render('view-back'); return } }
  else if (d.who) { S.form.who = d.who as Who; S.errors = {}; S.sendError = '' }
  else if (d.pay) { S.form.pay = d.pay as Pay }
  else if (t.id === 'place') { void place(); return }
  else return
  render()
})

async function place() {
  const f = S.form, e: State['errors'] = {}
  const guest = f.who === 'guest'
  if (!f.name.trim()) e.name = "Add your name so we know who it's for."
  if (guest && !digits(f.ext)) e.ext = "Add the extension of the person you're visiting."
  if (!guest && digits(f.mobile).length !== 8) e.mobile = 'Add your 8-digit mobile number.'
  if (!f.where.trim()) e.where = 'Tell us where to bring it.'
  S.errors = e; S.sendError = ''
  if (Object.keys(e).length) { render(); document.getElementById('place')?.classList.add('shake'); return }
  S.sending = true; render()
  try {
    const r = await rpc<{ id: string; token: string; no: number; subtotal: number; discountPct: number; total: number }>('place_online_order', { o: {
      branch: S.branch, who: f.who, name: f.name.trim(), deliverTo: f.where.trim(), ...(f.note.trim() && { note: f.note.trim() }),
      ...(guest ? { ext: digits(f.ext) } : { mobile: digits(f.mobile), pay: f.pay }),
      lines: S.cart.map(l => ({ itemId: l.id, qty: l.qty, ...(l.milk && { milk: l.milk }) })),
    } })
    mine = { id: r.id, token: r.token, no: r.no, branch: S.branch!, who: f.who, pay: f.pay, name: f.name.trim(), where: f.where.trim(),
      lines: S.cart.map(l => ({ ...l })), subtotal: Number(r.subtotal), discountPct: Number(r.discountPct), total: Number(r.total), status: 'pending', at: Date.now() }
    S.cart = []; S.sending = false; S.view = 'thanks'; save(); render()
    const id = mine.id
    setTimeout(() => { if (S.view === 'thanks' && mine?.id === id) { S.view = 'track'; render('view-in') } }, 5200)
  } catch (err) {
    S.sending = false; S.sendError = (err as Error).message; render()
  }
}

async function poll() {
  if (!mine || mine.status === 'delivered' || mine.status === 'rejected') return
  try {
    const s = await rpc<{ status: Status; discountPct: number; subtotal: number; total: number; reason?: string } | null>('online_order_status', { p_id: mine.id, p_token: mine.token })
    if (!s) return
    const changed = s.status !== mine.status || Number(s.total) !== mine.total
    Object.assign(mine, { status: s.status, discountPct: Number(s.discountPct), subtotal: Number(s.subtotal), total: Number(s.total), reason: s.reason })
    save()
    if (changed && S.view === 'track') render()
  } catch { /* offline for a moment; the next check catches up */ }
}

/* ---------- Start ---------- */
restore()
phone.innerHTML = '<div class="state-msg"><p>Loading the menu…</p></div>'
loadMenu().then(() => {
  if (mine) { S.branch = mine.branch; S.view = 'track'; void poll() }
  render()
}).catch(() => {
  phone.innerHTML = `<div class="state-msg"><h2>We can't reach the cafe right now</h2><p>Check your connection and try again, or order at the counter.</p><button class="btn" onclick="location.reload()">Try again</button></div>`
})
