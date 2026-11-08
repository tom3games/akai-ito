import './mute-auto.mjs'
// 運命の赤い糸をたどれ の検証。node verify.mjs
import { chromium, webkit } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { botStep } from './bot.mjs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 6461
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const URL0 = `http://localhost:${PORT}/`
const AFF = 'https://ac.cross-system.com/H558ec8Ha0ffaf0N/cl/?bId=ea9Uac13&param4=A3503_00'
let pass = 0, fail = 0
const results = []
async function t(name, fn) {
  try { const r = await fn(); if (r === false) throw new Error('false'); pass++; results.push(`ok   ${name}${r && r !== true ? '  ' + JSON.stringify(r) : ''}`) }
  catch (e) { fail++; results.push(`FAIL ${name}  ${e.message.split('\n')[0]}`) }
}
const expect = (c, msg) => { if (!c) throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg)) }
async function open(browser, opts = {}, init) {
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 }, ...opts })
  await muteContext(ctx)
  await ctx.addInitScript(() => { try { localStorage.clear() } catch (e) {} })
  if (init) await ctx.addInitScript(init)
  await ctx.route(/cross-system\.com|x\.com/, r => r.abort())
  const p = await ctx.newPage(); p.errs = []
  p.on('pageerror', e => p.errs.push('pageerror ' + e.message))
  p.on('console', m => { if (m.type() === 'error') p.errs.push('console ' + m.text()) })
  p.on('requestfailed', r => { if (!/fonts\.(googleapis|gstatic)|cross-system|x\.com/.test(r.url())) p.errs.push('reqfail ' + r.url()) })
  await p.goto(URL0); await p.waitForFunction(() => window.__akaiReady, null, { timeout: 15000 })
  await p.addScriptTag({ content: `window.__bot = ${botStep.toString()}` })
  return p
}
const overflow = p => p.evaluate(() => {
  const W = document.documentElement.clientWidth, bad = []
  for (const el of document.querySelectorAll('main:not([hidden]) *, .ovl:not([hidden]) *')) {
    if (el.closest('[hidden]') || (el.checkVisibility && !el.checkVisibility({ visibilityProperty: true }))) continue
    const r = el.getBoundingClientRect(); if (r.width && (r.right > W + 1 || r.left < -1)) bad.push((el.id || el.className.baseVal || el.className || el.tagName) + ':' + Math.round(r.left) + '-' + Math.round(r.right))
  }
  return { sw: document.documentElement.scrollWidth, W, bad: bad.slice(0, 5) }
})
const fit = q => q.evaluate(() => {
  const H = innerHeight, de = document.documentElement, over = []
  if (de.scrollHeight > H + 1) over.push('page:' + de.scrollHeight)
  for (const el of document.querySelectorAll('main:not([hidden]) button,main:not([hidden]) a,main:not([hidden]) canvas,.ovl:not([hidden]) button,.ovl:not([hidden]) .cell,.ovl:not([hidden]) li,#affBox:not([hidden]) small')) {
    if (el.closest('[hidden]')) continue; const r = el.getBoundingClientRect(); if (!r.width) continue
    if (r.bottom > H + 1 || r.top < -1) over.push((el.id || el.className) + ':' + Math.round(r.top) + '-' + Math.round(r.bottom))
  }
  for (const el of document.querySelectorAll('.ovl:not([hidden]) .sheet, #slip')) { if (el.closest('[hidden]')) continue; if (el.scrollHeight > el.clientHeight + 2) over.push('scroll:' + (el.id || el.className)) }
  return { H, over: over.slice(0, 6) }
})
// bot で条件まで進める（入力は akai.input = 本物と同じ関数）
const run = (p, cond, kind = 'careful', max = 60 * 200) => p.evaluate(([cond, kind, max]) => { const f = new Function('st', 'return ' + cond); const mem = window.__mem || (window.__mem = {}); for (let i = 0; i < max; i++) { const st = akai.state(); if (f(st)) return st; __bot(kind, mem, i); akai.dbg.step(1) } return akai.state() }, [cond, kind, max])
const freshRun = async (p, seed) => { await p.evaluate(s => { window.__mem = {}; akai.dbg.pause(true); akai.start(s) }, seed) }
const visible = (p, sel) => p.evaluate(sel => { const e = document.querySelector(sel); return !!e && !e.closest('[hidden]') && e.getBoundingClientRect().height > 0 }, sel)
const texts = p => p.evaluate(() => ['#hint.show', '#card.show'].filter(s => { const e = document.querySelector(s); return e && getComputedStyle(e).opacity > 0.05 }).length)

const browser = await chromium.launch(MUTE_LAUNCH)
const p = await open(browser, { hasTouch: false })
await t('起動: ロード画面が消えてタイトル・エラーなし', async () => {
  const r = await p.evaluate(() => ({ load: document.querySelector('#vLoad').hidden, title: !document.querySelector('#vTitle').hidden, err: !!document.querySelector('#boot-err'), bar: document.querySelector('#loadBar').style.width }))
  expect(p.errs.length === 0 && r.load && r.title && !r.err && r.bar === '100%', p.errs.join('|') + JSON.stringify(r)); return r
})
await t('ブラウザの拡大が起きない（viewport・ピンチ・Ctrl+ホイール・Ctrl+プラス）', async () => {
  const r = await p.evaluate(() => {
    const vp = document.querySelector('meta[name=viewport]').content
    const g = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(g)
    const w = new WheelEvent('wheel', { ctrlKey: true, deltaY: -10, bubbles: true, cancelable: true }); window.dispatchEvent(w)
    const k = new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true, cancelable: true }); window.dispatchEvent(k)
    return { vp, gesture: g.defaultPrevented, wheel: w.defaultPrevented, key: k.defaultPrevented, ta: getComputedStyle(document.documentElement).touchAction, us: getComputedStyle(document.body).userSelect }
  })
  expect(/user-scalable=no/.test(r.vp) && r.gesture && r.wheel && r.key && r.ta === 'manipulation' && r.us === 'none', r)
})
await t('OGP 一式と og.png（1200x630）', async () => {
  const r = await p.evaluate(async () => { const m = k => document.querySelector(`meta[property="${k}"]`)?.content; const img = new Image(); img.src = 'og.png'; await img.decode().catch(() => {}); return { t: m('og:title'), i: m('og:image'), u: m('og:url'), d: m('og:description'), tw: document.querySelector('meta[name="twitter:card"]')?.content, w: img.naturalWidth, h: img.naturalHeight } })
  expect(r.t && /akai-ito\/og\.png$/.test(r.i) && /akai-ito\/$/.test(r.u) && r.d && r.tw === 'summary_large_image' && r.w === 1200 && r.h === 630, r); return { w: r.w, h: r.h }
})
await t('遊び方と図鑑が開いて閉じる（図鑑は未発見に手がかり）', async () => {
  await p.click('#bHow'); const how = await p.evaluate(() => ({ open: !document.querySelector('#ovHow').hidden, rules: [...document.querySelectorAll('.rules b')].map(b => b.textContent) }))
  await p.click('#bHowClose'); await p.click('#bBook')
  const book = await p.evaluate(() => ({ cells: document.querySelectorAll('.cell').length, locked: document.querySelectorAll('.cell.lock').length, hint: document.querySelector('.cell i').textContent }))
  await p.click('#bBookClose')
  expect(how.open && how.rules.length === 3 && book.cells === 9 && book.locked === 9 && book.hint, { how, book }); return { rules: how.rules, cells: book.cells }
})

// ---- 本物のマウスでなぞる
await t('マウス: 糸の先をなぞると進む・チュートリアルの指示が出る', async () => {
  await p.click('#bStart'); await p.waitForTimeout(300)
  const hint0 = await p.evaluate(() => akai.state().hint)
  const h = await p.evaluate(() => akai.headXY()); await p.mouse.move(h.x, h.y); await p.mouse.down()
  for (let i = 0; i < 40; i++) { const a = await p.evaluate(() => akai.aheadXY(80)); await p.mouse.move(a.x, a.y, { steps: 2 }); await p.waitForTimeout(30) }
  await p.mouse.up()
  const st = await p.evaluate(() => akai.state())
  expect(hint0 === 'drag' && st.s > 300 && st.time > 0.5, { hint0, st }); return { s: Math.round(st.s), hint0 }
})
await t('マウス: 糸から離れた所をなぞっても進まない', async () => {
  const s0 = await p.evaluate(() => akai.state().s)
  const h = await p.evaluate(() => akai.headXY()); const x = h.x > 195 ? 30 : 360
  await p.mouse.move(x, h.y - 200); await p.mouse.down()
  for (let i = 0; i < 15; i++) { await p.mouse.move(x, h.y - 220 - i * 4); await p.waitForTimeout(30) }
  await p.mouse.up()
  const s1 = await p.evaluate(() => akai.state().s)
  expect(Math.abs(s1 - s0) < 3, { s0, s1 }); return { s0: Math.round(s0), s1: Math.round(s1) }
})
await t('無音（始めた後・Chromium）と音は呼ばれている', async () => {
  const r = await p.evaluate(() => ({ ok: window.__muteOk(), calls: window.__soundCalls, played: Object.values(Snd.played).reduce((a, b) => a + b, 0), states: Snd.ctx && Snd.ctx.state }))
  expect(r.ok && r.played > 0 && r.states !== 'running', r); return r
})
// 引っかかり: 速く引くとぷつっ寸前・ゆっくりなら平気（本物のマウスで指を置き、時間だけ dbg で進める）
await t('マウス: 引っかかりを全力で引くと「ぷつっ」寸前、ゆっくりなら平気', async () => {
  await freshRun(p, 777)
  await run(p, '(() => { const n = akai.nextSnag(); return n && n.ds0 < 90 })()')
  await p.evaluate(() => { const h = akai.headXY(); akai.input.up(h.x, h.y) })
  const fast = async lead => { let a = await p.evaluate(l => akai.aheadXY(l), lead); await p.mouse.move(a.x, a.y); await p.mouse.down(); for (let i = 0; i < 90; i++) { a = await p.evaluate(l => akai.aheadXY(l), lead); await p.mouse.move(a.x, a.y); await p.evaluate(() => akai.dbg.step(1)); const n = await p.evaluate(() => akai.nextSnag()); if (!n || n.ds1 < -5) break } await p.mouse.up() }
  await fast(200)
  const a = await p.evaluate(() => akai.state())
  await run(p, '(() => { const n = akai.nextSnag(); return n && n.ds0 < 90 && n.ds0 > 40 })()')
  await p.evaluate(() => { const h = akai.headXY(); akai.input.up(h.x, h.y) })
  const snaps0 = a.snaps
  await fast(26)
  const b2 = await p.evaluate(() => akai.state())
  expect(a.snaps >= 1 && a.clean < 100 && b2.snaps === snaps0, { a: a.snaps, b: b2.snaps }); return { fastSnaps: a.snaps, slowSnaps: b2.snaps - snaps0 }
})
// 結び目: タップでゆるめ、上の糸から本物のマウスではらう
await t('マウス: 結び目をタップでゆるめ、下の糸を先にはらうと締まる・上からならほどける', async () => {
  await freshRun(p, 778)
  await run(p, 'st.blocked')
  await p.evaluate(() => { const h = akai.headXY(); akai.input.up(h.x, h.y) })
  const k = await p.evaluate(() => akai.knotInfo())
  await p.mouse.click(k.x, k.y); await p.evaluate(() => akai.dbg.step(20))
  const k1 = await p.evaluate(() => akai.knotInfo())
  const sw = async ang => { const d = 60 * await p.evaluate(() => akai.SC()); await p.mouse.move(k1.x - Math.cos(ang) * d, k1.y - Math.sin(ang) * d); await p.mouse.down(); await p.mouse.move(k1.x, k1.y, { steps: 3 }); await p.mouse.move(k1.x + Math.cos(ang) * d, k1.y + Math.sin(ang) * d, { steps: 3 }); await p.mouse.up(); await p.evaluate(() => akai.dbg.step(10)) }
  const w0 = (await p.evaluate(() => akai.state())).wrong
  await sw(k1.left[k1.left.length - 1])
  const w1 = (await p.evaluate(() => akai.state())).wrong
  for (let i = 0; i < 4; i++) { const kk = await p.evaluate(() => akai.knotInfo()); if (!kk) break; await sw(kk.left[0]) }
  const st = await p.evaluate(() => akai.state())
  expect(k1.loose && k1.left.length >= 2 && w1 === w0 + 1 && !st.blocked, { k1: k1.left.length, w0, w1, st: st.blocked }); return { strands: k1.left.length, wrongAfterBottom: w1 - w0, untied: !st.blocked }
})
await t('マウス: 結び目で引き続けると締まって「ぷつっ」寸前', async () => {
  await freshRun(p, 779)
  await run(p, 'st.blocked')
  const s0 = (await p.evaluate(() => akai.state())).snaps
  let a = await p.evaluate(() => akai.aheadXY(150)); await p.mouse.move(a.x, a.y); await p.mouse.down()
  for (let i = 0; i < 150; i++) { await p.evaluate(() => akai.dbg.step(1)); const st = await p.evaluate(() => akai.state()); if (st.snaps > s0) break }
  await p.mouse.up()
  const st = await p.evaluate(() => akai.state())
  expect(st.snaps === s0 + 1, st); return { snaps: st.snaps - s0 }
})
// 分かれ道: 偽物の糸をなぞると寄り道のワナ → 分かれ道に戻される
await t('マウス: 偽物の糸に乗るとワナ（小芝居）→ 分かれ道に戻り、偽物は消える', async () => {
  await freshRun(p, 780)
  await run(p, '(() => { const f = akai.nextFork(); return f && f.ds < 120 })()')
  await p.evaluate(() => { const h = akai.headXY(); akai.input.up(h.x, h.y) })
  let a = await p.evaluate(() => akai.branchXY(140)); await p.mouse.move(a.x, a.y); await p.mouse.down()
  let trap = false
  for (let i = 0; i < 300; i++) { const st = await p.evaluate(() => akai.state()); if (st.trap) { trap = true; break } a = await p.evaluate(() => akai.state().br ? akai.aheadXY(90) : akai.branchXY(140)); await p.mouse.move(a.x, a.y); await p.evaluate(() => akai.dbg.step(1)) }
  await p.mouse.up()
  await p.evaluate(() => akai.dbg.step(200))
  const st = await p.evaluate(() => akai.state())
  const types = await p.evaluate(() => akai.nextFork())
  const tot = st.decoys.ex + st.decoys.cat + st.decoys.sales
  expect(trap && tot === 1 && !st.br && st.clean <= 85, { trap, st }); return { trap, decoys: st.decoys, clean: st.clean, forkLeft: types && types.n }
})

// ---- 本物のタッチ（Chromium の CDP でタッチを送る）
await p.close()
const tp = await open(browser, { hasTouch: true, isMobile: true, deviceScaleFactor: 2 })
await t('タッチ: 指でなぞると進む（touchStart/Move/End）', async () => {
  await tp.tap('#bStart'); await tp.waitForTimeout(200)
  const cdp = await tp.context().newCDPSession(tp)
  const h = await tp.evaluate(() => akai.headXY())
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: h.x, y: h.y }] })
  for (let i = 0; i < 40; i++) { const a = await tp.evaluate(() => akai.aheadXY(80)); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.x, y: a.y }] }); await tp.waitForTimeout(30) }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  const st = await tp.evaluate(() => akai.state())
  expect(st.s > 300, st); return { s: Math.round(st.s) }
})
await t('タッチ: 結び目をタップでゆるめ、スワイプでほどく', async () => {
  await freshRun(tp, 781); await run(tp, 'st.blocked')
  await tp.evaluate(() => { const h = akai.headXY(); akai.input.up(h.x, h.y) })
  const cdp = await tp.context().newCDPSession(tp)
  const k = await tp.evaluate(() => akai.knotInfo())
  await tp.touchscreen.tap(k.x, k.y); await tp.evaluate(() => akai.dbg.step(20))
  const loose = (await tp.evaluate(() => akai.knotInfo())).loose
  for (let i = 0; i < 4; i++) {
    const kk = await tp.evaluate(() => akai.knotInfo()); if (!kk) break
    const ang = kk.left[0], d = 60 * await tp.evaluate(() => akai.SC())
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: kk.x - Math.cos(ang) * d, y: kk.y - Math.sin(ang) * d }] })
    for (let j = 1; j <= 6; j++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: kk.x - Math.cos(ang) * d + Math.cos(ang) * d * 2 * j / 6, y: kk.y - Math.sin(ang) * d + Math.sin(ang) * d * 2 * j / 6 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await tp.evaluate(() => akai.dbg.step(10))
  }
  const st = await tp.evaluate(() => akai.state())
  expect(loose && !st.blocked && st.wrong === 0, st); return { loose: !!loose, untied: !st.blocked }
})
await tp.close()

// ---- 何もしない通しは最低の結末（時間切れ・自販機）
const ip = await open(browser)
await t('何もしない: 21:00 で時間切れ → 自販機（最低）', async () => {
  await freshRun(ip, 900); await run(ip, 'st.reveal', 'idle', 60 * 200)
  const st = await ip.evaluate(() => akai.state())
  expect(st.reveal && st.reveal.id === 'jihanki' && st.reveal.timeout, st); return st.reveal
})
await t('結末の発表は 2 秒ためてから（判定は発表まで見せない）', async () => {
  const r0 = await ip.evaluate(() => document.querySelector('#rvName').textContent)
  await run(ip, 'st.reveal.t > 2.4', 'idle')
  const r1 = await ip.evaluate(() => document.querySelector('#rvName').textContent)
  expect(r0 === '' && r1 === '自販機', { r0, r1 }); return { before: r0, after: r1 }
})
await t('PR は遊び中・発表中には出ない', async () => {
  expect(!(await visible(ip, '#affBox')) && !(await visible(ip, 'a[rel*=sponsored]')), 'visible')
})
await ip.close()

// ---- 丁寧に最後まで → 結果画面（PR・支援・Xポスト・画像保存・計測）
const rp = await open(browser)
await t('丁寧な通し: 寄り道なしで糸の先へ・結果画面', async () => {
  await freshRun(rp, 1234); await run(rp, 'st.reveal && st.reveal.t > 3.2', 'careful', 60 * 200)
  const st = await rp.evaluate(() => akai.state())
  await rp.evaluate(() => akai.dbg.pause(false)); await rp.mouse.click(195, 500); await rp.waitForTimeout(500)
  const v = await rp.evaluate(() => ({ res: !document.querySelector('#vResult').hidden, name: document.querySelector('#rName').textContent, stats: document.querySelector('#rStats').textContent }))
  expect(st.reveal && !st.reveal.timeout && v.res && v.name && /糸のきれいさ/.test(v.stats), { st, v }); return { id: st.reveal.id, t: Math.round(st.time), clean: st.clean, stats: v.stats }
})
await t('結果画面に PR ボタン（PR の字・注記は「17歳以上」だけ・rel=sponsored・新しいタブ・指定のURL）', async () => {
  const r = await rp.evaluate(() => { const a = document.querySelector('#bAff'), b = document.querySelector('#affBox'), cs = getComputedStyle(a.querySelector('.pr')), ct = getComputedStyle(a.querySelector('#affTxt')); const rr = a.getBoundingClientRect(); return { vis: !b.hidden && rr.height > 0 && rr.bottom <= innerHeight, href: a.href, rel: a.rel, target: a.target, pr: a.querySelector('.pr').textContent, prSize: parseFloat(cs.fontSize), txtSize: parseFloat(ct.fontSize), txt: a.textContent, note: document.querySelector('#affNote').textContent, count: document.querySelectorAll('a[rel*=sponsored]').length } })
  expect(r.vis && r.href === AFF && /sponsored/.test(r.rel) && /noopener/.test(r.rel) && r.target === '_blank' && r.pr === 'PR' && r.prSize >= 12 && r.prSize >= r.txtSize - 2 && r.txt.includes('現実の運命の人、占ってみる？') && r.note === '17歳以上' && r.count === 1 && !/当たる|必ず|今だけ/.test(r.txt + r.note), r)
  return { txt: r.txt, note: r.note, prSize: r.prSize, txtSize: r.txtSize }
})
await t('PR ボタンを押すと aff_click を記録（遷移先は止めて確かめる）', async () => {
  const [pop] = await Promise.all([rp.context().waitForEvent('page', { timeout: 3000 }).catch(() => null), rp.click('#bAff')])
  if (pop) await pop.close()
  const n = await rp.evaluate(() => window.__tmLog.filter(e => e.name === 'aff_click').length); expect(n === 1, n); return { aff_click: n }
})
await t('支援ボタン「作者に糸こんにゃくをおごる」・計測（start/end）', async () => {
  const r = await rp.evaluate(() => ({ s: document.querySelector('#tmSupport')?.textContent, ev: window.__tmLog.map(e => e.name) }))
  expect(r.s === '作者に糸こんにゃくをおごる' && r.ev.includes('game_start') && r.ev.includes('game_end'), r); return r.s
})
await t('Xでポスト（intent・結果の名前とハッシュタグ・URL）', async () => {
  const u = await rp.evaluate(() => { let got = ''; const o = window.open; window.open = x => { got = x }; document.querySelector('#bPost').click(); window.open = o; return got })
  const d = decodeURIComponent(u)
  expect(/^https:\/\/x\.com\/intent\/post\?text=/.test(u) && /#運命の赤い糸をたどれ/.test(d) && /tom3games\.github\.io\/akai-ito/.test(d), d); return d.slice(0, 80)
})
await t('画像を保存（1080x1350 の png がダウンロードされる）', async () => {
  const [dl] = await Promise.all([rp.waitForEvent('download', { timeout: 5000 }), rp.click('#bSave')])
  const path = await dl.path(); const buf = readFileSync(path)
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20)
  expect(dl.suggestedFilename() === 'akai-ito.png' && w === 1080 && h === 1350, { w, h }); return { w, h }
})
await t('図鑑に結果が入る・もう一回で新しい道（くじ）', async () => {
  const before = await rp.evaluate(() => JSON.stringify(akai.W().main.pts.slice(150, 400).map(p => Math.round(p.x))))
  const book = await rp.evaluate(() => JSON.parse(localStorage.getItem('akai_book')))
  await rp.click('#bAgain'); await rp.waitForTimeout(200)
  const after = await rp.evaluate(() => JSON.stringify(akai.W().main.pts.slice(150, 400).map(p => Math.round(p.x))))
  const r = await rp.evaluate(() => ({ play: !document.querySelector('#vPlay').hidden, aff: document.querySelector('#affBox').checkVisibility(), hint: akai.state().hint }))
  expect(Object.keys(book).length === 1 && before !== after && r.play && !r.aff && r.hint === '', { book, r }); return { book, tutorialOnlyFirst: r.hint === '' }
})
await t('結末9種がすべて描ける（図鑑の絵が空でない）', async () => {
  const r = await rp.evaluate(async () => {
    localStorage.setItem('akai_book', JSON.stringify(Object.fromEntries(AKAI.ENDINGS.map(e => [e.id, 1]))))
    document.querySelector('#bBookR').click(); await new Promise(r => setTimeout(r, 300))
    const out = [...document.querySelectorAll('.cell canvas')].map(c => { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0; for (let i = 0; i < d.length; i += 16) if (d[i] < 90 && d[i + 2] > 60) ink++; return ink })
    document.querySelector('#bBookClose').click(); return out
  })
  expect(r.length === 9 && r.every(n => n > 15), r); return r
})
await rp.close()

// ---- 結末の決まり方（どの bot で何が出るか）
const dp = await open(browser)
await t('結末の判定: 寄り道2回→その相手 / 結び目4回まちがい→鏡 / きれいさで美形・おじいちゃん・幹事', async () => {
  // decide は内部関数なので、状態を作って発表させて見る
  const cases = [
    [{ decoys: { ex: 2, cat: 0, sales: 0 }, last: 'ex', clean: 70 }, 'ex'], [{ decoys: { ex: 1, cat: 1, sales: 0 }, last: 'cat', clean: 70 }, 'cat'], [{ decoys: { ex: 0, cat: 0, sales: 2 }, last: 'sales', clean: 70 }, 'sales'],
    [{ wrong: 4, clean: 76 }, 'mirror'], [{ clean: 100, time: 85 }, 'other'], [{ clean: 100, time: 130 }, 'bishou'], [{ clean: 88, decoys: { ex: 1, cat: 0, sales: 0 }, time: 80 }, 'bishou'], [{ clean: 60 }, 'jiji'], [{ clean: 30 }, 'kanji'],
  ]
  const got = []
  for (const [o, want] of cases) {
    const id = await dp.evaluate(o => { akai.dbg.pause(true); akai.start(5); const G = akai.G(); Object.assign(G, { decoys: { ex: 0, cat: 0, sales: 0 }, wrong: 0, clean: 100, time: 90, last: null }, o); G.head.s = G.W.main.len - 2; akai.dbg.step(1); return akai.state().reveal && akai.state().reveal.id }, o)
    got.push(id === want ? want : `${want}!=${id}`)
  }
  expect(got.every(g => !g.includes('!=')), got); return got
})
await t('チュートリアルの文字は同時に1つ・場面の札が出ている間は隠れる', async () => {
  await dp.evaluate(() => { localStorage.removeItem('akai_tut'); akai.dbg.pause(false) })
  await dp.click('#bStart').catch(() => {}); await dp.evaluate(() => { akai.start(42) }); await dp.waitForTimeout(400)
  const n1 = await texts(dp)
  await dp.waitForTimeout(2200)
  const n2 = await texts(dp), hint = await dp.evaluate(() => document.querySelector('#hint').textContent)
  expect(n1 <= 1 && n2 === 1 && /なぞる/.test(hint), { n1, n2, hint }); return { duringCard: n1, after: n2, hint }
})
await t('一時停止（タブを離れたら止まる）', async () => {
  const t0 = await dp.evaluate(() => akai.state().time)
  await dp.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')) })
  await dp.waitForTimeout(600)
  const t1 = await dp.evaluate(() => akai.state().time), pv = await dp.evaluate(() => !document.querySelector('#vPause').hidden)
  expect(pv && t1 - t0 < 0.2, { t0, t1, pv }); return { paused: pv }
})
await dp.close()

// ---- 英語
const ep = await open(browser, { locale: 'en-US' })
await t('英語: タイトル・遊び方・遊び中・結果・PR が英語', async () => {
  const title = await ep.evaluate(() => document.querySelector('#tTitle').textContent)
  await freshRun(ep, 55); await run(ep, 'st.reveal && st.reveal.t > 3.2', 'careful', 60 * 200)
  await ep.evaluate(() => { akai.toResult() })
  const r = await ep.evaluate(() => ({ slip: document.querySelector('#slip').innerText, pr: document.querySelector('#affBox').innerText }))
  expect(/Red String/.test(title) && /Again/.test(r.slip) && /PR/.test(r.pr) && /Ages 17\+/.test(r.pr) && !/[ぁ-んァ-ヶ一-龠]/.test(r.slip.replace('縁', '')), { title, r }); return { title, pr: r.pr.replace(/\n/g, ' ') }
})
await ep.close()

// ---- AFF_URL が空なら PR は何も出さない
{
  const ctx = await browser.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 844 } }); await muteContext(ctx)
  await ctx.route(/config\.js/, r => r.fulfill({ contentType: 'text/javascript', body: "window.AFF_URL = ''" }))
  const z = await ctx.newPage(); await z.goto(URL0); await z.waitForFunction(() => window.__akaiReady)
  await z.addScriptTag({ content: `window.__bot = ${botStep.toString()}` })
  await t('AFF_URL が空: 結果画面に PR ボタンも注記も出ない', async () => {
    await freshRun(z, 66); await run(z, 'st.reveal && st.reveal.t > 3.2', 'careful', 60 * 200); await z.evaluate(() => akai.toResult())
    const r = await z.evaluate(() => ({ hidden: document.querySelector('#affBox').hidden, href: document.querySelector('#bAff').getAttribute('href'), note: document.body.innerText.includes('17歳以上'), res: !document.querySelector('#vResult').hidden }))
    expect(r.res && r.hidden && !r.href && !r.note, r); return r
  })
  await ctx.close()
}

// ---- 3サイズ × 全画面で一画面に収まる
for (const [w, h, name] of [[360, 640, 'small'], [390, 844, 'phone'], [430, 932, 'max']]) {
  const q = await open(browser, { viewport: { width: w, height: h }, deviceScaleFactor: 2 })
  const views = {}
  views.title = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-title.png` })
  await q.click('#bHow'); views.how = await fit(q); await q.screenshot({ path: `${ROOT}/shots/fit-${name}-how.png` }); await q.click('#bHowClose')
  await q.click('#bBook'); views.book = await fit(q); await q.click('#bBookClose')
  await q.click('#bStart'); await q.waitForTimeout(300); views.play = await fit(q)
  await q.evaluate(() => { window.__mem = {}; akai.dbg.pause(true) })
  await run(q, 'st.blocked'); await q.evaluate(() => { const h = akai.headXY(); akai.input.up(h.x, h.y); const k = akai.knotInfo(); akai.input.down(k.x, k.y); akai.input.up(k.x, k.y); akai.dbg.step(20); akai.dbg.render() })
  await q.screenshot({ path: `${ROOT}/shots/fit-${name}-knot.png` })
  const knotIn = await q.evaluate(() => { const k = akai.knotInfo(), sc = akai.SC(); return k.x - 86 * sc > -2 && k.x + 86 * sc < innerWidth + 2 && k.y > 40 && k.y < innerHeight - 40 })
  await run(q, 'st.reveal && st.reveal.t > 3.2', 'careful', 60 * 200); await q.evaluate(() => akai.dbg.render()); views.reveal = await fit(q)
  await q.screenshot({ path: `${ROOT}/shots/fit-${name}-reveal.png` })
  await q.evaluate(() => { akai.toResult(); akai.dbg.pause(false) }); await q.waitForTimeout(500); views.result = await fit(q)
  await q.screenshot({ path: `${ROOT}/shots/fit-${name}-result.png` })
  for (const [v, r] of Object.entries(views)) await t(`一画面に収まる ${name} ${w}x${h} ${v}`, async () => { expect(!r.over.length, r) })
  await t(`${name}: 結び目が画面内・はみ出し・エラーなし`, async () => { const o = await overflow(q); expect(knotIn && o.sw <= o.W && !o.bad.length && !q.errs.length, { knotIn, o, e: q.errs }) })
  await q.close()
}
await browser.close()

// ---- WebKit（iPhone 相当）でタッチの通し
const wb = await webkit.launch(), wp = await open(wb, { isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
await t('WebKit: タップで始めて、なぞると進む（マウス操作）', async () => {
  const b = await wp.evaluate(() => { const r = document.querySelector('#bStart').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })
  await wp.touchscreen.tap(b.x, b.y); await wp.waitForTimeout(300)
  const h = await wp.evaluate(() => akai.headXY()); await wp.mouse.move(h.x, h.y); await wp.mouse.down()
  for (let i = 0; i < 40; i++) { const a = await wp.evaluate(() => akai.aheadXY(80)); await wp.mouse.move(a.x, a.y); await wp.waitForTimeout(30) }
  await wp.mouse.up()
  const st = await wp.evaluate(() => akai.state()); expect(st.mode === 'play' && st.s > 250, st); return { s: Math.round(st.s) }
})
await t('WebKit: 結び目をタップでゆるめる', async () => {
  await wp.evaluate(() => { window.__mem = {}; akai.dbg.pause(true) }); await run(wp, 'st.blocked')
  await wp.evaluate(() => { const h = akai.headXY(); akai.input.up(h.x, h.y) })
  const k = await wp.evaluate(() => akai.knotInfo()); await wp.touchscreen.tap(k.x, k.y)
  const l = await wp.evaluate(() => akai.knotInfo().loose); expect(l, l)
})
await t('WebKit: 2本指の touchmove を止める', async () => {
  const r = await wp.evaluate(() => { const e = new Event('touchmove', { cancelable: true, bubbles: true }); Object.defineProperty(e, 'touches', { value: [{}, {}] }); document.body.dispatchEvent(e); return e.defaultPrevented }); expect(r, r)
})
await t('WebKit: 実際には無音（タップで音を鳴らしたあと）', async () => { const r = await wp.evaluate(() => ({ ok: window.__muteOk(), played: Object.values(Snd.played).reduce((a, b) => a + b, 0) })); expect(r.ok && r.played > 0, r); return r })
await t('WebKit: 結果まで通してエラーなし', async () => {
  await run(wp, 'st.reveal && st.reveal.t > 3.2', 'careful', 60 * 200); await wp.evaluate(() => { akai.toResult(); akai.dbg.pause(false) }); await wp.waitForTimeout(400)
  await wp.screenshot({ path: `${ROOT}/shots/webkit-result.png` })
  const r = await wp.evaluate(() => ({ res: !document.querySelector('#vResult').hidden, pr: document.querySelector('#bAff').href }))
  expect(r.res && r.pr === AFF && wp.errs.length === 0, { r, e: wp.errs }); return r.res
})
await wb.close()

// ---- 文言の禁止語
await t('禁止語がない（AI・画像生成・当たる・必ず・今だけ）', async () => {
  const src = ['index.html', 'data.js', 'game.js', 'privacy.html'].map(f => readFileSync(ROOT + '/' + f, 'utf8')).join('\n')
  const visibleText = src.replace(/\/\/.*$/gm, '')
  const bad = ['画像生成', '当たる', '必ず', '今だけ'].filter(w => visibleText.includes(w)).concat(/[^A-Za-z]AI[^A-Za-z]/.test(visibleText.replace(/AFF_URL|GADApplication/g, '')) ? ['AI'] : [])
  expect(!bad.length, bad)
})
server.kill()
console.log(results.join('\n'))
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
