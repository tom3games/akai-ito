import './mute-auto.mjs'
// 遊び方ごとの結末の分布。node sim.mjs [回数]
// careful（人の速さで丁寧）/ human（丁寧だが遅め・たまにまちがえる）/ sloppy（雑め）/ reckless（全力で引く・でたらめ）/ idle（何もしない）を種を変えて回す
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { MUTE_LAUNCH, muteContext } from './mute.mjs'
import { botStep } from './bot.mjs'
const ROOT = import.meta.dirname, PORT = 6462, N = +(process.argv[2] || 12)
const server = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) } })
await new Promise(r => setTimeout(r, 400))
const b = await chromium.launch(MUTE_LAUNCH), ctx = await b.newContext({ viewport: { width: 390, height: 844 } })
await muteContext(ctx)
const p = await ctx.newPage(); p.on('pageerror', e => console.log('ERR', e.message))
await p.goto(`http://localhost:${PORT}/`); await p.waitForFunction(() => window.__akaiReady, null, { timeout: 15000 })
await p.addScriptTag({ content: `window.__bot = ${botStep.toString()}` })
const out = {}
for (const kind of ['careful', 'human', 'sloppy', 'reckless', 'idle']) {
  const rows = []
  for (let i = 0; i < N; i++) {
    const seed = 1000 + i * 77
    rows.push(await p.evaluate(([kind, seed]) => {
      akai.dbg.pause(true); akai.start(seed)
      const mem = { seed: seed + 5 }
      for (let f = 0; f < 60 * 200; f++) { const st = akai.state(); if (st.reveal) break; __bot(kind, mem, f); akai.dbg.step(1) }
      const st = akai.state(); return { id: st.reveal && st.reveal.id, t: Math.round(akai.G().arrT), clean: st.clean, snaps: st.snaps, wrong: st.wrong, dec: st.decoys.ex + st.decoys.cat + st.decoys.sales }
    }, [kind, seed]))
  }
  const dist = {}; rows.forEach(r => { dist[r.id] = (dist[r.id] || 0) + 1 })
  const avg = k => Math.round(rows.reduce((a, r) => a + r[k], 0) / rows.length * 10) / 10
  out[kind] = { dist, time: avg('t'), clean: avg('clean'), snaps: avg('snaps'), wrong: avg('wrong'), decoys: avg('dec'), tmin: Math.min(...rows.map(r => r.t)), tmax: Math.max(...rows.map(r => r.t)) }
  console.log(kind.padEnd(9), JSON.stringify(out[kind]))
}
await b.close(); server.kill()
