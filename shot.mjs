import './mute-auto.mjs'
// 場面ごとのスクショ（台本どおりに進めて撮る）。node shot.mjs [幅] [高さ]
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { botStep } from './bot.mjs'
const ROOT = import.meta.dirname
mkdirSync(ROOT + '/shots', { recursive: true })
const PORT = 6463
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const w = +(process.argv[2] || 390), h = +(process.argv[3] || 844), lang = process.argv[4] || 'ja'
const b = await chromium.launch(MUTE_LAUNCH)
const ctx = await b.newContext({ locale: lang === 'en' ? 'en-US' : 'ja-JP', viewport: { width: w, height: h }, deviceScaleFactor: 2 })
await muteContext(ctx)
const p = await ctx.newPage(); const errs = []
p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()) })
await p.goto(`http://localhost:${PORT}/`)
await p.waitForFunction(() => window.__akaiReady, null, { timeout: 15000 })
await p.waitForTimeout(500)
const tag = `${w}x${h}${lang === 'en' ? '-en' : ''}`
await p.screenshot({ path: `${ROOT}/shots/s-${tag}-title.png` })
await p.evaluate(() => { akai.dbg.pause(true); akai.start(4242) })
await p.addScriptTag({ content: `window.__bot = ${botStep.toString()}` })
// 台本: 進めて、場面ごとに止めて撮る
const snap = async name => { await p.evaluate(() => akai.dbg.render()); await p.screenshot({ path: `${ROOT}/shots/s-${tag}-${name}.png` }) }
const run = (cond, kind, max = 60 * 200) => p.evaluate(([cond, kind, max]) => { const f = new Function('st', 'return ' + cond); const mem = {}; for (let i = 0; i < max; i++) { const st = akai.state(); if (f(st)) return st; __bot(kind, mem, i); akai.dbg.step(1) } return akai.state() }, [cond, kind, max])
await run('st.s > 200', 'careful'); await snap('play-start')
await run('st.tension > 0.5 || st.blocked', 'reckless'); await snap('tension')
await run('st.blocked', 'careful'); await snap('knot-tight')
await p.evaluate(() => { const k = akai.knotInfo(); akai.input.down(k.x, k.y); akai.input.up(k.x, k.y); akai.dbg.step(30) }); await snap('knot-loose')
await run('!st.blocked', 'careful')
await run('st.trap', 'decoy'); await p.evaluate(() => akai.dbg.step(30)); await snap('trap')
await run('st.band >= 1', 'careful'); await p.evaluate(() => akai.dbg.step(20)); await snap('arcade')
await run('st.band >= 2', 'careful'); await snap('party')
await run('st.band >= 3', 'careful'); await snap('wedding')
await run('st.band >= 4', 'careful'); await snap('river')
await run('st.reveal && st.reveal.t > 1', 'careful', 60 * 400); await snap('reveal-pre')
await run('st.reveal && st.reveal.t > 3.2', 'careful'); await snap('reveal')
await p.evaluate(() => { akai.toResult(); akai.dbg.pause(false) }); await p.waitForTimeout(500)
await p.screenshot({ path: `${ROOT}/shots/s-${tag}-result.png` })
await p.evaluate(() => { localStorage.setItem('akai_book', JSON.stringify(Object.fromEntries(AKAI.ENDINGS.map(e => [e.id, 1])))) })
await p.click('#bBookR'); await p.waitForTimeout(400); await p.screenshot({ path: `${ROOT}/shots/s-${tag}-book.png` })
console.log(JSON.stringify(await p.evaluate(() => akai.state())), errs.join('\n'))
await b.close(); server.kill()
