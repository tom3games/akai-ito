// 運命の赤い糸をたどれ: 本体（2.5D の斜め見下ろし・canvas）
window.__jsUp = true
;(() => {
'use strict'
const D = window.AKAI
const $ = s => document.querySelector(s)
const LS = {
  get(k, d) { try { const v = localStorage.getItem('akai_' + k); return v == null ? d : JSON.parse(v) } catch (e) { return d } },
  set(k, v) { try { localStorage.setItem('akai_' + k, JSON.stringify(v)) } catch (e) {} },
}
let lang = LS.get('lang', /^ja/.test(navigator.language || 'ja') ? 'ja' : 'en')
const U = () => D.T[lang]
const coarse = matchMedia('(pointer:coarse)').matches
const clamp = (v, a, b) => v < a ? a : v > b ? b : v
const lerp = (a, b, t) => a + (b - a) * t
const TAU = Math.PI * 2

// ---- 色（紙と藍の版画。彩度のある色は自分の糸の赤だけ）
const C = { paper: '#efe5cf', paper2: '#e4d8bd', ink: '#232c57', ink2: '#46507a', mid: '#9097b3', pale: '#cfc6af', red: '#d3202e', redD: '#8f1420', fade: '#e6a59b', fadeD: '#c4877e', white: '#fbf6ea' }
const STRAND = ['#b8324a', '#c9542e', '#a8285f', '#cf6a3f']
const FLOOR = ['#e2dccb', '#ebdfc4', '#e9d9c6', '#efe7d6', '#dfe1cc']

// ---- 遊びの数値
const BH = 2400, NB = 5
const VMAX = 250, KPULL = 3.0, TOL = 42, LEADWIN = 300
const SAFE = 110, SNAGRATE = 3.4, KNOTRATE = 0.6
const P_SNAP = 12, P_WRONG = 6, P_DECOY = 15
const FAST = 100   // 逆からたどってきた人に会える到着の速さ（秒）

// ---- 乱数
function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

// ---- 糸（折れ線）の道具
function mkPath(pts) { let s = 0; pts[0].s = 0; for (let i = 1; i < pts.length; i++) { s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); pts[i].s = s } return { pts, len: s } }
function catmull(cps, step = 4) {
  const out = []
  for (let i = 0; i < cps.length - 1; i++) {
    const p0 = cps[Math.max(0, i - 1)], p1 = cps[i], p2 = cps[i + 1], p3 = cps[Math.min(cps.length - 1, i + 2)]
    const n = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / step))
    for (let j = 0; j < n; j++) {
      const t = j / n, t2 = t * t, t3 = t2 * t
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3)
      out.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) })
    }
  }
  const l = cps[cps.length - 1]; out.push({ x: l.x, y: l.y }); return out
}
function idxAtS(P, s) { const a = P.pts; let lo = 0, hi = a.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (a[m].s <= s) lo = m; else hi = m - 1 } return lo }
function idxAtY(P, y) { const a = P.pts; let lo = 0, hi = a.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m].y > y) lo = m + 1; else hi = m } return lo }
function at(P, s) {
  s = clamp(s, 0, P.len); const a = P.pts, i = Math.min(idxAtS(P, s), a.length - 2), p = a[i], q = a[i + 1]
  const L = q.s - p.s || 1, t = (s - p.s) / L
  return { x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t), tx: (q.x - p.x) / L, ty: (q.y - p.y) / L }
}
function nearest(P, s0, s1, x, y) {
  const a = P.pts, i0 = idxAtS(P, Math.max(0, s0)), i1 = Math.min(a.length - 1, idxAtS(P, s1) + 1)
  let best = 1e9, bs = 0
  for (let i = i0; i < i1; i++) {
    const p = a[i], q = a[i + 1], dx = q.x - p.x, dy = q.y - p.y, L2 = dx * dx + dy * dy || 1
    const t = clamp(((x - p.x) * dx + (y - p.y) * dy) / L2, 0, 1), ex = p.x + dx * t - x, ey = p.y + dy * t - y, d = ex * ex + ey * ey
    if (d < best) { best = d; bs = p.s + (q.s - p.s) * t }
  }
  return { d: Math.sqrt(best), s: clamp(bs, s0, s1) }
}

// ---- 世界をつくる（毎回くじで変わる）
const PLAN = [
  ['snag', 'knot2', 'snag', 'fork2'],
  ['knot2', 'snag', 'fork2', 'snag'],
  ['knot2', 'knot3', 'fork3', 'knot3'],
  ['snag', 'knot3', 'fork3', 'snag', 'knot2'],
  ['snag', 'fork3', 'knot3', 'snag'],
]
const SNAGTYPE = ['strap', 'umbrella', 'mug', 'ribbon', 'reed']
function gen(seed) {
  const R = mulberry(seed), rnd = (a, b) => a + R() * (b - a), pick = a => a[Math.floor(R() * a.length)]
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
  const END = -(NB * BH) - 330
  const cps = [{ x: 180, y: 70 }, { x: 180, y: -30 }, { x: 186, y: -150 }]
  let x = 186, y = -150
  while (y > END + 380) {
    y -= rnd(150, 210)
    const dx = rnd(70, 165) * (R() < 0.5 ? -1 : 1)
    let nx = x + dx; if (nx < 70 || nx > 290) nx = x - dx
    x = clamp(nx, 70, 290); cps.push({ x, y })
  }
  cps.push({ x: 180, y: END + 170 }, { x: 180, y: END })
  const pts = catmull(cps)
  for (let i = 1; i < pts.length; i++) pts[i].y = Math.min(pts[i].y, pts[i - 1].y - 0.05)
  const main = mkPath(pts)
  const sAtY = yy => main.pts[idxAtY(main, yy)].s
  const W = { seed, main, END, end: at(main, main.len), knots: [], forks: [], snags: [], people: [], props: [], traps: [], gags: [] }

  // 道すじに置く物
  for (let b = 0; b < NB; b++) {
    const plan = b === 0 ? PLAN[0].slice() : shuffle(PLAN[b].slice())
    const a = b === 0 ? 330 : sAtY(-b * BH) + 150, z = sAtY(-(b + 1) * BH) - (b === NB - 1 ? 380 : 170)
    const n = plan.length, step = (z - a) / n
    plan.forEach((kind, k) => {
      const s = a + step * (k + 0.5) + rnd(-step * 0.12, step * 0.12)
      const p = at(main, s), ta = Math.atan2(p.ty, p.tx)
      if (kind === 'snag') W.snags.push({ s0: s - 45, s1: s + 45, type: SNAGTYPE[b], x: p.x, y: p.y, ang: ta, hot: 0, band: b })
      else if (kind.startsWith('knot')) {
        const cnt = +kind[4], angs = [], base = ((ta % Math.PI) + Math.PI) % Math.PI
        const cands = shuffle([0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165].map(d => d * Math.PI / 180))
        const diff = (u, v) => { let d = Math.abs(u - v) % Math.PI; return Math.min(d, Math.PI - d) }
        for (const c of cands) { if (angs.length >= cnt) break; if (diff(c, base) < 0.62) continue; if (angs.every(o => diff(o, c) > 0.8)) angs.push(c) }
        const strands = angs.map((ang, i) => ({ ang, col: STRAND[(i + b) % STRAND.length], gone: 0, fly: null }))
        W.knots.push({ s, x: p.x, y: p.y, strands, order: shuffle(strands.map((_, i) => i)), loose: 0, spread: 0, done: false, shake: 0, band: b })
      } else {
        const nb = +kind[4], F = at(main, s), my = at(main, sAtY(F.y - 200)).x
        let cands = [F.x - 150, F.x + 150, F.x - 80, F.x + 80, my - 150, my + 150].map(c => clamp(c, 34, 326))
        const chosen = []
        for (const th of [110, 92, 75]) {
          for (const c of shuffle(cands.slice())) { if (chosen.length >= nb - 1) break; if (Math.abs(c - my) >= th && chosen.every(o => Math.abs(o - c) >= th)) chosen.push(c) }
          if (chosen.length >= nb - 1) break
        }
        const types = shuffle(['ex', 'cat', 'sales']).slice(0, chosen.length)
        const branches = chosen.map((tx, i) => {
          const len = rnd(225, 255)
          const bc = [{ x: F.x, y: F.y }, { x: F.x + F.tx * 24, y: F.y + F.ty * 24 }, { x: lerp(F.x, tx, 0.55), y: F.y - 105 }, { x: tx, y: F.y - len * 0.78 }, { x: tx + rnd(-16, 16), y: F.y - len }]
          const P = mkPath(catmull(bc)), e = at(P, P.len)
          W.traps.push({ type: types[i], x: e.x, y: e.y, fork: W.forks.length, b: i })
          return { P, type: types[i], cut: 0 }
        })
        W.forks.push({ s, x: F.x, y: F.y, branches, passed: false, band: b })
      }
    })
  }

  // 当たらない場所に人と物を置く
  const paths = () => [main].concat(...W.forks.map(f => f.branches.map(b => b.P)))
  const clearOf = (x, y, hw, top, bot, pad) => {
    for (const P of paths()) {
      const i0 = idxAtY(P, y + bot + pad), i1 = idxAtY(P, y - top - pad)
      for (let i = Math.max(0, i0 - 1); i <= Math.min(P.pts.length - 1, i1 + 1); i++) { const p = P.pts[i]; if (Math.abs(p.x - x) < hw + pad && p.y > y - top - pad && p.y < y + bot + pad) return false }
    }
    for (const k of W.knots) if (Math.hypot(k.x - x, k.y - y + top / 2) < 100) return false
    for (const t of W.traps) if (Math.abs(t.x - x) < 40 && Math.abs(t.y - y) < 60) return false
    for (const o of W.people.concat(W.props)) if (Math.abs(o.x - x) < hw + o.hw - 4 && Math.abs(o.y - y) < 16) return false
    for (let g = 1; g < NB; g++) if (Math.abs(y + g * BH) < 40) return false
    return true
  }
  const KINDS = [
    ['suit', 'suit', 'suit', 'phone', 'bag', 'long', 'student', 'cap'],
    ['shop', 'shop', 'granny', 'bag', 'kid', 'umbrella', 'long', 'cap'],
    ['party', 'party', 'party', 'long', 'suit'],
    ['dress', 'dress', 'formal', 'formal', 'formal', 'granny'],
    ['jog', 'dog', 'long', 'kid', 'cap', 'fish'],
  ]
  for (let b = 0; b < NB; b++) {
    const y0 = -b * BH, y1 = -(b + 1) * BH
    // 場所の物（障害物）
    if (b === 2) for (let i = 0; i < 9; i++) { for (let t = 0; t < 60; t++) { const x = rnd(40, 320), y = rnd(y1 + 80, y0 - 40); if (clearOf(x, y, 46, 30, 26, 12)) { W.props.push({ kind: 'table', x, y, hw: 46, r: R() }); break } } }
    if (b === 3) for (let i = 0; i < 30; i++) { for (let t = 0; t < 40; t++) { const x = rnd(30, 330), y = rnd(y1 + 60, y0 - 40); if (clearOf(x, y, 12, 30, 6, 10)) { W.props.push({ kind: 'chair', x, y, hw: 12 }); break } } }
    if (b === 3) for (let i = 0; i < 4; i++) { for (let t = 0; t < 40; t++) { const x = rnd(30, 330), y = rnd(y1 + 60, y0 - 40); if (clearOf(x, y, 16, 70, 6, 12)) { W.props.push({ kind: 'flowers', x, y, hw: 16 }); break } } }
    if (b === 1) for (let i = 0; i < 4; i++) { for (let t = 0; t < 40; t++) { const x = rnd(60, 300), y = rnd(y1 + 60, y0 - 40); if (clearOf(x, y, 14, 60, 6, 12)) { W.props.push({ kind: 'cart', x, y, hw: 14 }); break } } }
    if (b === 4) for (let i = 0; i < 16; i++) { for (let t = 0; t < 40; t++) { const x = rnd(20, 300), y = rnd(y1 + 40, y0 - 30); if (clearOf(x, y, 10, 40, 4, 8)) { W.props.push({ kind: 'reeds', x, y, hw: 10, r: R() }); break } } }
    const want = [36, 30, 22, 22, 15][b]
    for (let i = 0; i < want; i++) {
      for (let t = 0; t < 80; t++) {
        const x = rnd(40, 320), y = rnd(y1 + 50, y0 - 30)
        if (b === 4 && x > 296) continue
        if (!clearOf(x, y, 15, 76, 5, 14)) continue
        const kind = pick(KINDS[b])
        W.people.push({ x, y, hw: 15, kind, h: rnd(0.9, 1.08) * (kind === 'kid' ? 0.7 : 1), w: rnd(0.9, 1.12), hair: Math.floor(R() * 6), tone: R() < 0.22 ? C.ink2 : C.ink, flip: R() < 0.5 ? -1 : 1, ph: R() * TAU })
        break
      }
    }
  }
  // 遊び心: たまに出る人（毎回1〜2人）
  const gagPool = ['many', 'ramen', 'groom', 'kappa', 'twin']
  shuffle(gagPool).slice(0, 2).forEach(g => W.gags.push(g))
  if (W.gags.includes('groom')) { const y = -3 * BH - BH * 0.5; for (let t = 0; t < 60; t++) { const x = rnd(40, 320), yy = y + rnd(-500, 500); if (clearOf(x, yy, 30, 76, 5, 12)) { W.props.push({ kind: 'couple', x, y: yy, hw: 30 }); break } } }
  if (W.gags.includes('kappa')) { W.props.push({ kind: 'kappa', x: 330, y: -4 * BH - rnd(300, 1200), hw: 10 }) }
  if (W.gags.includes('many')) { const ps = W.people.filter(p => p.y > -BH); if (ps.length) ps[Math.floor(R() * ps.length)].many = 1 }
  if (W.gags.includes('ramen')) { const ps = W.people.filter(p => p.y < -BH && p.y > -2 * BH); if (ps.length) ps[Math.floor(R() * ps.length)].ramen = 1 }
  if (W.gags.includes('twin')) { const ps = W.people.filter(p => p.y < -2 * BH && p.y > -3 * BH); if (ps.length) ps[Math.floor(R() * ps.length)].twin = 1 }
  // 場所の飾り（決まった並び）
  W.shops = []
  for (let y = -BH - 60; y > -2 * BH + 60; y -= 118) { W.shops.push({ y, side: 0, ch: pick('肉魚茶本花傘酒服薬米'), stripe: R() < 0.5 }); W.shops.push({ y: y - 59, side: 1, ch: pick('肉魚茶本花傘酒服薬米'), stripe: R() < 0.5 }) }
  return W
}

// ---- 画面
const cv = $('#cv'), cx = cv.getContext('2d')
let VW = 360, VH = 640, DPR = 1, SC = 1, HW = 640, OX = 0
function resize() {
  VW = innerWidth; VH = innerHeight; DPR = Math.min(2, devicePixelRatio || 1)
  SC = Math.min(VW / 360, VH / 560); OX = (VW - 360 * SC) / 2; HW = VH / SC
  cv.width = Math.round(VW * DPR); cv.height = Math.round(VH * DPR)
}
addEventListener('resize', resize); resize()
// 紙のざらつき（1回だけ作る）
const grain = (() => { const g = document.createElement('canvas'); g.width = g.height = 160; const q = g.getContext('2d'), R = mulberry(7); for (let i = 0; i < 1400; i++) { q.fillStyle = R() < 0.5 ? 'rgba(35,44,87,.07)' : 'rgba(255,255,255,.12)'; q.fillRect(R() * 160, R() * 160, 1 + R() * 1.6, 1 + R() * 1.6) } return g })()
let grainPat = null

// ---- 状態
let G = null, mode = 'load', demo = null
const TUT = () => !LS.get('tut', 0)
function newGame(seed) {
  const W = gen(seed)
  G = {
    W, seed, head: { s: 60, br: null }, cam: 0, time: 0, clean: 100, snaps: 0, wrong: 0, decoys: { ex: 0, cat: 0, sales: 0 }, last: null,
    tension: 0, stun: 0, blocked: null, band: -1, bubbles: [], frays: [], fx: [], trap: null, reel: null, reveal: null,
    finger: { down: false, sx: 0, sy: 0 }, gesture: null, lostT: 0, lead: 0, v: 0, cloth: 0, creakT: 0, tut: TUT(), tutStep: {}, hint: '', ended: false, shake: 0, sum: { dist: 0 },
  }
  const h = headPos(); G.cam = h.y - HW * 0.72
  return G
}
function curPath() { return G.head.br ? G.W.forks[G.head.br.f].branches[G.head.br.b].P : G.W.main }
function headPos() { return at(curPath(), G.head.s) }
const cleanPct = () => Math.max(0, Math.round(G.clean))
const toWorld = (sx, sy) => ({ x: (sx - OX) / SC, y: sy / SC + G.cam })
const toScreen = (x, y) => ({ x: x * SC + OX, y: (y - G.cam) * SC })

// ---- 音
Snd.def({
  cloth: ['snd/cloth1.mp3', 'snd/cloth2.mp3', 'snd/cloth3.mp3'], creak: ['snd/creak1.mp3', 'snd/creak2.mp3', 'snd/creak3.mp3'],
  swish: ['snd/swish1.mp3', 'snd/swish2.mp3', 'snd/swish3.mp3'], snap: 'snd/snap.mp3', pluck: ['snd/pluck1.mp3', 'snd/pluck2.mp3'],
  mew: ['snd/mew1.mp3', 'snd/mew2.mp3'], dopen: 'snd/door_open.mp3', dclose: 'snd/door_close.mp3', coin: 'snd/coin.mp3', bell: 'snd/bell.mp3',
  click: 'snd/click.mp3', good: 'snd/jing_good.mp3', mid: 'snd/jing_mid.mp3', bad: 'snd/jing_bad.mp3', drum: 'snd/drumroll.mp3',
  applause: 'snd/applause.mp3', giggle: 'snd/laugh_small.mp3', grunt: ['snd/grunt1.mp3', 'snd/grunt2.mp3'], depart: 'snd/depart.mp3',
})
const AMB = [['snd/crowd.mp3', 0.22], ['snd/street.mp3', 0.3], ['snd/crowd.mp3', 0.32], ['snd/crowd.mp3', 0.12], ['snd/river.mp3', 0.2]]
const AMB2 = [null, ['snd/crowd.mp3', 0.08], null, null, ['snd/crickets.mp3', 0.16]]
let muted = LS.get('mute', false)
Snd.setMute(muted)
const sfx = (n, o) => Snd.play(n, o)

// ---- 入力（本物のポインターも bot も同じ関数を通る）
const IN = {
  down(sx, sy) {
    if (!G || mode !== 'play') return
    const f = G.finger; f.down = true; f.sx = sx; f.sy = sy
    const w = toWorld(sx, sy), k = G.blocked
    if (k && !k.done) {
      const d = Math.hypot(w.x - k.x, w.y - k.y)
      if (d < (k.loose ? 125 : 56)) G.gesture = { k, x0: sx, y0: sy, t0: G.time, done: false }
    }
    if (G.reveal && G.reveal.t > 3.0) toResult()
  },
  move(sx, sy) {
    if (!G) return
    const f = G.finger; f.sx = sx; f.sy = sy
    const g = G.gesture
    if (g && !g.done && g.k.loose) { const dx = sx - g.x0, dy = sy - g.y0; if (Math.hypot(dx, dy) > 46 * SC) { g.done = true; swipe(g.k, dx, dy) } }
  },
  up(sx, sy) {
    if (!G) return
    const f = G.finger; f.down = false
    const g = G.gesture; G.gesture = null
    if (!g || g.done) return
    const dx = sx - g.x0, dy = sy - g.y0, m = Math.hypot(dx, dy)
    if (!g.k.loose && m < 18 * SC) loosen(g.k)
    else if (g.k.loose && m > 26 * SC) swipe(g.k, dx, dy)
  },
}
const play = $('#vPlay')
play.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; try { play.setPointerCapture(e.pointerId) } catch (er) {} e.preventDefault(); IN.down(e.clientX, e.clientY) })
play.addEventListener('pointermove', e => { if (!G || (e.target.closest && e.target.closest('button') && !G.finger.down)) return; IN.move(e.clientX, e.clientY) })
play.addEventListener('pointerup', e => IN.up(e.clientX, e.clientY))
play.addEventListener('pointercancel', e => IN.up(e.clientX, e.clientY))
play.addEventListener('touchstart', e => { if (!e.target.closest('button')) e.preventDefault() }, { passive: false })

function loosen(k) { k.loose = 1; sfx('cloth', { vol: 0.8 }); setTut('knot2') }
function swipe(k, dx, dy) {
  const a = ((Math.atan2(dy, dx) % Math.PI) + Math.PI) % Math.PI
  const diff = (u, v) => { let d = Math.abs(u - v) % Math.PI; return Math.min(d, Math.PI - d) }
  const left = k.order.filter(i => !k.strands[i].gone)
  let best = -1, bd = 9
  for (const i of left) { const d = diff(k.strands[i].ang, a); if (d < bd) { bd = d; best = i } }
  if (best < 0 || bd > 0.56) return
  const st = k.strands[best]
  if (best === left[0]) {
    st.gone = 1; st.fly = { t: 0, dx: Math.cos(Math.atan2(dy, dx)), dy: Math.sin(Math.atan2(dy, dx)) }
    sfx('swish', { vol: 0.9 })
    const ox = Math.cos(st.ang) * 70 * (dx * Math.cos(st.ang) + dy * Math.sin(st.ang) > 0 ? 1 : -1), oy = Math.sin(st.ang) * 70 * (dx * Math.cos(st.ang) + dy * Math.sin(st.ang) > 0 ? 1 : -1)
    if (left.length === 1) { k.done = true; G.blocked = null; sfx('pluck', { vol: 0.9 }); setTut(null, 'knot2'); bubble(k.x + ox * 0.6, k.y + oy * 0.6 - 18, pickLine(U().knotOk)) }
    else if (Math.random() < 0.5) bubble(k.x + ox * 0.6, k.y + oy * 0.6 - 18, pickLine(U().knotOk))
  } else {
    G.wrong++; G.clean -= P_WRONG; G.tension = Math.min(0.95, G.tension + 0.25); k.shake = 0.45
    sfx('creak', { vol: 0.9 }); sfx('grunt', { vol: 0.5, delay: 0.05 })
    bubble(k.x, k.y - 40, pickLine(U().knotNg))
  }
}
let lastLine = ''
function pickLine(a) { let s; do { s = a[Math.floor(Math.random() * a.length)] } while (a.length > 1 && s === lastLine); lastLine = s; return s }
function bubble(x, y, text, dur) { G.bubbles = G.bubbles.filter(b => b.t < b.dur - 0.2).slice(-1); G.bubbles.push({ x, y, text, t: 0, dur: dur || 0.9 + text.length * 0.09 + 0.4 }) }

// ---- 1コマ進める（固定 60Hz）
const DT = 1 / 60
function project() {
  const f = G.finger, w = toWorld(f.sx, f.sy), h = G.head
  if (h.br) { const P = curPath(), r = nearest(P, h.s, h.s + LEADWIN, w.x, w.y); return r.d < TOL ? { lead: r.s - h.s, br: h.br, d: r.d } : null }
  const M = G.W.main, r = nearest(M, h.s, h.s + LEADWIN, w.x, w.y)
  let best = r.d < TOL ? { lead: r.s - h.s, br: null, d: r.d } : null
  G.W.forks.forEach((fk, fi) => {
    if (fk.passed || fk.s < h.s - 2 || fk.s > h.s + LEADWIN) return
    fk.branches.forEach((b, bi) => {
      if (b.cut) return
      const rr = nearest(b.P, 0, h.s + LEADWIN - fk.s, w.x, w.y)
      if (rr.d < TOL && (!best || rr.d < best.d - 2)) best = { lead: fk.s - h.s + rr.s, br: { f: fi, b: bi }, d: rr.d }
    })
  })
  return best
}
function step() {
  if (mode !== 'play' || !G) return
  G.time += DT
  const W = G.W, h = G.head
  for (const b of G.bubbles) b.t += DT
  G.bubbles = G.bubbles.filter(b => b.t < b.dur)
  for (const fx of G.fx) fx.t += DT
  G.fx = G.fx.filter(f => f.t < f.dur)
  for (const k of W.knots) { if (k.loose && k.spread < 1) k.spread = Math.min(1, k.spread + DT * 4); k.shake = Math.max(0, k.shake - DT); for (const s of k.strands) if (s.fly) s.fly.t += DT }
  for (const fk of W.forks) for (const b of fk.branches) if (b.cut) b.cut = Math.min(1, b.cut + DT * 1.5)
  G.shake = Math.max(0, G.shake - DT)
  if (G.reveal) { stepReveal(); return }
  if (G.time >= D.LIMIT_SEC) { startReveal(true); return }
  updHUD()
  // 寄り道のワナの小芝居
  if (G.trap) { stepTrap(); camFollow(); return }
  if (G.reel) { G.reel.t += DT; const P = curPath(); G.head.s = lerp(G.reel.s0, 0, Math.min(1, G.reel.t / 0.5)); if (G.reel.t >= 0.5) { const fk = W.forks[h.br.f]; fk.branches[h.br.b].cut = 0.01; h.br = null; h.s = fk.s - 24; G.reel = null } camFollow(); return }

  let v = 0, rising = false, pr = null
  G.stun = Math.max(0, G.stun - DT)
  if (G.finger.down && !G.gesture && G.stun <= 0) {
    pr = project()
    if (pr) { G.lostT = 0; v = pr.lead > 6 ? Math.min(VMAX, pr.lead * KPULL) : 0 } else G.lostT += DT
  } else G.lostT = 0
  G.lead = pr ? pr.lead : 0
  let ds = v * DT
  if (!h.br) {
    // 結び目で止まる。引き続けると締まる
    const k = W.knots.find(k => !k.done && k.s > h.s - 1)
    if (k && h.s + ds >= k.s - 4) {
      ds = Math.max(0, k.s - 4 - h.s); G.blocked = k; setTut('knot')
      if (pr && pr.lead > (k.s - h.s) + 34) { G.tension += KNOTRATE * DT * clamp(pr.lead / 110, 0.6, 2.2); rising = true; k.shake = Math.max(k.shake, 0.1) }
    }
    const fk = W.forks.find(f => !f.passed && f.s > h.s - 1 && f.s <= h.s + ds)
    if (fk) {
      if (pr && pr.br && W.forks[pr.br.f] === fk) { h.br = pr.br; h.s = h.s + ds - fk.s; ds = 0; setTut(null, 'fork') }
      else { fk.passed = true; setTut(null, 'fork') }
    }
    if (!h.br) h.s = Math.min(W.main.len, h.s + ds)
    for (const sn of W.snags) {
      if (!sn.used && h.s >= sn.s0 && h.s <= sn.s1 && v > SAFE) { G.tension += (v - SAFE) / SAFE * SNAGRATE * DT; rising = true; sn.hot = 0.25 }
      sn.hot = Math.max(0, sn.hot - DT)
    }
    // チュートリアルの合図
    if (G.tut) {
      if (h.s > 180) setTut(null, 'drag')
      const sn = W.snags[0]; if (sn && h.s > sn.s0 - 170 && h.s < sn.s1) setTut('snag'); else if (sn && h.s >= sn.s1) setTut(null, 'snag')
      const f0 = W.forks[0]; if (f0 && !f0.passed && h.s > f0.s - 260) setTut('fork')
    }
    if (h.s >= W.main.len - 14) { startReveal(false); return }
  } else {
    h.s += ds
    const P = curPath(); if (h.s >= P.len - 14) { h.s = Math.min(h.s, P.len - 1); startTrap() }
  }
  G.v = v
  if (!rising) G.tension = Math.max(0, G.tension - 1.2 * DT)
  if (G.tension > 0.45) { G.creakT -= DT; if (G.creakT <= 0) { sfx('creak', { vol: 0.5 + G.tension * 0.4 }); G.creakT = 0.38 } }
  if (G.tension >= 1) nearSnap()
  G.cloth += ds; G.sum.dist += ds
  if (G.cloth > 70) { G.cloth = 0; sfx('cloth', { vol: 0.28 }) }
  if (G.lostT > 0.7) setTut('lost'); else if (G.hint === 'lost') setTut(null, 'lost')
  // 場面の切り替え
  const band = clamp(Math.floor(-headPos().y / BH), 0, NB - 1)
  if (band !== G.band) enterBand(band)
  camFollow()
}
function camFollow() {
  const p = headPos(), tgt = p.y - HW * 0.7
  G.cam += (tgt - G.cam) * Math.min(1, DT * 5)
}
function nearSnap() {
  const p = headPos()
  G.snaps++; G.clean -= P_SNAP; G.tension = 0.3; G.stun = 0.7; G.shake = 0.35
  G.frays.push({ x: p.x, y: p.y, r: Math.random() })
  // 一度ぷつっとしかけた引っかかりは外れる（同じ所で止まり続けない）
  for (const sn of G.W.snags) if (!G.head.br && G.head.s >= sn.s0 - 60 && G.head.s <= sn.s1 + 10) sn.used = 1
  if (!G.head.br) G.head.s = Math.max(40, G.head.s - 46)
  sfx('snap', { vol: 1 }); sfx('creak', { vol: 0.8 })
  bubble(p.x, p.y - 26, U().snapNear, 1.4)
  for (let i = 0; i < 10; i++) G.fx.push({ kind: 'fiber', x: p.x, y: p.y, a: Math.random() * TAU, sp: 40 + Math.random() * 80, t: 0, dur: 0.6 })
}
function startTrap() {
  const br = G.head.br, tr = G.W.traps.find(t => t.fork === br.f && t.b === br.b)
  G.trap = { tr, t: 0 }
  const L = U().trap[tr.type]
  if (tr.type === 'ex') { sfx('giggle', { vol: 0.5 }); bubble(tr.x, tr.y - 86, pickLine(L), 1.7) }
  if (tr.type === 'cat') { sfx('mew', { vol: 0.9 }); bubble(tr.x, tr.y - 50, pickLine(L), 1.7) }
  if (tr.type === 'sales') { sfx('dopen', { vol: 0.8 }); bubble(tr.x, tr.y - 90, pickLine(L), 1.7); sfx('coin', { vol: 0.6, delay: 0.7 }) }
}
function stepTrap() {
  const T = G.trap; T.t += DT
  if (T.t >= 1.8) {
    const tp = T.tr.type
    G.decoys[tp]++; G.last = tp; G.clean -= P_DECOY
    if (tp === 'sales') sfx('dclose', { vol: 0.7 })
    sfx('swish', { vol: 0.6 })
    G.trap = null; G.reel = { t: 0, s0: G.head.s }
  }
}
function enterBand(b) {
  G.band = b
  const [no, name, gag] = U().stages[b]
  $('#cNo').textContent = no; $('#cName').textContent = name; $('#cGag').textContent = gag
  const c = $('#card'); c.classList.remove('show'); void c.offsetWidth; c.classList.add('show')
  G.cardT = G.time
  Snd.loop('amb', AMB[b][0], AMB[b][1]); Snd.loop('amb2', AMB2[b] ? AMB2[b][0] : null, AMB2[b] ? AMB2[b][1] : 0)
  if (b === 0) sfx('depart', { vol: 0.35, jitter: 0 })
  if (b === 3) sfx('applause', { vol: 0.35, jitter: 0 })
  if (b === 2) sfx('giggle', { vol: 0.4 })
  if (b === 4) sfx('bell', { vol: 0.25 })
}
// チュートリアル: 文字は同時に1つだけ
function setTut(k, clear) {
  if (clear) { if (G.hint === clear) G.hint = ''; G.tutStep[clear] = 2; if (!k) return renderHint() }
  if (!k) return
  if (k !== 'lost' && (!G.tut || G.tutStep[k] === 2)) return
  if (k === 'lost' && G.hint && G.hint !== 'lost') return
  if (G.hint !== k) { if (G.hint && G.hint !== 'lost') G.tutStep[G.hint] = 2; G.hint = k; G.tutStep[k] = 1; renderHint() }
}
function renderHint() {
  const el = $('#hint'), cardOn = G.cardT != null && G.time - G.cardT < 1.9
  const k = G.hint, T = U().tut
  const txt = !k ? '' : k === 'drag' ? (coarse ? T.drag : T.dragPc) : T[k]
  el.textContent = txt; el.classList.toggle('show', !!txt && !cardOn)
}
function updHUD() {
  const m = D.START_MIN + Math.floor(G.time), hh = Math.floor(m / 60), mm = m % 60
  $('#wTime').textContent = `${hh}:${String(mm).padStart(2, '0')}`
  $('#wM').setAttribute('transform', `rotate(${mm * 6} 17 17)`); $('#wH').setAttribute('transform', `rotate(${(hh % 12) * 30 + mm * 0.5} 17 17)`)
  $('#watch').classList.toggle('hurry', D.LIMIT_SEC - G.time < 25)
  if (G.hint && G.cardT != null) renderHint()
}

// ---- 結末
function decide(timeout) {
  if (G.forceId) return G.forceId
  if (timeout) return 'jihanki'
  const d = G.decoys, tot = d.ex + d.cat + d.sales
  if (tot >= 2) return ['ex', 'cat', 'sales'].sort((a, b) => (d[b] - d[a]) || ((G.last === b) - (G.last === a)))[0]
  if (G.wrong >= 4) return 'mirror'
  const c = cleanPct()
  if (c >= 88 && tot === 0 && G.time <= FAST) return 'other'
  if (c >= 72) return 'bishou'
  if (c >= 50) return 'jiji'
  return 'kanji'
}
const endOf = id => D.ENDINGS.find(e => e.id === id)
function startReveal(timeout) {
  const id = decide(timeout), p = timeout ? headPos() : G.W.end
  G.reveal = { id, t: 0, timeout, x: p.x, y: p.y, stage: 0 }; G.arrT = G.time
  G.ended = true; G.finger.down = false; G.hint = ''; renderHint()
  window.TM && TM.end(cleanPct(), !timeout)
  Snd.duck(0.3, 3.2); sfx('drum', { vol: 0.8, jitter: 0 })
  const r = $('#reveal'); r.className = 'pre'
  $('#rvPre').textContent = U().revealPre; $('#rvName').textContent = ''; $('#rvLine').textContent = ''; $('#rvNext').textContent = U().tapNext
  const book = LS.get('book', {}); G.isNew = !book[id]; book[id] = (book[id] || 0) + 1; LS.set('book', book)
  G.line = endOf(id)[lang].lines[Math.floor(Math.random() * 2)]
}
function stepReveal() {
  const R = G.reveal; R.t += DT
  G.cam += (R.y - HW * 0.48 - G.cam) * Math.min(1, DT * 3)
  if (R.stage === 0 && R.t >= 2.2) {
    R.stage = 1; const e = endOf(R.id)[lang]
    $('#rvName').textContent = e.name; $('#rvLine').textContent = G.line; $('#reveal').className = 'on'
    const good = ['other', 'bishou'].includes(R.id), bad = ['jihanki', 'mirror', 'sales'].includes(R.id)
    sfx(good ? 'good' : bad ? 'bad' : 'mid', { vol: 0.9, jitter: 0 }); if (good) sfx('bell', { vol: 0.5, delay: 0.3 })
    if (R.id === 'cat') sfx('mew', { vol: 0.8, delay: 0.4 })
    G.shake = 0.2
    for (let i = 0; i < 16; i++) G.fx.push({ kind: 'petal', x: R.x, y: R.y - 60, a: Math.random() * TAU, sp: 60 + Math.random() * 90, t: 0, dur: 1.4 })
  }
  if (R.stage === 1 && R.t >= 3.1) { R.stage = 2; $('#reveal').className = 'on next' }
}

// ---- 描く
function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath() }
function ell(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, TAU) }
// 人（版画の切り絵）。足元が (x,y)
function person(c, o, t) {
  const x = o.x, y = o.y, h = o.h || 1, w = o.w || 1, ink = o.tone || C.ink, k = o.kind || 'suit', fl = o.flip || 1
  const bob = Math.sin((t || 0) * 2 + (o.ph || 0)) * 0.8
  c.fillStyle = 'rgba(35,44,87,.16)'; ell(c, x, y, 15 * w, 4.5); c.fill()
  c.save(); c.translate(x, y + bob * 0.2); c.scale(fl, 1); if (!o.face) c.rotate(((o.ph || 0) % 1 - 0.5) * 0.09)
  const hip = -30 * h, sh = -56 * h + bob, hy = -67 * h + bob, hr = 8.4 * h
  c.fillStyle = ink
  // 脚
  if (k === 'dress' || k === 'granny') { c.beginPath(); c.moveTo(-8 * w, hip); c.lineTo(8 * w, hip); c.lineTo(13 * w, -4); c.lineTo(-13 * w, -4); c.fill(); c.fillRect(-6, -4, 3.5, 4); c.fillRect(2.5, -4, 3.5, 4) }
  else { c.beginPath(); c.moveTo(-8 * w, hip); c.lineTo(-0.8, hip); c.lineTo(-1.5, 0); c.lineTo(-8.5 * w, 0); c.fill(); c.beginPath(); c.moveTo(0.8, hip); c.lineTo(8 * w, hip); c.lineTo(8.5 * w, 0); c.lineTo(1.5, 0); c.fill() }
  if (k === 'jog') { c.beginPath(); c.moveTo(0.8, hip); c.lineTo(8 * w, hip); c.lineTo(14 * w, -8); c.lineTo(9, -6); c.fill() }
  // 胴
  const coat = k === 'long' || k === 'formal'
  c.beginPath(); c.moveTo(-10.5 * w, sh); c.quadraticCurveTo(-12 * w, sh + 10, -9 * w, coat ? -20 * h : hip + 2); c.lineTo(9 * w, coat ? -20 * h : hip + 2); c.quadraticCurveTo(12 * w, sh + 10, 10.5 * w, sh); c.quadraticCurveTo(0, sh - 4, -10.5 * w, sh); c.fill()
  // 腕
  c.lineCap = 'round'; c.strokeStyle = ink; c.lineWidth = 4.2 * w
  c.beginPath(); c.moveTo(-10 * w, sh + 2); c.lineTo(-13 * w, hip + 4); c.stroke()
  if (k === 'phone') { c.beginPath(); c.moveTo(10 * w, sh + 2); c.lineTo(9 * w, sh - 2); c.stroke() }
  else { c.beginPath(); c.moveTo(10 * w, sh + 2); c.lineTo(13 * w, hip + 4); c.stroke() }
  // 頭
  c.beginPath(); c.arc(0, hy, hr, 0, TAU); c.fill()
  // 髪
  const hair = o.hair || 0
  if (hair === 1) { c.beginPath(); c.arc(0, hy - hr * 0.9, hr * 0.55, 0, TAU); c.fill() }
  if (hair === 2) { c.beginPath(); c.moveTo(-hr, hy); c.quadraticCurveTo(-hr * 1.3, hy + hr * 1.8, -hr * 0.4, hy + hr * 2); c.lineTo(hr * 0.4, hy + hr * 2); c.quadraticCurveTo(hr * 1.3, hy + hr * 1.8, hr, hy); c.fill() }
  if (hair === 3) { for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 3.2 - 2, hy - hr * 0.6); c.lineTo(i * 3.6, hy - hr * 1.45); c.lineTo(i * 3.2 + 2, hy - hr * 0.6); c.fill() } }
  if (hair === 5) { c.beginPath(); c.moveTo(-hr * 1.05, hy + hr * 0.3); c.quadraticCurveTo(-hr * 1.2, hy - hr * 1.4, hr * 0.4, hy - hr * 1.15); c.quadraticCurveTo(hr * 1.4, hy - hr * 0.9, hr * 1.1, hy + hr * 0.9); c.quadraticCurveTo(hr * 0.6, hy - hr * 0.2, -hr * 0.3, hy - hr * 0.35); c.quadraticCurveTo(-hr * 0.8, hy - hr * 0.2, -hr * 1.05, hy + hr * 0.3); c.fill() }
  if (hair === 4 || k === 'cap') { c.beginPath(); c.ellipse(0, hy - hr * 0.35, hr * 1.05, hr * 0.7, 0, Math.PI, TAU); c.fill(); c.fillRect(-hr * 1.5, hy - hr * 0.42, hr * 1.2, 2.4) }
  // 彫りの線（紙の色）
  c.strokeStyle = C.paper; c.lineWidth = 1.1; c.lineCap = 'round'
  if (o.face) face(c, hy, hr, o.face)
  else { c.beginPath(); c.moveTo(-hr * 0.15, hy - hr * 0.95); c.quadraticCurveTo(hr * 0.1, hy - hr * 0.4, hr * 0.5, hy - hr * 0.2); c.stroke() }
  if (k === 'suit' || k === 'formal' || k === 'phone') { c.beginPath(); c.moveTo(-4, sh - 1); c.lineTo(0, sh + 7); c.lineTo(4, sh - 1); c.stroke(); c.beginPath(); c.moveTo(0, sh + 8); c.lineTo(0, hip); c.stroke() }
  if (k === 'party') { c.beginPath(); c.moveTo(-8, sh + 9); c.lineTo(8, sh + 9); c.stroke() }
  if (k === 'student') { c.beginPath(); c.moveTo(-6, sh + 1); c.lineTo(6, sh + 1); c.stroke(); for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(0, sh + 6 + i * 6, 0.9, 0, TAU); c.stroke() } }
  if (k === 'dress') { c.beginPath(); c.moveTo(-9, hip + 1); c.quadraticCurveTo(0, hip + 5, 9, hip + 1); c.stroke() }
  if (k === 'granny') { c.beginPath(); c.arc(0, hy - hr * 0.9, hr * 0.5, 0, TAU); c.fillStyle = ink; c.fill(); c.stroke() }
  c.beginPath(); c.moveTo(-5 * w, hip - 6); c.lineTo(-5.5 * w, hip + 6); c.stroke()
  // 持ち物
  c.fillStyle = ink
  if (k === 'bag' || k === 'suit' && (o.hair & 1)) { rr(c, 11 * w, hip - 6, 10, 13, 2); c.fill(); c.strokeStyle = C.paper; c.beginPath(); c.moveTo(13 * w, hip - 2); c.lineTo(19 * w, hip - 2); c.stroke() }
  if (k === 'phone') { c.fillStyle = C.paper; c.fillRect(6 * w, sh - 10, 5, 8); c.fillStyle = ink }
  if (k === 'shop') { c.fillStyle = C.paper; c.strokeStyle = ink; c.lineWidth = 1.3; rr(c, 10 * w, hip - 4, 12, 14, 2); c.fill(); c.stroke(); c.strokeStyle = '#5d7a4a'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(14 * w, hip - 3); c.lineTo(20 * w, hip - 22); c.stroke(); c.fillStyle = ink }
  if (k === 'umbrella') { c.strokeStyle = ink; c.lineWidth = 1.6; c.beginPath(); c.moveTo(13 * w, hip + 4); c.lineTo(13 * w, -6); c.stroke(); c.beginPath(); c.arc(11 * w, hip + 4, 2.2, 0, Math.PI, true); c.stroke() }
  if (k === 'kid') { /* 小さめで描かれる */ }
  if (k === 'dog') { c.save(); c.translate(24, 0); c.fillStyle = ink; ell(c, 0, -9, 10, 5.5); c.fill(); c.beginPath(); c.arc(9, -14, 4.2, 0, TAU); c.fill(); c.fillRect(-8, -6, 2.5, 6); c.fillRect(5, -6, 2.5, 6); c.strokeStyle = ink; c.lineWidth = 1; c.beginPath(); c.moveTo(-13, hip + 6 - 0); c.lineTo(6, -14); c.stroke(); c.restore() }
  if (k === 'fish') { c.strokeStyle = ink; c.lineWidth = 1.4; c.beginPath(); c.moveTo(12, hip + 4); c.lineTo(46, sh - 30); c.stroke(); c.lineWidth = 0.6; c.beginPath(); c.moveTo(46, sh - 30); c.quadraticCurveTo(60, sh, 64, 0); c.stroke() }
  if (o.ramen) { c.fillStyle = C.paper; c.strokeStyle = ink; c.lineWidth = 1.3; c.beginPath(); c.arc(-15, hip - 2, 7, 0, Math.PI); c.closePath(); c.fill(); c.stroke() }
  c.restore()
  if (o.twin) person(c, Object.assign({}, o, { x: x + 21, flip: -fl, twin: 0, many: 0, ramen: 0 }), t)
  if (o.many) { c.strokeStyle = 'rgba(168,40,95,.45)'; c.lineWidth = 1; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(x + 13 * fl, y + hip + 4); c.quadraticCurveTo(x + (i - 2) * 30, y - 110, x + (i - 2) * 60, y - 160 - i * 8); c.stroke() } }
}
// 正面の顔（結末の人だけ）。紙の色で彫る
function face(c, hy, hr, ex) {
  c.save(); c.strokeStyle = C.paper; c.fillStyle = C.paper; c.lineWidth = 1.05; c.lineCap = 'round'
  const ey = hy - hr * 0.05, dx = hr * 0.38, my = hy + hr * 0.42
  const dot = (x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill() }
  const arc = (x, y, r, a0, a1) => { c.beginPath(); c.arc(x, y, r, a0, a1); c.stroke() }
  if (ex === 'smile') { arc(-dx, ey + 1.2, 1.8, Math.PI * 1.15, Math.PI * 1.85); arc(dx, ey + 1.2, 1.8, Math.PI * 1.15, Math.PI * 1.85); arc(0, my - 2.2, 2.6, 0.2 * Math.PI, 0.8 * Math.PI); c.globalAlpha = 0.7; for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * hr * 0.62, hy + hr * 0.18); c.lineTo(sx * hr * 0.48, hy + hr * 0.3); c.stroke() } }
  if (ex === 'sparkle') { for (const sx of [-1, 1]) { arc(sx * dx, ey - 0.5, 1.9, 0.1 * Math.PI, 0.9 * Math.PI); c.beginPath(); c.moveTo(sx * (dx + 1.9), ey - 0.2); c.lineTo(sx * (dx + 3), ey - 1.4); c.stroke() } c.beginPath(); c.moveTo(-1.6, my - 0.6); c.quadraticCurveTo(0, my + 0.6, 1.8, my - 1); c.stroke() }
  if (ex === 'kind') { arc(-dx, ey + 1.5, 1.7, Math.PI * 1.1, Math.PI * 1.9); arc(dx, ey + 1.5, 1.7, Math.PI * 1.1, Math.PI * 1.9); c.lineWidth = 1.6; c.beginPath(); c.moveTo(-3.6, my - 1); c.quadraticCurveTo(-1.5, my - 2.8, 0, my - 1.6); c.quadraticCurveTo(1.5, my - 2.8, 3.6, my - 1); c.stroke() }
  if (ex === 'shout') { dot(-dx, ey, 1.1); dot(dx, ey, 1.1); c.beginPath(); c.ellipse(0, my, 2.2, 2.6, 0, 0, TAU); c.fill() }
  if (ex === 'smug') { for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * dx - 1.8, ey - 0.6); c.lineTo(sx * dx + 1.8, ey - 0.6); c.stroke(); dot(sx * dx + 0.9, ey + 0.6, 0.8) } c.beginPath(); c.moveTo(-1.8, my); c.quadraticCurveTo(0.8, my + 0.4, 2.4, my - 1.6); c.stroke() }
  if (ex === 'grin') { dot(-dx, ey, 1.1); dot(dx, ey, 1.1); c.beginPath(); c.moveTo(-3.4, my - 1.4); c.quadraticCurveTo(0, my + 3.4, 3.4, my - 1.4); c.closePath(); c.fill(); c.strokeStyle = C.ink; c.lineWidth = 0.5; for (const tx of [-1.2, 0, 1.2]) { c.beginPath(); c.moveTo(tx, my - 1.2); c.lineTo(tx, my + 0.6); c.stroke() } }
  if (ex === 'blank') { dot(-dx, ey, 1); dot(dx, ey, 1); c.beginPath(); c.moveTo(-1.6, my); c.lineTo(1.6, my); c.stroke() }
  c.restore()
}
function cat(c, x, y, s, t, pull) {
  c.save(); c.translate(x, y); c.scale(s, s)
  c.fillStyle = 'rgba(35,44,87,.16)'; ell(c, 0, 0, 16, 4.5); c.fill()
  c.fillStyle = C.ink
  ell(c, 0, -13, 13, 12); c.fill()
  c.beginPath(); c.arc(3, -30, 9.5, 0, TAU); c.fill()
  c.beginPath(); c.moveTo(-5, -35); c.lineTo(-3, -45); c.lineTo(2, -38); c.fill(); c.beginPath(); c.moveTo(5, -38); c.lineTo(10, -45); c.lineTo(12, -34); c.fill()
  c.strokeStyle = C.ink; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(-12, -6); c.quadraticCurveTo(-26, -10, -22 + Math.sin(t * 5) * 3, -26); c.stroke()
  const pw = pull ? Math.sin(t * 14) * 4 : Math.sin(t * 3) * 2
  c.lineWidth = 3.4; c.beginPath(); c.moveTo(8, -14); c.lineTo(15 + pw, -22); c.stroke()
  c.strokeStyle = C.paper; c.lineWidth = 1.1; c.beginPath(); c.moveTo(0, -31); c.lineTo(2, -30); c.moveTo(6, -31); c.lineTo(8, -30); c.stroke()
  c.beginPath(); c.moveTo(-6, -18); c.quadraticCurveTo(0, -12, 6, -18); c.stroke()
  c.restore()
}
function door(c, x, y, t, open) {
  c.save(); c.translate(x, y)
  c.fillStyle = 'rgba(35,44,87,.16)'; ell(c, 0, 2, 24, 5); c.fill()
  c.fillStyle = C.ink; c.fillRect(-20, -78, 40, 80)
  c.fillStyle = open ? '#1a2045' : '#c9bfa6'; c.fillRect(-15, -72, 30, 74)
  if (open) { c.fillStyle = C.ink2; c.beginPath(); c.moveTo(-15, -72); c.lineTo(-4, -66); c.lineTo(-4, 6); c.lineTo(-15, 2); c.fill() }
  else { c.fillStyle = C.ink; c.beginPath(); c.arc(9, -34, 2, 0, TAU); c.fill() }
  c.fillStyle = C.paper; c.fillRect(-15, -94, 30, 14); c.strokeStyle = C.ink; c.lineWidth = 1.2; c.strokeRect(-15, -94, 30, 14)
  c.fillStyle = C.ink; c.font = '700 8.5px ' + SANS; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(lang === 'ja' ? '無料相談' : 'FREE', 0, -87)
  c.restore()
}
const SANS = '"BIZ UDPGothic","Hiragino Sans",sans-serif', BRUSH = '"Yuji Syuku","Hiragino Mincho ProN",serif'

// 糸を描く。style: true / ex / cat / sales / strand
function threadPath(c, P, s0, s1, wob) {
  const a = P.pts, i0 = idxAtS(P, Math.max(0, s0)), i1 = Math.min(a.length - 1, idxAtS(P, s1) + 1)
  c.beginPath()
  for (let i = i0; i <= i1; i++) {
    let x = a[i].x, y = a[i].y
    if (wob) { const o = wob(a[i].s, i); if (o) { const q = a[Math.min(i + 1, a.length - 1)], p = a[Math.max(i - 1, 0)], nx = -(q.y - p.y), ny = q.x - p.x, L = Math.hypot(nx, ny) || 1; x += nx / L * o; y += ny / L * o } }
    i === i0 ? c.moveTo(x, y) : c.lineTo(x, y)
  }
}
function drawThread(c, P, s0, s1, style, wob, alpha) {
  if (s1 <= s0) return
  c.save(); c.globalAlpha = alpha == null ? 1 : alpha; c.lineCap = 'round'; c.lineJoin = 'round'
  const fray = style === 'cat'
  const wf = fray ? (s, i) => Math.sin(i * 2.1) * 1.4 + Math.sin(i * 0.7) * 1.1 : wob
  // 床に落ちる影（糸が浮いている）
  c.translate(2.5, 4); threadPath(c, P, s0, s1, wf); c.strokeStyle = 'rgba(35,44,87,.16)'; c.lineWidth = 3.2; c.stroke(); c.translate(-2.5, -4)
  threadPath(c, P, s0, s1, wf)
  c.strokeStyle = style === 'ex' ? C.fade : C.red; c.lineWidth = style === 'ex' ? 3.1 : fray ? 2.6 : 3.4; c.stroke()
  if (!fray) { c.setLineDash([3.5, 3.5]); c.strokeStyle = style === 'ex' ? C.fadeD : C.redD; c.globalAlpha *= 0.55; c.lineWidth = 1.2; c.stroke(); c.setLineDash([]) }
  else {
    // ほつれた毛羽
    const a = P.pts, i0 = idxAtS(P, Math.max(0, s0)), i1 = Math.min(a.length - 1, idxAtS(P, s1))
    c.strokeStyle = C.red; c.lineWidth = 0.9
    for (let i = i0; i < i1; i += 3) { const p = a[i], q = a[Math.min(i + 1, a.length - 1)], nx = -(q.y - p.y), ny = q.x - p.x, L = Math.hypot(nx, ny) || 1, sd = i % 2 ? 1 : -1, ln = 4 + (i * 7 % 5); c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + nx / L * ln * sd + (q.x - p.x) * 0.8, p.y + ny / L * ln * sd + (q.y - p.y) * 0.8); c.stroke() }
  }
  c.restore()
}
// 自分の手（スタート地点）
function hand(c, x, y) {
  c.save(); c.translate(x, y)
  c.fillStyle = C.paper; c.strokeStyle = C.ink; c.lineWidth = 2.2; c.lineJoin = 'round'
  c.beginPath(); c.moveTo(-34, 120); c.lineTo(-30, 40); c.quadraticCurveTo(-34, 22, -24, 14); c.lineTo(-22, 0); c.quadraticCurveTo(-18, -8, -12, 0); c.lineTo(-10, 10)
  c.quadraticCurveTo(-8, 2, -2, 4); c.lineTo(0, 12); c.quadraticCurveTo(4, 4, 10, 8); c.lineTo(10, 16)
  c.quadraticCurveTo(12, 6, 16, -24); c.quadraticCurveTo(20, -32, 25, -24); c.lineTo(24, 18); c.quadraticCurveTo(30, 40, 26, 60); c.lineTo(28, 120); c.closePath(); c.fill(); c.stroke()
  c.beginPath(); c.moveTo(-24, 14); c.quadraticCurveTo(-20, 22, -14, 20); c.moveTo(-10, 10); c.quadraticCurveTo(-6, 18, 0, 14); c.moveTo(0, 12); c.quadraticCurveTo(4, 20, 10, 16); c.stroke()
  // 小指の蝶結び
  c.strokeStyle = C.red; c.lineWidth = 3; c.beginPath(); c.moveTo(14, -12); c.lineTo(26, -14); c.stroke()
  c.beginPath(); c.ellipse(13, -18, 5, 3, -0.6, 0, TAU); c.stroke(); c.beginPath(); c.ellipse(28, -20, 5, 3, 0.6, 0, TAU); c.stroke()
  c.restore()
}
// 場所の床と飾り
function drawBand(c, b, ya, yb, t) {
  // ya < yb（画面の上が ya）
  const top = b === NB - 1 ? G.W.END - 900 : -(b + 1) * BH, bot = b === 0 ? 600 : -b * BH, y0 = Math.max(ya, top), y1 = Math.min(yb, bot)
  if (y1 <= y0) return
  c.fillStyle = FLOOR[b]; c.fillRect(0, y0, 360, y1 - y0)
  c.save(); c.beginPath(); c.rect(0, y0, 360, y1 - y0); c.clip()
  const from = Math.floor(y0 / 10) * 10
  if (b === 0) {
    c.strokeStyle = 'rgba(35,44,87,.08)'; c.lineWidth = 1
    for (let y = Math.floor(y0 / 120) * 120; y < y1; y += 120) { c.beginPath(); c.moveTo(38, y); c.lineTo(322, y); c.stroke() }
    // 座席と窓
    for (const sx of [0, 324]) { c.fillStyle = C.ink2; c.fillRect(sx, y0, 36, y1 - y0); c.fillStyle = '#5d6690'; for (let y = Math.floor(y0 / 46) * 46; y < y1; y += 46) c.fillRect(sx + 4, y + 4, 28, 38) }
    for (let y = Math.floor(y0 / 46) * 46; y < y1; y += 46) { for (const sx of [18, 342]) { const k = (Math.abs(y / 46) * 7 + sx) % 5; if (k < 1) continue; c.fillStyle = C.ink; c.beginPath(); c.arc(sx, y + 18, 7.5, 0, TAU); c.fill(); c.fillRect(sx - 9, y + 22, 18, 16) } }
    // 吊り革の棒
    c.strokeStyle = 'rgba(35,44,87,.35)'; c.lineWidth = 2
    for (const rx of [92, 268]) { c.beginPath(); c.moveTo(rx, y0); c.lineTo(rx, y1); c.stroke(); for (let y = Math.floor(y0 / 64) * 64; y < y1; y += 64) { c.beginPath(); c.moveTo(rx, y); c.lineTo(rx, y + 12); c.stroke(); c.beginPath(); c.ellipse(rx, y + 16, 5, 4, 0, 0, TAU); c.stroke() } }
  } else if (b === 1) {
    c.strokeStyle = 'rgba(35,44,87,.07)'; c.lineWidth = 1
    for (let y = Math.floor(y0 / 40) * 40; y < y1; y += 40) { c.beginPath(); c.moveTo(40, y); c.lineTo(320, y); c.stroke() }
    for (let x = 60; x < 320; x += 40) { c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.stroke() }
    // アーケードの梁
    c.strokeStyle = 'rgba(35,44,87,.22)'; c.lineWidth = 3
    for (let y = Math.floor(y0 / 236) * 236; y < y1; y += 236) { c.beginPath(); c.moveTo(0, y); c.quadraticCurveTo(180, y - 26, 360, y); c.stroke() }
  } else if (b === 2) {
    c.strokeStyle = 'rgba(35,44,87,.12)'; c.lineWidth = 1.2
    for (let y = Math.floor(y0 / 90) * 90; y < y1; y += 90) { c.beginPath(); c.moveTo(0, y); c.lineTo(360, y); c.stroke(); const off = (Math.abs(y / 90) % 2) * 90; for (let x = off; x < 360; x += 180) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 90); c.stroke() } }
    // 提灯
    for (let y = Math.floor(y0 / 300) * 300; y < y1; y += 300) for (const lx of [24, 336]) { c.fillStyle = C.paper; c.strokeStyle = C.ink; c.lineWidth = 1.4; ell(c, lx, y + 40, 10, 14); c.fill(); c.stroke(); c.beginPath(); c.moveTo(lx - 10, y + 40); c.lineTo(lx + 10, y + 40); c.stroke() }
  } else if (b === 3) {
    c.fillStyle = 'rgba(35,44,87,.09)'; c.fillRect(150, y0, 60, y1 - y0)
    c.strokeStyle = 'rgba(35,44,87,.18)'; c.lineWidth = 1; c.beginPath(); c.moveTo(150, y0); c.lineTo(150, y1); c.moveTo(210, y0); c.lineTo(210, y1); c.stroke()
    for (let y = Math.floor(y0 / 80) * 80; y < y1; y += 80) { c.beginPath(); c.arc(180, y + 40, 4, 0, TAU); c.stroke() }
  } else {
    // 草と川
    c.strokeStyle = 'rgba(70,90,60,.28)'; c.lineWidth = 1.2
    for (let y = from; y < y1; y += 22) for (let i = 0; i < 6; i++) { const gx = ((y * 13 + i * 71) % 290 + 290) % 290; c.beginPath(); c.moveTo(gx, y); c.lineTo(gx + 2, y - 6); c.moveTo(gx + 4, y); c.lineTo(gx + 3, y - 5); c.stroke() }
    c.fillStyle = '#3a4878'; c.beginPath(); c.moveTo(310, y0); for (let y = y0; y <= y1 + 20; y += 20) c.lineTo(306 + Math.sin(y * 0.01) * 6, y); c.lineTo(360, y1 + 20); c.lineTo(360, y0); c.fill()
    c.strokeStyle = 'rgba(239,229,207,.6)'; c.lineWidth = 1.2
    for (let y = Math.floor(y0 / 30) * 30; y < y1; y += 30) { const wx = 318 + ((y * 7) % 30 + 30) % 30 + Math.sin(t + y) * 2; c.beginPath(); c.moveTo(wx, y); c.quadraticCurveTo(wx + 4, y - 3, wx + 8, y); c.stroke() }
  }
  c.restore()
  if (b === 1) for (const s of G.W.shops) if (s.y > ya - 130 && s.y < yb + 20) shop(c, s)
}
function shop(c, s) {
  const x = s.side ? 318 : 0, y = s.y
  c.fillStyle = C.ink; c.fillRect(x, y - 110, 42, 112)
  c.fillStyle = C.paper2; c.fillRect(x + (s.side ? 4 : 0), y - 74, 38, 76)
  for (let i = 0; i < 6; i++) { c.fillStyle = (i % 2) ^ s.stripe ? C.ink : C.paper; c.fillRect(x + i * 7, y - 92, 7, 14) }
  c.fillStyle = C.paper; c.fillRect(x + 9, y - 70, 24, 24); c.strokeStyle = C.ink; c.lineWidth = 1.4; c.strokeRect(x + 9, y - 70, 24, 24)
  c.fillStyle = C.ink; c.font = '20px ' + BRUSH; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s.ch, x + 21, y - 57)
}
function gate(c, b) {
  const y = -b * BH
  c.fillStyle = C.ink; c.fillRect(14, y - 70, 7, 76); c.fillRect(339, y - 70, 7, 76)
  c.fillRect(6, y - 82, 348, 12)
  const txt = U().gates[b]; c.font = '15px ' + BRUSH
  const w = Math.min(300, c.measureText(txt).width + 26)
  c.fillStyle = C.paper; c.fillRect(180 - w / 2, y - 106, w, 26); c.strokeStyle = C.ink; c.lineWidth = 2; c.strokeRect(180 - w / 2, y - 106, w, 26)
  c.fillStyle = C.ink; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, 180, y - 92)
}
function prop(c, o, t) {
  if (o.kind === 'table') {
    c.fillStyle = 'rgba(35,44,87,.16)'; c.fillRect(o.x - 44, o.y - 4, 92, 10)
    c.fillStyle = C.ink; c.fillRect(o.x - 46, o.y - 30, 92, 30)
    c.fillStyle = '#5d6690'; c.fillRect(o.x - 42, o.y - 27, 84, 22)
    for (let i = 0; i < 4; i++) { const gx = o.x - 34 + i * 22; c.fillStyle = C.paper; c.fillRect(gx, o.y - 24, 7, 12); c.strokeStyle = C.ink; c.lineWidth = 1; c.strokeRect(gx, o.y - 24, 7, 12); c.beginPath(); c.arc(gx + 15, o.y - 13, 4, 0, TAU); c.fillStyle = C.paper2; c.fill() }
    for (const sx of [-30, 0, 30]) { const p = { x: o.x + sx, y: o.y - 34, kind: 'party', h: 0.62, w: 0.95, hair: (o.r * 10 + sx) & 3, tone: C.ink2, flip: 1, ph: sx }; person(c, p, t) }
  } else if (o.kind === 'chair') {
    c.fillStyle = 'rgba(35,44,87,.16)'; ell(c, o.x, o.y, 11, 3.5); c.fill()
    c.fillStyle = C.paper; c.strokeStyle = C.ink; c.lineWidth = 1.6; rr(c, o.x - 10, o.y - 30, 20, 22, 3); c.fill(); c.stroke()
    c.fillStyle = C.ink; c.fillRect(o.x - 10, o.y - 8, 20, 3); c.fillRect(o.x - 9, o.y - 6, 2, 6); c.fillRect(o.x + 7, o.y - 6, 2, 6)
    c.strokeStyle = C.ink; c.lineWidth = 1; c.beginPath(); c.moveTo(o.x - 10, o.y - 26); c.quadraticCurveTo(o.x, o.y - 20, o.x + 10, o.y - 26); c.stroke()
  } else if (o.kind === 'flowers') {
    c.fillStyle = C.ink; c.fillRect(o.x - 2, o.y - 40, 4, 40); c.fillRect(o.x - 9, o.y - 2, 18, 3)
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; c.fillStyle = i % 2 ? C.paper : C.pale; c.strokeStyle = C.ink; c.lineWidth = 1; c.beginPath(); c.arc(o.x + Math.cos(a) * 9, o.y - 52 + Math.sin(a) * 8, 5.5, 0, TAU); c.fill(); c.stroke() }
  } else if (o.kind === 'cart') {
    c.fillStyle = 'rgba(35,44,87,.16)'; ell(c, o.x, o.y, 13, 4); c.fill()
    c.fillStyle = C.ink; rr(c, o.x - 10, o.y - 34, 20, 28, 3); c.fill(); c.strokeStyle = C.paper; c.lineWidth = 1; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(o.x - 8, o.y - 28 + i * 8); c.lineTo(o.x + 8, o.y - 28 + i * 8); c.stroke() }
    c.strokeStyle = C.ink; c.lineWidth = 2; c.beginPath(); c.moveTo(o.x + 8, o.y - 34); c.lineTo(o.x + 12, o.y - 50); c.stroke(); c.beginPath(); c.arc(o.x - 6, o.y - 3, 3, 0, TAU); c.arc(o.x + 6, o.y - 3, 3, 0, TAU); c.fillStyle = C.ink; c.fill()
  } else if (o.kind === 'reeds') {
    c.strokeStyle = '#4b5a3c'; c.lineWidth = 1.4
    for (let i = 0; i < 5; i++) { const bx = o.x + (i - 2) * 3, sw = Math.sin(t * 1.5 + o.r * 6 + i) * 2; c.beginPath(); c.moveTo(bx, o.y); c.quadraticCurveTo(bx + sw, o.y - 18, bx + sw * 2 + (i - 2) * 2, o.y - 34 - i % 2 * 6); c.stroke() }
    c.fillStyle = '#6b5a3c'; for (let i = 0; i < 2; i++) { const bx = o.x + (i ? 4 : -4); ell(c, bx + Math.sin(t * 1.5 + o.r * 6) * 4, o.y - 36 - i * 4, 2, 5); c.fill() }
  } else if (o.kind === 'couple') {
    person(c, { x: o.x - 12, y: o.y, kind: 'formal', h: 1.05, w: 1, hair: 3, flip: 1 }, t)
    person(c, { x: o.x + 12, y: o.y, kind: 'dress', h: 1, w: 1.1, hair: 2, flip: -1, tone: C.paper }, t)
    c.strokeStyle = C.ink; c.lineWidth = 1.4; c.beginPath(); c.arc(o.x + 12, o.y - 67, 8.4, 0, TAU); c.stroke()
    // 新郎の糸はケーキへ
    c.strokeStyle = C.fade; c.lineWidth = 1.2; c.beginPath(); c.moveTo(o.x - 25, o.y - 26); c.quadraticCurveTo(o.x - 50, o.y + 10, o.x - 58, o.y - 8); c.stroke()
    c.fillStyle = C.paper; c.strokeStyle = C.ink; c.lineWidth = 1.4; for (let i = 0; i < 3; i++) { c.fillRect(o.x - 68 + i * 3, o.y - 12 - i * 9, 20 - i * 6, 9); c.strokeRect(o.x - 68 + i * 3, o.y - 12 - i * 9, 20 - i * 6, 9) }
  } else if (o.kind === 'kappa') {
    c.fillStyle = '#4b6a4a'; c.beginPath(); c.arc(o.x, o.y - 6, 8, Math.PI, TAU); c.fill(); c.fillStyle = C.paper; ell(c, o.x, o.y - 13, 6, 2); c.fill()
    c.fillStyle = C.ink; c.fillRect(o.x - 4, o.y - 9, 2, 2); c.fillRect(o.x + 2, o.y - 9, 2, 2)
  }
}
function snagObj(c, sn, t) {
  const j = sn.hot ? Math.sin(t * 70) * 1.8 : 0, x = sn.x + j, y = sn.y
  c.save(); c.lineCap = 'round'
  if (sn.type === 'strap') {
    c.strokeStyle = C.ink; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y - 34); c.lineTo(x, y - 9); c.stroke()
    c.fillStyle = C.ink; c.fillRect(x - 12, y - 38, 24, 4)
    c.lineWidth = 3.4; c.beginPath(); c.ellipse(x, y, 10, 8.5, 0, 0, TAU); c.stroke()
  } else if (sn.type === 'umbrella') {
    c.strokeStyle = C.ink; c.lineWidth = 3; c.beginPath(); c.moveTo(x + 9, y - 46); c.lineTo(x + 9, y); c.arc(x, y, 9, 0, Math.PI * 1.05); c.stroke()
    c.fillStyle = C.ink; c.beginPath(); c.moveTo(x - 18, y - 46); c.quadraticCurveTo(x + 9, y - 72, x + 36, y - 46); c.lineTo(x + 9, y - 52); c.fill()
  } else if (sn.type === 'mug') {
    c.fillStyle = C.paper; c.strokeStyle = C.ink; c.lineWidth = 2; rr(c, x - 22, y - 16, 16, 24, 2); c.fill(); c.stroke()
    c.fillStyle = C.pale; c.fillRect(x - 21, y - 15, 14, 6)
    c.lineWidth = 3.2; c.beginPath(); c.arc(x - 4, y - 4, 7, -Math.PI / 2, Math.PI / 2); c.stroke()
  } else if (sn.type === 'ribbon') {
    c.fillStyle = C.paper; c.strokeStyle = C.ink; c.lineWidth = 1.2
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.beginPath(); c.arc(x + Math.cos(a) * 8, y - 22 + Math.sin(a) * 7, 6, 0, TAU); c.fill(); c.stroke() }
    c.strokeStyle = C.ink; c.lineWidth = 2.6; c.beginPath(); c.ellipse(x, y, 9, 6, 0.3, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(x, y - 12); c.lineTo(x, y - 6); c.stroke()
  } else {
    c.strokeStyle = '#4b5a3c'; c.lineWidth = 2
    for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(x + i * 5, y + 16); c.quadraticCurveTo(x + i * 2 + j, y, x + i * 6 + j * 2, y - 26); c.stroke() }
  }
  c.restore()
}
function knotDraw(c, k, t) {
  const sh = k.shake ? Math.sin(t * 60) * 3 * k.shake / 0.45 : 0, x = k.x + sh, y = k.y
  if (k.done && k.strands.every(s => s.fly && s.fly.t > 0.5)) return
  const R = 22 + k.spread * Math.min(64, k.x - 26, 334 - k.x)
  if (k.spread < 0.05) {
    // 固い玉
    c.save(); c.lineWidth = 2.4
    k.strands.forEach((s, i) => { c.strokeStyle = s.col; c.beginPath(); c.moveTo(x - Math.cos(s.ang) * 34, y - Math.sin(s.ang) * 34); c.lineTo(x + Math.cos(s.ang) * 34, y + Math.sin(s.ang) * 34); c.stroke() })
    for (let i = 0; i < 7; i++) { c.strokeStyle = i % 2 ? C.red : k.strands[i % k.strands.length].col; c.beginPath(); c.ellipse(x + Math.sin(i * 2.3) * 3, y + Math.cos(i * 1.7) * 3, 12 - i % 3, 7 + i % 4, i * 0.9 + t * 0.4, 0, TAU); c.stroke() }
    if (G.blocked === k) { const pu = 0.5 + 0.5 * Math.sin(t * 6); c.strokeStyle = `rgba(35,44,87,${0.35 + pu * 0.4})`; c.lineWidth = 2; c.setLineDash([4, 4]); c.beginPath(); c.arc(x, y, 24 + pu * 4, 0, TAU); c.stroke(); c.setLineDash([]) }
    c.restore(); return
  }
  // ゆるめた: 下から順に描く。上の糸は下の糸を紙の色で切って重なりを見せる
  const order = k.order.slice().reverse()
  c.save(); c.lineCap = 'round'
  for (const i of order) {
    const s = k.strands[i]; let ox = 0, oy = 0, al = 1
    if (s.fly) { const tt = s.fly.t; ox = s.fly.dx * tt * 500; oy = s.fly.dy * tt * 500; al = Math.max(0, 1 - tt * 2.2); if (al <= 0) continue }
    const ex = Math.cos(s.ang) * R, ey = Math.sin(s.ang) * R
    c.globalAlpha = al
    c.strokeStyle = FLOOR[k.band]; c.lineWidth = 9; c.beginPath(); c.moveTo(x - ex * 0.8 + ox, y - ey * 0.8 + oy); c.lineTo(x + ex * 0.8 + ox, y + ey * 0.8 + oy); c.stroke()
    c.strokeStyle = 'rgba(35,44,87,.18)'; c.lineWidth = 3; c.beginPath(); c.moveTo(x - ex + ox + 2, y - ey + oy + 3); c.lineTo(x + ex + ox + 2, y + ey + oy + 3); c.stroke()
    c.strokeStyle = s.col; c.lineWidth = 3.4; c.beginPath(); c.moveTo(x - ex + ox, y - ey + oy); c.lineTo(x + ex + ox, y + ey + oy); c.stroke()
    c.strokeStyle = 'rgba(80,10,20,.45)'; c.lineWidth = 1.1; c.setLineDash([3, 3]); c.stroke(); c.setLineDash([])
    // 糸のはしの持ち主の小指（輪）
    c.fillStyle = C.paper; c.strokeStyle = C.ink; c.lineWidth = 1.2
    for (const sg of [-1, 1]) { c.beginPath(); c.arc(x + ex * sg + ox, y + ey * sg + oy, 5, 0, TAU); c.fill(); c.stroke() }
  }
  c.restore()
}
function trapDraw(c, tr, t) {
  const fk = G.W.forks[tr.fork], br = fk.branches[tr.b]
  if (br.cut >= 1) return
  const al = br.cut ? 1 - br.cut : 1, act = G.trap && G.trap.tr === tr
  c.save(); c.globalAlpha = al
  if (tr.type === 'ex') {
    person(c, { x: tr.x + 4, y: tr.y + 8, kind: 'long', h: 1.02, w: 1, hair: 2, tone: C.ink2, flip: -1 }, t)
    c.strokeStyle = C.paper; c.lineWidth = 1.2; c.beginPath(); c.moveTo(tr.x - 6, tr.y - 38); c.lineTo(tr.x + 12, tr.y - 32); c.stroke()
  } else if (tr.type === 'cat') cat(c, tr.x + 6, tr.y + 10, 1, t, act)
  c.restore()
}
function endFigure(c, x, y, t, id, s) {
  // 結末の人。発表までは影（？）
  if (!id) {
    c.save(); c.globalAlpha = 0.85
    person(c, { x, y, kind: 'long', h: 1.1, w: 1.05, hair: 0, tone: C.ink, flip: 1 }, t)
    c.fillStyle = C.paper; c.font = '14px ' + SANS; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', x, y - 74)
    c.restore(); return
  }
  drawEnding(c, id, x, y, s || 1, t)
}
// 結末の絵（遊び中・結果の紙・図鑑で同じ物を描く）
function drawEnding(c, id, x, y, s, t) {
  c.save(); c.translate(x, y); c.scale(s, s)
  const P = (o) => person(c, Object.assign({ x: 0, y: 0, h: 1, w: 1, flip: 1 }, o), t)
  const pinky = (px, py) => { c.strokeStyle = C.red; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(px, py); c.quadraticCurveTo(px - 6, py - py * 0.7, px - 34, 4); c.lineTo(-90, 8); c.stroke() }
  if (id === 'other') {
    P({ kind: 'long', hair: 3, h: 1.04, face: 'smile' })
    c.strokeStyle = C.ink; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(10, -54); c.lineTo(20, -70); c.stroke()
    pinky(20, -72)
    c.strokeStyle = C.red; c.lineWidth = 2.6; c.beginPath(); c.moveTo(20, -72); c.bezierCurveTo(40, -86, 58, -60, 52, -20); c.quadraticCurveTo(48, 0, 90, 6); c.stroke()
  } else if (id === 'bishou') {
    P({ kind: 'long', hair: 5, h: 1.14, w: 0.95, face: 'sparkle' })
    c.strokeStyle = C.ink2; c.lineWidth = 1.2; for (let i = 0; i < 4; i++) { const wy = -78 + i * 8 + Math.sin(t * 3 + i) * 2; c.beginPath(); c.moveTo(-34, wy); c.quadraticCurveTo(-22, wy - 4, -14, wy); c.stroke() }
    c.strokeStyle = C.ink; c.lineWidth = 1.4; c.beginPath(); c.moveTo(13, -30); c.quadraticCurveTo(15, -42, 17, -54); c.stroke(); c.fillStyle = C.ink; c.beginPath(); c.ellipse(12, -40, 3.4, 1.6, -0.6, 0, TAU); c.fill(); c.beginPath(); c.moveTo(12, -58); c.quadraticCurveTo(17, -49, 22, -58); c.lineTo(22, -63); c.lineTo(19.5, -60.5); c.lineTo(17, -64.5); c.lineTo(14.5, -60.5); c.lineTo(12, -63); c.closePath(); c.fill(); c.strokeStyle = C.paper; c.lineWidth = 0.8; c.beginPath(); c.moveTo(14.5, -58); c.quadraticCurveTo(17, -55, 19.5, -58); c.stroke()
    pinky(-14, -30)
  } else if (id === 'jiji') {
    P({ kind: 'suit', hair: 0, h: 0.86, w: 1.12, face: 'kind' })
    c.fillStyle = C.paper; c.strokeStyle = C.ink; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-9, -44); c.lineTo(9, -44); c.lineTo(11, -14); c.lineTo(-11, -14); c.closePath(); c.fill(); c.stroke()
    c.fillStyle = C.paper; c.fillRect(-8, -64, 16, 3.5); c.beginPath(); c.moveTo(7, -63); c.lineTo(13, -67); c.lineTo(13, -60); c.fill()
    c.fillStyle = C.ink; c.beginPath(); c.arc(-8, -58, 3, 0, TAU); c.arc(8, -58, 3, 0, TAU); c.fill()
    c.fillStyle = '#b98a4e'; c.strokeStyle = C.ink; ell(c, 18, -30, 7, 4.5); c.fill(); c.stroke()
    pinky(-13, -24)
  } else if (id === 'kanji') {
    P({ kind: 'party', hair: 3, h: 1, w: 1.08, face: 'shout' })
    c.strokeStyle = C.paper; c.lineWidth = 1.2; c.beginPath(); c.arc(-3.5, -67, 3, 0, TAU); c.arc(3.5, -67, 3, 0, TAU); c.stroke()
    c.strokeStyle = C.ink; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(10, -54); c.lineTo(18, -76); c.stroke()
    for (let i = 0; i < 6; i++) { c.strokeStyle = i ? STRAND[i % 4] : C.red; c.lineWidth = 1.6; c.beginPath(); c.moveTo(18, -78); c.quadraticCurveTo(18 + (i - 2.5) * 12, -110, 18 + (i - 2.5) * 22, -130 - (i % 2) * 10); c.stroke() }
    c.fillStyle = C.paper; c.strokeStyle = C.ink; c.lineWidth = 1.4; rr(c, -26, -40, 11, 15, 2); c.fill(); c.stroke()
  } else if (id === 'ex') {
    P({ kind: 'long', hair: 2, h: 1.02, flip: -1, tone: C.ink2, face: 'smug' })
    c.strokeStyle = C.ink2; c.lineWidth = 4.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(-10, -46); c.lineTo(10, -42); c.stroke()
    c.strokeStyle = C.fade; c.lineWidth = 2.6; c.beginPath(); c.moveTo(-12, -46); c.quadraticCurveTo(-18, -20, -30, 6); c.stroke()
  } else if (id === 'cat') {
    cat(c, 0, 0, 1.25, t, true)
    c.strokeStyle = C.red; c.lineWidth = 2.6; c.beginPath(); c.moveTo(20, -28); c.quadraticCurveTo(30, -8, 14, 6); c.stroke()
    c.beginPath(); c.arc(24, -4, 7, 0, TAU); c.stroke(); c.beginPath(); c.arc(24, -4, 3.5, 0, TAU); c.stroke()
  } else if (id === 'sales') {
    P({ kind: 'suit', hair: 5, h: 1.02, w: 1.05, face: 'grin' })
    c.fillStyle = C.paper; c.beginPath(); c.moveTo(0, -48); c.lineTo(-2, -36); c.lineTo(0, -32); c.lineTo(2, -36); c.fill()
    c.fillStyle = C.ink; rr(c, -26, -32, 14, 11, 1.5); c.fill()
    c.fillStyle = C.paper; c.strokeStyle = C.ink; c.lineWidth = 1.2; c.save(); c.translate(18, -52); c.rotate(0.2); c.fillRect(-7, -10, 14, 19); c.strokeRect(-7, -10, 14, 19); c.fillStyle = C.ink; c.font = '9px ' + BRUSH; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(lang === 'ja' ? '契' : '$', 0, -1); c.restore()
    pinky(-13, -24)
  } else if (id === 'mirror') {
    c.fillStyle = C.ink; ell(c, 0, -48, 30, 46); c.fill(); c.fillStyle = '#d9d6cc'; ell(c, 0, -48, 24, 40); c.fill()
    c.save(); c.beginPath(); c.ellipse(0, -48, 24, 40, 0, 0, TAU); c.clip(); P({ y: 0, kind: 'long', hair: 1, tone: C.mid, h: 0.92, face: 'blank' }); c.restore()
    c.fillStyle = C.ink; c.fillRect(-4, -4, 8, 6); c.fillRect(-14, 1, 28, 3)
    c.strokeStyle = C.red; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-10, -34); c.bezierCurveTo(-60, -10, -40, 30, 0, 14); c.bezierCurveTo(40, 0, 50, -70, 10, -34); c.stroke()
  } else if (id === 'jihanki') {
    c.fillStyle = 'rgba(35,44,87,.16)'; c.fillRect(-26, -4, 56, 9)
    c.fillStyle = C.ink; c.fillRect(-24, -100, 48, 100)
    c.fillStyle = '#e7e2d3'; c.fillRect(-19, -94, 38, 46)
    for (let r = 0; r < 3; r++) for (let i = 0; i < 4; i++) { c.fillStyle = (r + i) % 3 === 0 ? C.ink2 : (r + i) % 3 === 1 ? C.mid : '#b98a4e'; c.fillRect(-16 + i * 9, -90 + r * 15, 6, 11) }
    c.fillStyle = C.paper; c.fillRect(-21, -45, 42, 10); c.fillStyle = C.ink; c.font = '700 6px ' + SANS; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(lang === 'ja' ? 'あったか〜い' : 'HOT', 0, -39.5)
    c.fillStyle = '#5d6690'; c.fillRect(-14, -18, 28, 9)
    c.fillStyle = C.paper; c.fillRect(14, -26, 6, 6)
    c.strokeStyle = C.red; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(20, -23); c.quadraticCurveTo(40, -10, 30, 10); c.stroke()
    c.beginPath(); c.ellipse(22, -28, 4, 2.5, -0.5, 0, TAU); c.stroke(); c.beginPath(); c.ellipse(29, -26, 4, 2.5, 0.5, 0, TAU); c.stroke()
  }
  c.restore()
}

let lastT = 0, acc = 0, paused = false, dbgPaused = false
function frame(now) {
  requestAnimationFrame(frame)
  const dt = Math.min(0.1, (now - lastT) / 1000 || 0); lastT = now
  if (!paused && !dbgPaused) { acc += dt; let n = 0; while (acc >= DT && n < 8) { if (mode === 'play') step(); else if (mode === 'title' && demo) demoStep(); acc -= DT; n++ } if (n >= 8) acc = 0 }
  render(now / 1000)
}
function demoStep() {
  // タイトルの後ろで糸がゆっくり進む
  const g = G; g.head.s += 70 * DT; if (g.head.s > g.W.main.len - 200) g.head.s = 60
  const k = g.W.knots.find(k => !k.done && k.s < g.head.s + 1); if (k) { k.done = true; k.strands.forEach(s => { s.gone = 1; s.fly = { t: 1, dx: 0, dy: 0 } }) }
  const p = headPos(); g.cam += (p.y - HW * 0.62 - g.cam) * Math.min(1, DT * 4); g.time += DT
}
function render(t) {
  const c = cx
  c.setTransform(DPR, 0, 0, DPR, 0, 0)
  c.fillStyle = '#232c57'; c.fillRect(0, 0, VW, VH)
  if (!G) return
  const shx = G.shake ? (Math.random() - 0.5) * 8 * G.shake / 0.35 : 0, shy = G.shake ? (Math.random() - 0.5) * 8 * G.shake / 0.35 : 0
  c.setTransform(DPR * SC, 0, 0, DPR * SC, DPR * (OX + shx), DPR * (-G.cam * SC + shy))
  const ya = G.cam - 20, yb = G.cam + HW + 40, W = G.W
  for (let b = 0; b < NB; b++) drawBand(c, b, ya, yb, t)
  // 夕焼け（最後の場所の先）
  if (ya < -NB * BH + 200) { const g = c.createLinearGradient(0, -NB * BH + 200, 0, W.END - 260); g.addColorStop(0, 'rgba(240,190,140,0)'); g.addColorStop(1, 'rgba(240,180,130,.6)'); c.fillStyle = g; c.fillRect(0, Math.max(ya, W.END - 900), 360, -NB * BH + 200 - Math.max(ya, W.END - 900)); c.fillStyle = '#e9a982'; c.beginPath(); c.arc(262, W.END - 190, 44, 0, TAU); c.fill(); c.strokeStyle = 'rgba(233,169,130,.5)'; c.lineWidth = 2; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(220 - i * 10, W.END - 130 + i * 9); c.lineTo(304 + i * 10, W.END - 130 + i * 9); c.stroke() } }
  for (let b = 1; b < NB; b++) { const gy = -b * BH; if (gy > ya - 20 && gy - 110 < yb) gate(c, b) }
  if (ya < 220 && yb > -40) hand(c, 163, 94)
  // 奥から手前へ（y の小さい順）
  const list = []
  for (const p of W.people) if (p.y > ya && p.y - 80 < yb) list.push([p.y, () => person(c, p, t)])
  for (const o of W.props) if (o.y > ya && o.y - 80 < yb) list.push([o.y, () => prop(c, o, t)])
  for (const tr of W.traps) if (tr.y > ya - 40 && tr.y - 100 < yb) list.push([tr.y + 8, () => trapDraw(c, tr, t)])
  const rv = G.reveal
  if (W.end.y > ya - 40 && W.end.y - 100 < yb && !(rv && rv.timeout)) list.push([W.end.y, () => endFigure(c, W.end.x, W.end.y + 6, t, rv && rv.stage ? rv.id : null, rv && rv.stage ? 1.25 : 1)])
  if (rv && rv.timeout) list.push([rv.y + 200, () => { if (rv.stage) drawEnding(c, rv.id, rv.x + 30, rv.y + 10, 1.2, t); else { c.save(); c.globalAlpha = Math.min(1, rv.t); drawEnding(c, 'jihanki', rv.x + 30, rv.y + 10 - Math.max(0, 1 - rv.t * 1.2) * 200, 1.2, t); c.restore() } }])
  list.sort((a, b) => a[0] - b[0]); for (const d of list) d[1]()
  // 偽物の糸（分かれ道）
  for (const fk of W.forks) {
    if (fk.y - 260 > yb || fk.y < ya - 20) continue
    fk.branches.forEach((b, bi) => {
      if (b.cut >= 1) return
      const on = G.head.br && G.head.br.f === W.forks.indexOf(fk) && G.head.br.b === bi
      const len = b.cut ? b.P.len * (1 - b.cut) : b.P.len
      drawThread(c, b.P, 0, b.type === 'sales' ? len - 6 : len, b.type, null, b.cut ? 1 - b.cut : 1)
      if (b.type === 'sales') { const tr = W.traps.find(t => t.fork === W.forks.indexOf(fk) && t.b === bi); if (tr && !b.cut) door(c, tr.x, tr.y + 6, t, G.trap && G.trap.tr === tr) }
      void on
    })
  }
  // 自分の糸
  const h = G.head, hs = h.br ? W.forks[h.br.f].s : h.s
  const tens = G.tension
  const wob = tens > 0.05 ? (s) => (s > hs - 20 && s < hs + 160 ? Math.sin(t * 55 + s * 0.35) * tens * 3.2 * (1 - Math.abs(s - hs - 50) / 120) : 0) : null
  const M = W.main, s0 = M.pts[idxAtY(M, yb)].s, s1 = M.pts[idxAtY(M, ya)].s
  drawThread(c, M, Math.max(0, s0 - 10), s1 + 10, 'true', wob)
  if (h.br) drawThread(c, curPath(), 0, h.s, W.forks[h.br.f].branches[h.br.b].type, null)
  if (tens > 0.55) { c.save(); c.globalAlpha = (tens - 0.55) * 1.6; threadPath(c, M, hs - 6, hs + 90, wob); c.strokeStyle = C.white; c.lineWidth = 1.6; c.stroke(); c.restore() }
  for (const f of G.frays) { c.strokeStyle = C.red; c.lineWidth = 1; for (let i = 0; i < 6; i++) { const a = f.r * 9 + i; c.beginPath(); c.moveTo(f.x, f.y); c.lineTo(f.x + Math.cos(a) * 7, f.y + Math.sin(a) * 7); c.stroke() } }
  for (const sn of W.snags) if (sn.y > ya - 40 && sn.y - 80 < yb) snagObj(c, sn, t)
  for (const k of W.knots) if (k.y > ya - 100 && k.y < yb + 100) knotDraw(c, k, t)
  // つまんでいる所
  if (mode === 'play' && !G.reveal) {
    const p = headPos(), pu = 0.5 + 0.5 * Math.sin(t * 5)
    c.fillStyle = 'rgba(251,246,234,.85)'; c.strokeStyle = C.ink; c.lineWidth = 2
    c.beginPath(); c.arc(p.x, p.y, 9 + (G.finger.down ? 0 : pu * 3), 0, TAU); c.fill(); c.stroke()
    c.fillStyle = C.red; c.beginPath(); c.arc(p.x, p.y, 3.4, 0, TAU); c.fill()
    if (!G.finger.down || G.lostT > 0.3) { c.strokeStyle = `rgba(211,32,46,${0.25 + pu * 0.35})`; c.lineWidth = 1.5; c.beginPath(); c.arc(p.x, p.y, 16 + pu * 6, 0, TAU); c.stroke() }
    ghost(c, t)
  }
  // 効果
  for (const f of G.fx) {
    const k = f.t / f.dur, d = f.sp * f.t
    if (f.kind === 'fiber') { c.strokeStyle = `rgba(211,32,46,${1 - k})`; c.lineWidth = 1.2; c.beginPath(); c.moveTo(f.x + Math.cos(f.a) * d, f.y + Math.sin(f.a) * d); c.lineTo(f.x + Math.cos(f.a) * (d + 6), f.y + Math.sin(f.a) * (d + 6)); c.stroke() }
    else { c.fillStyle = `rgba(211,32,46,${(1 - k) * 0.9})`; c.save(); c.translate(f.x + Math.cos(f.a) * d, f.y + Math.sin(f.a) * d + 40 * k * k); c.rotate(f.a + k * 6); c.fillRect(-3, -1.5, 6, 3); c.restore() }
  }
  for (const b of G.bubbles) drawBubble(c, b)
  // 画面の紙
  c.setTransform(DPR, 0, 0, DPR, 0, 0)
  if (!grainPat) grainPat = c.createPattern(grain, 'repeat')
  c.fillStyle = grainPat; c.fillRect(0, 0, VW, VH)
  const vg = c.createRadialGradient(VW / 2, VH * 0.55, VH * 0.3, VW / 2, VH * 0.55, VH * 0.8); vg.addColorStop(0, 'rgba(35,44,87,0)'); vg.addColorStop(1, 'rgba(35,44,87,.28)'); c.fillStyle = vg; c.fillRect(0, 0, VW, VH)
}
function drawBubble(c, b) {
  const al = Math.min(1, b.t * 8, (b.dur - b.t) * 4)
  c.save(); c.globalAlpha = al; c.font = '700 12px ' + SANS
  const w = c.measureText(b.text).width + 16, x = clamp(b.x - w / 2, 6, 354 - w), y = b.y - 24 - Math.min(1, b.t * 6) * 4
  c.fillStyle = C.white; c.strokeStyle = C.ink; c.lineWidth = 1.5; rr(c, x, y, w, 22, 4); c.fill(); c.stroke()
  c.beginPath(); c.moveTo(clamp(b.x, x + 8, x + w - 8) - 4, y + 22); c.lineTo(clamp(b.x, x + 8, x + w - 8), y + 29); c.lineTo(clamp(b.x, x + 8, x + w - 8) + 4, y + 22); c.fill(); c.stroke()
  c.fillStyle = C.ink; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(b.text, x + 8, y + 11.5)
  c.restore()
}
// チュートリアルの指（動きで見せる）
function ghost(c, t) {
  const k = G.hint; if (!k || k === 'fork') return
  const ph = (t % 1.6) / 1.6
  let gx, gy
  if (k === 'drag' || k === 'lost') { const p = at(G.W.main, G.head.s + 20 + ph * 130); gx = p.x; gy = p.y }
  else if (k === 'snag') { const p = at(G.W.main, G.head.s + 30 + ph * 30); gx = p.x; gy = p.y }
  else if (k === 'knot' && G.blocked) { gx = G.blocked.x + 22; gy = G.blocked.y + 26 - (ph < 0.3 ? 0 : 4) }
  else if (k === 'knot2' && G.blocked && G.blocked.spread > 0.5) { const kk = G.blocked, i = kk.order.find(i => !kk.strands[i].gone); if (i == null) return; const a = kk.strands[i].ang, d = -50 + ph * 100; gx = kk.x + Math.cos(a) * d; gy = kk.y + Math.sin(a) * d }
  else return
  c.save(); c.globalAlpha = Math.min(1, Math.sin(ph * Math.PI) * 2.2); c.translate(gx, gy)
  c.fillStyle = C.white; c.strokeStyle = C.ink; c.lineWidth = 2.2; c.lineJoin = 'round'; c.shadowColor = 'rgba(35,44,87,.45)'; c.shadowBlur = 6
  c.beginPath(); c.moveTo(0, 0); c.lineTo(-3, 4); c.lineTo(-3, 22); c.quadraticCurveTo(-12, 16, -14, 22); c.quadraticCurveTo(-8, 30, -2, 40); c.lineTo(16, 40); c.quadraticCurveTo(20, 30, 20, 24); c.lineTo(20, 14); c.quadraticCurveTo(14, 10, 10, 14); c.quadraticCurveTo(6, 8, 3, 12); c.lineTo(3, 4); c.closePath(); c.fill(); c.stroke()
  c.restore()
}

// ---- 画面の切り替え
const VIEWS = ['vLoad', 'vTitle', 'vPlay', 'vResult']
function show(id) { for (const v of VIEWS) $('#' + v).hidden = v !== id }
function applyLang() {
  const T = U()
  document.documentElement.lang = lang
  const tt = T.title
  $('#tTitle').innerHTML = lang === 'ja' ? '運命の<span class="r">赤い糸</span>を<br>たどれ' : 'Follow the<br><span class="r">Red String</span>'
  $('#tSub').textContent = T.sub; $('#bStart').textContent = T.start; $('#bHow').textContent = T.how; $('#bBook').textContent = T.book; $('#bLang').textContent = T.lang
  $('#lMore').textContent = T.more; $('#lPriv').textContent = T.privacy
  $('#howTitle').textContent = T.howTitle; document.querySelectorAll('.rules li').forEach((li, i) => { li.querySelector('b').textContent = T.rules[i][0]; li.querySelector('span').textContent = T.rules[i][1] })
  $('#howFoot').textContent = T.howFoot; $('#howCredit').textContent = T.credit; $('#bHowClose').textContent = T.back; $('#bBookClose').textContent = T.back; $('#bookTitle').textContent = T.bookTitle
  $('#bAgain').textContent = T.again; $('#bBookR').textContent = T.book; $('#bPost').textContent = T.post; $('#bSave').textContent = T.save
  $('#pTitle').textContent = T.paused; $('#bResume').textContent = T.resume; $('#bQuit').textContent = T.quit
  $('#loadTxt').textContent = T.load
  document.title = tt
}
const ICON_ON = '<svg width="18" height="16" viewBox="0 0 18 16"><path d="M1 5h4l5-4v14l-5-4H1z" fill="#232c57"/><path d="M12.5 4.5c1.6 2 1.6 5 0 7M14.8 2.5c2.6 3.2 2.6 7.8 0 11" fill="none" stroke="#232c57" stroke-width="1.5" stroke-linecap="round"/></svg>'
const ICON_OFF = '<svg width="18" height="16" viewBox="0 0 18 16"><path d="M1 5h4l5-4v14l-5-4H1z" fill="#232c57"/><path d="M12 5l5 6M17 5l-5 6" stroke="#232c57" stroke-width="1.6" stroke-linecap="round"/></svg>'
function applyMute() { $('#bMute').innerHTML = $('#bMute2').innerHTML = muted ? ICON_OFF : ICON_ON; Snd.setMute(muted) }
function toggleMute() { muted = !muted; LS.set('mute', muted); applyMute(); Snd.init() }

function toTitle() {
  mode = 'title'; demo = true; newGame((Math.random() * 1e9) | 0); G.head.s = 900; show('vTitle'); paused = false
  Snd.loop('amb', null); Snd.loop('amb2', null)
}
function startGame(seed) {
  Snd.init(); sfx('click', { vol: 0.6 })
  demo = null; newGame(seed == null ? (Math.random() * 1e9) | 0 : seed)
  mode = 'play'; show('vPlay'); $('#vPause').hidden = true; paused = false
  $('#reveal').className = ''; $('#hint').classList.remove('show')
  if (G.tut) setTut('drag')
  Snd.loop('bgm', 'snd/bgm.mp3', 0.12)
  window.TM && TM.start()
}
function toResult() {
  if (mode !== 'play' || !G.reveal) return
  mode = 'result'; sfx('click', { vol: 0.5 })
  const id = G.reveal.id, e = endOf(id)[lang], T = U()
  if (!G.tutDone) { LS.set('tut', 1); G.tutDone = true }
  $('#rLead').innerHTML = ''; $('#rLead').append(T.resLead); if (G.isNew) { const n = document.createElement('span'); n.id = 'rNew'; n.textContent = T.newGot; $('#rLead').append(n) }
  $('#rName').textContent = e.name; $('#rLine').textContent = G.line
  const m = D.START_MIN + Math.min(D.LIMIT_SEC, Math.floor(G.arrT)), arr = G.reveal.timeout ? T.late : `${T.arrive} ${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`
  const book = LS.get('book', {}), n = D.ENDINGS.filter(x => book[x.id]).length
  $('#rStats').innerHTML = `${T.clean} <b>${cleanPct()}%</b>　${arr}　${T.got(n, D.ENDINGS.length)}`
  show('vResult')
  requestAnimationFrame(() => drawPortrait($('#rPic'), id))
  aff()
}
function drawPortrait(cnv, id, opts = {}) {
  const r = cnv.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1)
  const w = Math.max(10, Math.round(r.width * dpr)), h = Math.max(10, Math.round(r.height * dpr))
  cnv.width = w; cnv.height = h
  const c = cnv.getContext('2d'), lock = opts.lock
  c.fillStyle = lock ? '#ddd3bb' : '#e7dcc2'; c.fillRect(0, 0, w, h)
  const s = Math.min(w / 120, h / 140)
  // 足元の床と夕日
  if (!lock) { c.fillStyle = '#e9b48f'; c.beginPath(); c.arc(w * 0.74, h * 0.3, s * 18, 0, TAU); c.fill(); c.fillStyle = 'rgba(35,44,87,.08)'; c.fillRect(0, h * 0.78, w, h * 0.22) }
  c.save(); c.translate(w / 2, h * 0.86); c.scale(s, s)
  if (lock) { c.globalAlpha = 0.5; person(c, { x: 0, y: 0, kind: 'long', h: 1.1, tone: C.mid }, 0); c.fillStyle = C.paper; c.font = '14px ' + SANS; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('?', 0, -74) }
  else {
    // 自分から伸びてきた糸
    drawEnding(c, id, 0, 0, 1.2, 1)
  }
  c.restore()
  c.fillStyle = c.createPattern(grain, 'repeat'); c.fillRect(0, 0, w, h)
}

// ---- PR（結果画面だけ。AFF_URL が空なら出さない）
function aff() {
  const box = $('#affBox'), url = window.AFF_URL || '', T = U()
  if (!url || mode !== 'result') { box.hidden = true; $('#bAff').removeAttribute('href'); return }
  $('#bAff').href = url; $('#affTxt').textContent = T.affBtn; $('#affNote').textContent = T.affNote; box.hidden = false
}

// ---- 図鑑
function openBook() {
  const book = LS.get('book', {}), T = U(), grid = $('#bookGrid'); grid.innerHTML = ''
  const n = D.ENDINGS.filter(x => book[x.id]).length
  $('#bookCount').textContent = T.got(n, D.ENDINGS.length)
  $('#ovBook').hidden = false
  for (const e of D.ENDINGS) {
    const got = !!book[e.id], cell = document.createElement('div'); cell.className = 'cell' + (got ? '' : ' lock')
    cell.innerHTML = `<canvas></canvas><b></b><i></i>`
    cell.querySelector('b').textContent = got ? e[lang].name : T.locked
    cell.querySelector('i').textContent = got ? '' : e[lang].hint
    grid.appendChild(cell)
  }
  requestAnimationFrame(() => [...grid.children].forEach((cell, i) => drawPortrait(cell.querySelector('canvas'), D.ENDINGS[i].id, { lock: cell.classList.contains('lock') })))
}

// ---- 結果の画像
function shareCanvas() {
  const W = 1080, H = 1350, c2 = document.createElement('canvas'); c2.width = W; c2.height = H
  const c = c2.getContext('2d'), id = G.reveal.id, e = endOf(id)[lang], T = U()
  c.fillStyle = C.paper; c.fillRect(0, 0, W, H); c.strokeStyle = C.ink; c.lineWidth = 4; c.strokeRect(36, 36, W - 72, H - 72); c.lineWidth = 1.5; c.strokeRect(50, 50, W - 100, H - 100)
  c.fillStyle = C.ink; c.font = '58px ' + BRUSH; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(T.title, W / 2, 140)
  c.font = '700 34px ' + SANS; c.fillStyle = C.ink2; c.fillText(T.resLead, W / 2, 230)
  const pc = document.createElement('canvas'); pc.style.width = '800px'; pc.style.height = '700px'; document.body.appendChild(pc); pc.style.position = 'fixed'; pc.style.left = '-2000px'
  drawPortrait(pc, id); c.drawImage(pc, 140, 270, 800, 700); pc.remove()
  c.fillStyle = C.ink; c.font = '82px ' + BRUSH; c.fillText(e.name.length > 12 ? e.name.slice(0, 12) : e.name, W / 2, 1060)
  c.font = '700 40px ' + SANS; c.fillStyle = C.ink2; c.fillText(G.line, W / 2, 1140)
  c.font = '30px ' + SANS; c.fillText(`${T.clean} ${cleanPct()}%`, W / 2, 1210)
  c.fillStyle = C.red; c.font = '26px ' + SANS; c.fillText('tom3games.github.io/akai-ito', W / 2, 1265)
  return c2
}
function saveImage() {
  window.TM && TM.share('save')
  const c2 = shareCanvas()
  c2.toBlob(b => { if (!b) return; const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'akai-ito.png'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000) })
}
function post() {
  window.TM && TM.share('x')
  const e = endOf(G.reveal.id)[lang], T = U()
  const u = 'https://x.com/intent/post?text=' + encodeURIComponent(T.share(e.name, cleanPct()) + '\n' + T.tag) + '&url=' + encodeURIComponent('https://tom3games.github.io/akai-ito/')
  window.open(u, '_blank', 'noopener')
}

// ---- ボタン
const on = (sel, fn) => $(sel).addEventListener('click', e => { e.stopPropagation(); fn(e) })
on('#bStart', () => startGame())
on('#bAgain', () => startGame())
on('#bHow', () => { sfx('click', { vol: 0.4 }); $('#ovHow').hidden = false })
on('#bHowClose', () => { $('#ovHow').hidden = true })
on('#bBook', () => openBook()); on('#bBookR', () => openBook()); on('#bBookClose', () => { $('#ovBook').hidden = true })
on('#bLang', () => { lang = lang === 'ja' ? 'en' : 'ja'; LS.set('lang', lang); applyLang() })
on('#bMute', toggleMute); on('#bMute2', toggleMute)
on('#bPause', () => { paused = true; $('#vPause').hidden = false; G.finger.down = false; G.gesture = null })
on('#bResume', () => { paused = false; $('#vPause').hidden = true })
on('#bQuit', () => { $('#vPause').hidden = true; toTitle() })
on('#bPost', post); on('#bSave', saveImage)
$('#bAff').addEventListener('click', () => { window.TM && TM.aff && TM.aff() })
document.addEventListener('click', e => { if (e.target && e.target.closest && e.target.closest('#tmSupport')) window.TM && TM.support() })
document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'play' && G && !G.reveal) { paused = true; $('#vPause').hidden = false; G.finger.down = false } })
$('#vPlay').addEventListener('click', () => { if (G && G.reveal && G.reveal.t > 3.0) toResult() })

// ---- 読み込み（本物の数で進む）
async function boot() {
  applyLang(); applyMute()
  const files = ['snd/cloth1.mp3', 'snd/creak1.mp3', 'snd/swish1.mp3', 'snd/snap.mp3', 'snd/pluck1.mp3', 'snd/click.mp3', 'snd/crowd.mp3', 'snd/drumroll.mp3', 'snd/jing_good.mp3']
  const jobs = [document.fonts ? document.fonts.load('30px "Yuji Syuku"', '運命の赤い糸をたどれ') : Promise.resolve(), document.fonts ? document.fonts.load('700 14px "BIZ UDPGothic"', 'あ') : Promise.resolve()].concat(files.map(f => fetch(f).then(r => r.arrayBuffer())))
  let done = 0; const total = jobs.length
  const bar = $('#loadBar')
  await Promise.race([Promise.all(jobs.map(j => j.catch(() => {}).then(() => { done++; bar.style.width = (done / total * 100) + '%' }))), new Promise(r => setTimeout(r, 12000))])
  toTitle()
  window.__akaiReady = true
}
requestAnimationFrame(frame)
boot()

// ---- 検証用の窓口
window.akai = {
  input: IN,
  state: () => G && ({ mode, s: G.head.s, br: G.head.br, len: G.W.main.len, time: G.time, clean: cleanPct(), snaps: G.snaps, wrong: G.wrong, decoys: { ...G.decoys }, tension: G.tension, blocked: !!G.blocked, loose: G.blocked ? G.blocked.loose : 0, band: G.band, reveal: G.reveal && { id: G.reveal.id, t: G.reveal.t, timeout: G.reveal.timeout }, hint: G.hint, trap: !!G.trap, reel: !!G.reel, v: G.v }),
  start: seed => startGame(seed),
  toScreen: (x, y) => toScreen(x, y),
  headXY: () => { const p = headPos(); return toScreen(p.x, p.y) },
  // 正しい道の先（lead 先）。分かれ道の先も本物の糸をたどる
  aheadXY: lead => { const p = G.head.br ? at(curPath(), G.head.s + lead) : at(G.W.main, G.head.s + lead); return toScreen(p.x, p.y) },
  branchXY: (lead) => { const fk = G.W.forks.find(f => !f.passed && f.s > G.head.s - 1); if (!fk) return null; const b = fk.branches.find(b => !b.cut); if (!b) return null; const d = G.head.s + lead - fk.s; const p = d > 0 ? at(b.P, d) : at(G.W.main, G.head.s + lead); return toScreen(p.x, p.y) },
  nextFork: () => { const fk = G.W.forks.find(f => !f.passed && f.s > G.head.s - 1); return fk ? { ds: fk.s - G.head.s, n: fk.branches.filter(b => !b.cut).length, types: fk.branches.map(b => b.type) } : null },
  knotInfo: () => { const k = G.blocked; if (!k) return null; const c = toScreen(k.x, k.y); return { x: c.x, y: c.y, loose: k.loose, spread: k.spread, left: k.order.filter(i => !k.strands[i].gone).map(i => k.strands[i].ang), allLeft: k.strands.map((s, i) => ({ i, ang: s.ang, gone: s.gone })) } },
  nextSnag: () => { const sn = G.W.snags.find(s => s.s1 > G.head.s); return sn ? { ds0: sn.s0 - G.head.s, ds1: sn.s1 - G.head.s } : null },
  nextKnotDs: () => { const k = G.W.knots.find(k => !k.done && k.s > G.head.s - 1); return k ? k.s - G.head.s : null },
  toResult: () => toResult(),
  aff, endOf, SC: () => SC,
  portrait: (id, w, h) => { const c = document.createElement('canvas'); c.style.cssText = `position:fixed;left:-3000px;width:${w}px;height:${h}px`; document.body.appendChild(c); drawPortrait(c, id); const u = c.toDataURL('image/png'); c.remove(); return u },
  forceEnd: (id) => { G.forceId = id; startReveal(id === 'jihanki') },
  dbg: { pause: b => { dbgPaused = b }, step: n => { for (let i = 0; i < n; i++) step() }, render: () => render(performance.now() / 1000) },
  W: () => G.W, G: () => G,
}
})()
