;(() => {
  'use strict'

  const ASSETS = '../assets/sprites'
  const GAME_TIME = 60
  const COLS = 3
  const ROWS = 3

  const canvas = document.getElementById('game')
  const ctx = canvas.getContext('2d')
  const scoreEl = document.getElementById('score')
  const timerEl = document.getElementById('timer')
  const hitsEl = document.getElementById('hits')
  const overlay = document.getElementById('overlay')
  const overlayTitle = document.getElementById('overlay-title')
  const overlayMsg = document.getElementById('overlay-msg')
  const overlayRules = document.getElementById('overlay-rules')
  const startBtn = document.getElementById('start-btn')
  const helpBtn = document.getElementById('help-btn')
  const helpModal = document.getElementById('help-modal')
  const helpCloseBtn = document.getElementById('help-close-btn')
  const muteBtn = document.getElementById('mute-btn')
  const shell = document.querySelector('.game-shell')

  const CHAR_DEFS = {
    dog_face: { file: 'dog_face.png', points: 10, sfx: 'bark', weight: 12, stay: 1.15, anim: 'wiggle' },
    rabbit_head: { file: 'rabbit_head.png', points: 12, sfx: 'hop', weight: 12, stay: 1.05, anim: 'hop' },
    happy_fish: { file: 'happy_fish.png', points: 10, sfx: 'catch', weight: 10, stay: 1.0 },
    spiral_snail: { file: 'spiral_snail.png', points: 15, sfx: 'catch', weight: 8, stay: 1.55, anim: 'slow' },
    giant_eye: { file: 'giant_eye.png', points: 12, sfx: 'tap', weight: 10, stay: 1.0 },
    eye_bug: { file: 'eye_bug.png', points: 20, sfx: 'catchSpecial', weight: 6, stay: 0.95 },
    toothy_monster: { file: 'toothy_monster.png', points: 8, sfx: 'catch', weight: 10, stay: 1.05 },
    spiky_puff: { file: 'spiky_puff.png', points: -5, sfx: 'ouch', weight: 14, stay: 1.25, trap: true },
    big_mouth: { file: 'big_mouth.png', points: 30, sfx: 'catchSpecial', weight: 3, stay: 0.85 },
  }

  const CHAR_TYPES = Object.keys(CHAR_DEFS)
  const CONFETTI = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff8fc7', '#9b59b6']

  let W = 400
  let H = 500
  let sizeScale = 1
  const images = {}
  let holes = []
  let running = false
  let paused = false
  let lastTs = 0
  let timeLeft = GAME_TIME
  let score = 0
  let hits = 0
  let nextSpawnIn = 0.8
  let popups = []
  let particles = []

  function loadImage(key, file) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        images[key] = img
        resolve()
      }
      img.onerror = reject
      img.src = `${ASSETS}/${file}`
    })
  }

  async function loadAssets() {
    await Promise.all(CHAR_TYPES.map((t) => loadImage(t, CHAR_DEFS[t].file)))
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v))
  }

  function rand(min, max) {
    return min + Math.random() * (max - min)
  }

  function isMobileView() {
    return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 720
  }

  function fitShellToViewport() {
    if (!shell) return
    const vv = window.visualViewport
    if (!vv) return
    shell.style.height = `${Math.max(320, Math.floor(vv.height) - 4)}px`
    shell.style.marginTop = `${Math.max(0, Math.floor(vv.offsetTop))}px`
  }

  function resizeCanvas() {
    fitShellToViewport()
    const wrap = canvas.parentElement
    const dpr = window.devicePixelRatio || 1
    W = Math.max(280, wrap.clientWidth)
    H = Math.max(240, wrap.clientHeight)
    if (window.visualViewport && isMobileView()) {
      const header = document.querySelector('.game-top')
      const headerH = header ? header.getBoundingClientRect().height : 0
      H = Math.min(H, Math.max(240, Math.floor(window.visualViewport.height - headerH - 14)))
    }
    sizeScale = clamp(W / 360, 0.75, 1.15)
    canvas.width = Math.floor(W * dpr)
    canvas.height = Math.floor(H * dpr)
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.imageSmoothingEnabled = true
    layoutHoles()
  }

  function layoutHoles() {
    holes = []
    const padX = W * 0.06
    const padY = H * 0.05
    const cellW = (W - padX * 2) / COLS
    const cellH = (H - padY * 2) / ROWS
    let id = 0
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const cx = padX + cellW * (col + 0.5)
        const cy = padY + cellH * (row + 0.5)
        holes.push({
          id: id++,
          cx,
          cy,
          w: cellW * 0.82,
          h: cellH * 0.78,
          kind: (row + col) % 2 === 0 ? 'bush' : 'hole',
          occupant: null,
        })
      }
    }
  }

  function sfx(key, fromGesture = false) {
    if (!window.GameAudio) return
    if (fromGesture) GameAudio.playFromGesture(key)
    else GameAudio.play(key)
  }

  function elapsed() {
    return GAME_TIME - timeLeft
  }

  function maxActive() {
    const e = elapsed()
    if (e < 18) return 1
    if (e < 42) return 2
    return 3
  }

  function pickCharType() {
    const total = CHAR_TYPES.reduce((s, t) => s + CHAR_DEFS[t].weight, 0)
    let r = Math.random() * total
    for (const type of CHAR_TYPES) {
      r -= CHAR_DEFS[type].weight
      if (r <= 0) return type
    }
    return 'happy_fish'
  }

  function activeCount() {
    return holes.filter((h) => h.occupant && h.occupant.state !== 'hit').length
  }

  function scheduleSpawn() {
    const e = elapsed()
    const min = clamp(0.55 - e * 0.006, 0.28, 0.55)
    const max = clamp(1.0 - e * 0.008, 0.45, 1.0)
    nextSpawnIn = rand(min, max)
  }

  function spawnMole() {
    if (activeCount() >= maxActive()) return
    const free = holes.filter((h) => !h.occupant)
    if (!free.length) return
    const hole = free[Math.floor(Math.random() * free.length)]
    const type = pickCharType()
    const def = CHAR_DEFS[type]
    hole.occupant = {
      type,
      state: 'rising',
      timer: 0,
      stay: def.stay,
      scale: 0,
      wobble: rand(0, Math.PI * 2),
      hopY: 0,
      flash: 0,
    }
  }

  function addPopup(text, x, y, color = '#8b3a1a') {
    popups.push({ text, x, y, life: 1, color })
  }

  function burst(x, y, good) {
    const n = good ? 6 : 4
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2)
      const sp = rand(60, good ? 160 : 100)
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        r: rand(2, 5),
        color: good ? CONFETTI[i % CONFETTI.length] : '#e74c3c',
      })
    }
  }

  function hitMole(hole) {
    const occ = hole.occupant
    if (!occ || occ.state === 'hit' || occ.scale < 0.35) return false
    const def = CHAR_DEFS[occ.type]
    occ.state = 'hit'
    occ.flash = 0.25
    occ.timer = 0
    score += def.points
    hits += 1
    if (def.trap) sfx('ouch', true)
    else if (def.sfx === 'bark' || def.sfx === 'hop') sfx('catch', true)
    else sfx(def.sfx, true)
    burst(hole.cx, hole.cy - hole.h * 0.12, def.points > 0)
    const sign = def.points >= 0 ? '+' : ''
    addPopup(`${sign}${def.points}`, hole.cx, hole.cy - hole.h * 0.35, def.points < 0 ? '#c0392b' : def.trap ? '#c0392b' : '#2a7a3b')
    if (def.points < 0) addPopup('哎哟!', hole.cx, hole.cy - hole.h * 0.5, '#c0392b')
    return true
  }

  function pointerToGame(clientX, clientY) {
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((clientX - rect.left) / rect.width) * W,
      y: ((clientY - rect.top) / rect.height) * H,
    }
  }

  function tryHit(clientX, clientY) {
    if (!running || paused) return
    if (window.GameAudio) GameAudio.unlock()
    const p = pointerToGame(clientX, clientY)
    for (const hole of holes) {
      const occ = hole.occupant
      if (!occ || occ.state === 'hit' || occ.scale < 0.4) continue
      const dx = p.x - hole.cx
      const dy = p.y - (hole.cy - hole.h * 0.1)
      const hitR = hole.w * 0.44
      if (dx * dx + dy * dy <= hitR * hitR) {
        if (hitMole(hole)) return
      }
    }
    sfx('tap', true)
  }

  function update(dt) {
    if (paused) return

    timeLeft -= dt
    if (timeLeft <= 0) {
      timeLeft = 0
      endGame()
      return
    }

    nextSpawnIn -= dt
    if (nextSpawnIn <= 0) {
      spawnMole()
      scheduleSpawn()
    }

    for (const hole of holes) {
      const occ = hole.occupant
      if (!occ) continue
      occ.timer += dt
      occ.wobble += dt * (occ.state === 'hit' ? 20 : 8)

      if (occ.state === 'rising') {
        occ.scale = clamp(occ.timer / 0.14, 0, 1)
        if (occ.scale >= 1) {
          occ.state = 'up'
          occ.timer = 0
          const def = CHAR_DEFS[occ.type]
          if (def.sfx === 'bark' || def.sfx === 'hop') sfx(def.sfx, true)
        }
      } else if (occ.state === 'up') {
        if (CHAR_DEFS[occ.type].anim === 'hop') {
          occ.hopY = -Math.abs(Math.sin(occ.timer * 9)) * hole.h * 0.08
        } else if (CHAR_DEFS[occ.type].anim === 'wiggle') {
          occ.hopY = Math.sin(occ.timer * 14) * 3
        }
        if (occ.timer >= occ.stay) {
          occ.state = 'hiding'
          occ.timer = 0
        }
      } else if (occ.state === 'hiding' || occ.state === 'hit') {
        occ.scale = clamp(1 - occ.timer / 0.12, 0, 1)
        if (occ.scale <= 0) hole.occupant = null
      }
      if (occ.flash > 0) occ.flash -= dt
    }

    for (let i = popups.length - 1; i >= 0; i--) {
      popups[i].y -= 40 * dt
      popups[i].life -= dt
      if (popups[i].life <= 0) popups.splice(i, 1)
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 90 * dt
      p.life -= dt * 1.8
      if (p.life <= 0) particles.splice(i, 1)
    }

    scoreEl.textContent = String(score)
    timerEl.textContent = String(Math.ceil(timeLeft))
    hitsEl.textContent = String(hits)
  }

  function drawPaperBg() {
    ctx.fillStyle = '#f5f0e4'
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(61, 46, 34, 0.06)'
    ctx.lineWidth = 1
    const step = Math.max(22, Math.floor(H / 16))
    for (let y = 0; y < H; y += step) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }
  }

  function scribbleLine(x1, y1, x2, y2, wobble = 3) {
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    const steps = 4
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const x = x1 + (x2 - x1) * t + rand(-wobble, wobble)
      const y = y1 + (y2 - y1) * t + rand(-wobble, wobble)
      ctx.lineTo(x, y)
    }
    ctx.stroke()
  }

  function drawBushBack(hole) {
    const { cx, cy, w, h } = hole
    ctx.fillStyle = 'rgba(120, 160, 80, 0.12)'
    ctx.strokeStyle = '#3d2e22'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(cx, cy + h * 0.08, w * 0.42, h * 0.22, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
  }

  function drawBushFront(hole) {
    const { cx, cy, w, h } = hole
    ctx.strokeStyle = '#3d2e22'
    ctx.lineWidth = 2.2
    ctx.fillStyle = 'rgba(140, 175, 90, 0.2)'
    const tufts = 5
    for (let i = 0; i < tufts; i++) {
      const tx = cx - w * 0.38 + (w * 0.76 * i) / (tufts - 1)
      const ty = cy + h * 0.12
      ctx.beginPath()
      ctx.arc(tx, ty, w * 0.14, Math.PI, 0)
      ctx.fill()
      ctx.stroke()
      scribbleLine(tx - w * 0.08, ty, tx, ty - h * 0.18, 2)
      scribbleLine(tx + w * 0.08, ty, tx, ty - h * 0.16, 2)
    }
    ctx.beginPath()
    ctx.moveTo(cx - w * 0.4, cy + h * 0.14)
    ctx.quadraticCurveTo(cx, cy + h * 0.28, cx + w * 0.4, cy + h * 0.14)
    ctx.stroke()
  }

  function drawHoleBack(hole) {
    const { cx, cy, w, h } = hole
    ctx.fillStyle = '#a08040'
    ctx.strokeStyle = '#3d2e22'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.ellipse(cx, cy + h * 0.1, w * 0.34, h * 0.2, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#2a2018'
    ctx.beginPath()
    ctx.ellipse(cx, cy + h * 0.1, w * 0.22, h * 0.11, 0, 0, Math.PI * 2)
    ctx.fill()
  }

  function drawHoleFront(hole) {
    const { cx, cy, w, h } = hole
    ctx.strokeStyle = '#3d2e22'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(cx, cy + h * 0.02, w * 0.36, Math.PI * 0.15, Math.PI * 0.85)
    ctx.stroke()
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(cx - w * 0.36, cy + h * 0.08)
    ctx.quadraticCurveTo(cx - w * 0.2, cy + h * 0.22, cx, cy + h * 0.18)
    ctx.quadraticCurveTo(cx + w * 0.2, cy + h * 0.22, cx + w * 0.36, cy + h * 0.08)
    ctx.stroke()
  }

  function drawMole(hole) {
    const occ = hole.occupant
    if (!occ || occ.scale <= 0) return
    const img = images[occ.type]
    if (!img) return

    const def = CHAR_DEFS[occ.type]
    const base = hole.w * 0.52 * sizeScale
    const aspect = img.width / img.height
    let dw = base
    let dh = base
    if (aspect > 1) dh = base / aspect
    else dw = base * aspect

    const scale = occ.scale
    const yOff = (occ.hopY || 0) + (def.anim === 'wiggle' ? Math.sin(occ.wobble) * 2 : 0)
    const xOff = def.anim === 'wiggle' ? Math.sin(occ.wobble * 1.4) * 4 : 0
    const drawY = hole.cy - hole.h * 0.02 + yOff

    ctx.save()
    ctx.translate(hole.cx + xOff, drawY)
    ctx.scale(scale, scale)
    if (occ.flash > 0) {
      ctx.globalAlpha = 0.5 + Math.sin(occ.flash * 40) * 0.3
    }
    if (occ.state === 'hit') ctx.rotate(Math.sin(occ.wobble) * 0.15)
    ctx.drawImage(img, -dw / 2, -dh * 0.85, dw, dh)
    ctx.restore()
  }

  function draw() {
    drawPaperBg()

    for (const hole of holes) {
      if (hole.kind === 'bush') drawBushBack(hole)
      else drawHoleBack(hole)
    }

    for (const hole of holes) drawMole(hole)

    for (const hole of holes) {
      if (hole.kind === 'bush') drawBushFront(hole)
      else drawHoleFront(hole)
    }

    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life, 0, 1)
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    ctx.font = `bold ${clamp(W * 0.03, 14, 18)}px Segoe UI, PingFang SC, sans-serif`
    ctx.textAlign = 'center'
    for (const p of popups) {
      ctx.globalAlpha = clamp(p.life, 0, 1)
      ctx.fillStyle = p.color
      ctx.fillText(p.text, p.x, p.y)
      ctx.globalAlpha = 1
    }
  }

  function loop(ts) {
    if (!running) return
    const dt = paused ? 0 : Math.min((ts - lastTs) / 1000, 0.05)
    if (!paused) lastTs = ts
    if (!paused) update(dt)
    draw()
    requestAnimationFrame(loop)
  }

  function startGame() {
    if (window.GameAudio) {
      GameAudio.unlock()
      GameAudio.startBgm()
    }
    sfx('pop')
    score = 0
    hits = 0
    timeLeft = GAME_TIME
    popups = []
    particles = []
    for (const h of holes) h.occupant = null
    scheduleSpawn()
    paused = false
    running = true
    lastTs = performance.now()
    overlay.classList.add('hidden')
    requestAnimationFrame(loop)
  }

  function endGame() {
    running = false
    if (window.GameAudio) GameAudio.stopBgm()
    sfx('gameover')
    overlayRules.classList.add('hidden')
    overlayTitle.textContent = '时间到！'
    overlayMsg.textContent = `你抓住了 ${hits} 只，得分 ${score}！再来一局？`
    startBtn.textContent = '再来一局'
    overlay.classList.remove('hidden')
  }

  function showStart() {
    overlayTitle.textContent = '森林躲猫猫'
    overlayMsg.textContent = '准备好了吗？'
    overlayRules.classList.remove('hidden')
    startBtn.textContent = '开始游戏'
    overlay.classList.remove('hidden')
    resizeCanvas()
    draw()
  }

  function scheduleLayout() {
    fitShellToViewport()
    resizeCanvas()
    draw()
    requestAnimationFrame(() => {
      fitShellToViewport()
      resizeCanvas()
      draw()
    })
    window.setTimeout(() => {
      fitShellToViewport()
      resizeCanvas()
      draw()
    }, 350)
  }

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault()
    tryHit(e.clientX, e.clientY)
  })

  startBtn.addEventListener('click', startGame)
  helpBtn.addEventListener('click', () => {
    sfx('pop')
    if (running) {
      paused = true
      if (window.GameAudio) GameAudio.stopBgm()
    }
    helpModal.classList.remove('hidden')
  })
  helpCloseBtn.addEventListener('click', () => {
    sfx('pop')
    helpModal.classList.add('hidden')
    if (running && paused) {
      paused = false
      lastTs = performance.now()
      if (window.GameAudio && !GameAudio.isMuted()) GameAudio.startBgm()
    }
  })
  muteBtn.addEventListener('click', () => {
    if (!window.GameAudio) return
    const next = !GameAudio.isMuted()
    GameAudio.setMuted(next)
    muteBtn.textContent = next ? '🔇' : '🔊'
    muteBtn.classList.toggle('muted', next)
    if (!next && running) GameAudio.startBgm()
  })

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !running) {
      e.preventDefault()
      startGame()
    }
  })
  window.addEventListener('resize', scheduleLayout)
  window.addEventListener('orientationchange', scheduleLayout)
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleLayout)
    window.visualViewport.addEventListener('scroll', scheduleLayout)
  }

  loadAssets()
    .then(() => {
      scheduleLayout()
      showStart()
    })
    .catch((err) => {
      console.error(err)
      overlayTitle.textContent = '加载失败'
      overlayMsg.textContent = '请确认 assets/sprites 里的图片都在。'
      overlay.classList.remove('hidden')
    })
})()
