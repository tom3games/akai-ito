// 遊び方の違う bot。ページの中で 1 コマごとに呼ぶ（入力は本物と同じ akai.input を通る）
// careful: 人の速さ。引っかかりで緩め、結び目は上から、偽物の糸に乗らない
// sloppy: 速め。引っかかりで緩めるのは半分、分かれ道で 3 割まちがえる、結び目の順は 3 割まちがえる
// human: 丁寧だが遅め。引っかかりの1割・分かれ道の1割・結び目の1割でまちがえる
// reckless: いつも全力で引く。分かれ道はでたらめ、結び目もでたらめな順
// decoy: 分かれ道で必ず偽物へ（撮影用） / idle: 何もしない
export function botStep(kind, mem, i) {
  const st = akai.state(), I = akai.input
  if (!mem.init) { mem.init = 1; mem.wait = 0; mem.fork = {}; mem.R = (() => { let a = (mem.seed || 1234) | 0; return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 } })() }
  const R = mem.R
  if (kind === 'idle') return
  const lift = () => { if (mem.down) { const h = akai.headXY(); I.up(h.x, h.y); mem.down = 0 } }
  if (st.mode !== 'play' || st.reveal || st.trap || st.reel) { lift(); return }
  if (mem.wait > 0) { mem.wait--; return }
  const sc = akai.SC()
  // 結び目
  if (st.blocked) {
    if (kind === 'reckless' && (mem.pullKnot = (mem.pullKnot || 0) + 1) < 50) { /* 気づかず引き続ける */ }
    else {
      lift()
      const k = akai.knotInfo()
      if (!mem.knotSeen) { mem.knotSeen = 1; mem.wait = kind === 'careful' ? 30 : kind === 'human' ? 45 : kind === 'sloppy' ? 18 : 8; return }
      if (!k.loose) { I.down(k.x, k.y); I.up(k.x + 1, k.y); mem.wait = kind === 'careful' ? 24 : kind === 'human' ? 36 : 12; return }
      if (k.spread < 1) return
      let ang = k.left[0]
      const wrong = kind === 'reckless' ? R() < 0.6 : kind === 'sloppy' ? R() < 0.3 : kind === 'human' ? R() < 0.1 : false
      if (wrong && k.left.length > 1) ang = k.left[1 + Math.floor(R() * (k.left.length - 1))]
      const d = 60 * sc, x0 = k.x - Math.cos(ang) * d, y0 = k.y - Math.sin(ang) * d
      I.down(x0, y0); I.move(x0 + Math.cos(ang) * d, y0 + Math.sin(ang) * d); I.move(x0 + Math.cos(ang) * d * 2, y0 + Math.sin(ang) * d * 2); I.up(x0 + Math.cos(ang) * d * 2, y0 + Math.sin(ang) * d * 2)
      mem.wait = kind === 'careful' ? 36 : kind === 'human' ? 54 : kind === 'sloppy' ? 22 : 10
      return
    }
  } else { mem.knotSeen = 0; mem.pullKnot = 0 }
  // どのくらい先をつまむか
  let lead = kind === 'careful' ? 92 : kind === 'human' ? 62 : kind === 'sloppy' ? 110 : 200
  const sn = akai.nextSnag()
  if (sn && sn.ds0 < 50 && sn.ds1 > -2) {
    if (mem.snagId !== sn.ds1 + st.s) { mem.snagId = sn.ds1 + st.s; mem.slow = kind === 'careful' ? true : kind === 'human' ? R() < 0.9 : kind === 'sloppy' ? R() < 0.5 : false }
    if (mem.slow) lead = 26
  }
  // 分かれ道: 本物を選ぶか
  const fk = akai.nextFork()
  let tgt
  if (!st.br && fk && fk.ds < 160 && fk.n > 0) {
    const key = Math.round(st.s + fk.ds) + '_' + fk.n
    if (mem.fork[key] == null) mem.fork[key] = kind === 'decoy' ? 1 : kind === 'reckless' ? (R() < fk.n / (fk.n + 1) ? 1 : 0) : kind === 'sloppy' ? (R() < 0.3 ? 1 : 0) : kind === 'human' ? (R() < 0.1 ? 1 : 0) : 0
    if (mem.fork[key]) tgt = akai.branchXY(Math.min(lead, fk.ds + 60))
  }
  if (!tgt) tgt = akai.aheadXY(lead)
  // 人の指は少しぶれる
  const jx = (R() - 0.5) * (kind === 'reckless' ? 10 : 5) * sc, jy = (R() - 0.5) * 5 * sc
  if (!mem.down) { I.down(tgt.x + jx, tgt.y + jy); mem.down = 1 } else I.move(tgt.x + jx, tgt.y + jy)
}
