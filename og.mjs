import './mute-auto.mjs'
// SNS 用の og.png（1200x630）。遊んでいる場面（分かれ道で偽物の糸と猫）＋結末の絵＋タイトル。node og.mjs
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { botStep } from './bot.mjs'
const ROOT = import.meta.dirname, PORT = 6464
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH)
const ctx = await b.newContext({ locale: 'ja-JP', viewport: { width: 390, height: 700 }, deviceScaleFactor: 2 })
await muteContext(ctx)
const p = await ctx.newPage()
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__akaiReady)
await p.addScriptTag({ content: `window.__bot = ${botStep.toString()}` })
// 偽物の糸が 2 本ある分かれ道の手前で止める
const seed = +(process.argv[2] || 31)
await p.evaluate(s => { localStorage.setItem('akai_tut', '1'); akai.dbg.pause(true); akai.start(s) }, seed)
await p.evaluate(() => { const mem = {}; for (let i = 0; i < 60 * 120; i++) { const f = akai.nextFork(); if (f && f.n >= 2 && f.ds < 70 && akai.state().band >= 2) break; __bot('careful', mem, i); akai.dbg.step(1) } const h = akai.headXY(); akai.input.up(h.x, h.y); akai.G().bubbles = []; akai.dbg.render() })
await p.waitForTimeout(2600)
await p.evaluate(() => akai.dbg.render())
const shot = (await p.screenshot({ clip: { x: 0, y: 70, width: 390, height: 540 } })).toString('base64')
const pic = await p.evaluate(() => akai.portrait('jihanki', 300, 340))
const html = `<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Yuji+Syuku&family=BIZ+UDPGothic:wght@700&display=swap" rel="stylesheet"><style>
*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;background:#efe5cf;position:relative;overflow:hidden;font-family:"BIZ UDPGothic",sans-serif;color:#232c57}
.play{position:absolute;left:0;top:0;width:470px;height:630px;background:url(data:image/png;base64,${shot}) center/cover;border-right:4px solid #232c57}
h1{position:absolute;left:520px;top:54px;font:400 76px/1.08 "Yuji Syuku",serif;letter-spacing:.01em}
h1 .r{color:#d3202e}
.sub{position:absolute;left:524px;top:258px;font-size:26px;line-height:1.5;color:#46507a}
.pic{position:absolute;right:46px;bottom:40px;width:250px;height:283px;border:3px solid #232c57;background:url(${pic}) center/cover;transform:rotate(3deg);box-shadow:6px 8px 0 rgba(35,44,87,.35)}
.cap{position:absolute;left:524px;bottom:58px;font:400 40px/1.25 "Yuji Syuku",serif}
.cap small{display:block;font:700 22px/1.5 "BIZ UDPGothic",sans-serif;color:#46507a}
.stamp{position:absolute;left:524px;bottom:196px;width:62px;height:62px;border:4px solid #d3202e;color:#d3202e;font:400 42px/54px "Yuji Syuku",serif;text-align:center;transform:rotate(-8deg)}
</style></head><body><div class="play"></div><h1>運命の<span class="r">赤い糸</span>を<br>たどれ</h1><div class="sub">結び目をほどき、偽物の糸を避けて<br>小指の糸の先へ。結末は9種類。</div><div class="stamp">縁</div><div class="cap"><small>糸の先にいたのは</small>自販機でした</div><div class="pic"></div></body></html>`
const q = await (await b.newContext({ viewport: { width: 1200, height: 630 } })).newPage()
await q.setContent(html, { waitUntil: 'networkidle' }); await q.evaluate(() => document.fonts.ready)
await q.screenshot({ path: `${ROOT}/og.png` })
console.log('og.png')
await b.close(); server.kill()
