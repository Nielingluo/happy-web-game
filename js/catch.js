;(() => {
  'use strict'

  const ASSETS = '../assets/sprites'

  const canvas = document.getElementById('game')
  const ctx = canvas.getContext('2d')
  const scoreEl = document.getElementById('score')
  const livesEl = document.getElementById('lives')
  const comboEl = document.getElementById('combo')
  const overlay = document.getElementById('overlay')
  const overlayTitle = document.getElementById('overlay-title')
  const overlayMsg = document.getElementById('overlay-msg')
  const overlayRules = document.getElementById('overlay-rules')
  const startBtn = document.getElementById('start-btn')
  const helpBtn = document.getElementById('help-btn')
  const helpModal = document.getElementById('help-modal')
  const helpCloseBtn = document.getElementById('help-close-btn')
  const muteBtn = document.getElementById('mute-btn')

  const MAX_FALLERS = 5
  const SPAWN_MIN = 0.55
  const SPAWN_MAX = 0.85

  const FOOD_DEFS = {
    eye_bug: { file: 'eye_bug.png', points: 20, size: 62, special: true },
    happy_fish: { file: 'happy_fish.png', points: 15, size: 58 },
    rabbit_head: { file: 'rabbit_head.png', points: 12, size: 56 },
    dog_face: { file: 'dog_face.png', points: 14, size: 60 },
    spiky_puff: { file: 'spiky_puff.png', points: 16, size: 56 },
    giant_eye: { file: 'giant_eye.png', points: 12, size: 58 },
    spiral_snail: { file: 'spiral_snail.png', points: 18, size: 50 },
  }

  const FOOD_TYPES = Object.keys(FOOD_DEFS)
  const WEIGHTS = FOOD_TYPES.map((type) => ({ type, w: 1 }))

  let W = 400
  let H = 500
  let GROUND = 0

  const images = {}
  let pointerX = 400
  let running = false
  let lastTs = 0
  let nextSpawnIn = 0.6
  let score = 0
  let lives = 3
  let combo = 0
  let fallers = []
  let popups = []
  let particles = []
  let mouthPhase = 0
  let munchTimer = 0
  let cryTimer = 0
  let paused = false
  let sizeScale = 1

  const BOTTOM_PAD_DESKTOP = 6
  const BOTTOM_PAD_MOBILE = 22

  const player = { x: 200, y: 0, w: 140, h: 78, wobble: 0, drawH: 78 }
  const shell = document.querySelector('.game-shell')

  const CONFETTI_COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff8fc7', '#9b59b6', '#ff9f43']

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
    await Promise.all([
      loadImage('big_mouth', 'big_mouth.png'),
      loadImage('toothy_monster', 'toothy_monster.png'),
      ...FOOD_TYPES.map((t) => loadImage(t, FOOD_DEFS[t].file)),
    ])
  }

  function setupCanvasQuality() {
    ctx.imageSmoothingEnabled = true
    if ('imageSmoothingQuality' in ctx) {
      ctx.imageSmoothingQuality = 'high'
    }
  }

  function scaledSize(base) {
    return Math.round(base * sizeScale)
  }

  function spriteHeight(img, width) {
    if (!img) return width * 0.58
    return img.height * (width / img.width)
  }

  function isMobileView() {
    return window.matchMedia('(pointer: coarse)').matches || window.innerWidth < 720
  }

  function bottomPad() {
    return isMobileView() ? BOTTOM_PAD_MOBILE : BOTTOM_PAD_DESKTOP
  }

  function fitShellToViewport() {
    if (!shell) return
    const vv = window.visualViewport
    if (!vv) return
    const top = Math.max(0, Math.floor(vv.offsetTop))
    const height = Math.max(320, Math.floor(vv.height) - 4)
    shell.style.height = `${height}px`
    shell.style.marginTop = `${top}px`
  }

  function playerMetrics(imgKey, mouthOpen) {
    const img = images[imgKey]
    if (!img) {
      const ph = player.h
      return { ph, scaledH: ph * mouthOpen }
    }
    const ph = spriteHeight(img, player.w)
    return { ph, scaledH: ph * mouthOpen }
  }

  function playerBottomY(crying, munching) {
    const rotPad = crying ? 14 : munching ? 8 : 4
    const cryDrop = crying ? 4 : 0
    return H - bottomPad() - rotPad - cryDrop
  }

  function layoutPlayer() {
    const phMouth = spriteHeight(images.big_mouth, player.w)
    const phToothy = spriteHeight(images.toothy_monster, player.w)
    player.drawH = Math.max(phMouth, phToothy)
    player.h = player.drawH
    GROUND = H - bottomPad()
    player.y = playerBottomY(false, false) - player.drawH
  }

  function resizeCanvas() {
    fitShellToViewport()
    const wrap = canvas.parentElement
    const rect = wrap.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    W = Math.max(280, Math.floor(rect.width))
    H = Math.max(240, Math.floor(rect.height))

    if (window.visualViewport && isMobileView()) {
      const header = document.querySelector('.game-top')
      const headerH = header ? header.getBoundingClientRect().height : 0
      const shellPad = 14
      const maxH = Math.floor(window.visualViewport.height - headerH - shellPad)
      H = Math.min(H, Math.max(240, maxH))
    }
    sizeScale = clamp(W / 360, 0.8, 1.2)
    canvas.width = Math.floor(W * dpr)
    canvas.height = Math.floor(H * dpr)
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    setupCanvasQuality()
    player.w = clamp(W * 0.28, 105, 155)
    layoutPlayer()
    player.x = clamp(pointerX, player.w / 2, W - player.w / 2)
    pointerX = player.x
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v))
  }

  function rand(min, max) {
    return min + Math.random() * (max - min)
  }

  function pickFoodType() {
    const total = WEIGHTS.reduce((s, x) => s + x.w, 0)
    let r = Math.random() * total
    for (const item of WEIGHTS) {
      r -= item.w
      if (r <= 0) return item.type
    }
    return 'happy_fish'
  }

  function fallSpeed() {
    return rand(175, 230) + Math.min(score * 0.08, 40)
  }

  function scheduleSpawn() {
    nextSpawnIn = rand(SPAWN_MIN, SPAWN_MAX)
  }

  function spawnFaller() {
    if (fallers.length >= MAX_FALLERS) return
    const type = pickFoodType()
    const def = FOOD_DEFS[type]
    const size = scaledSize(def.size)
    fallers.push({
      type,
      x: rand(size, W - size),
      y: -size - rand(0, 40),
      size,
      vy: fallSpeed(),
      rot: rand(-0.15, 0.15),
      spin: rand(-0.8, 0.8),
    })
  }

  function sfx(key) {
    if (window.GameAudio) GameAudio.play(key)
  }

  function addPopup(text, x, y, color = '#8b3a1a') {
    popups.push({ text, x, y, life: 1, color })
  }

  function spawnBurstParticles(x, y) {
    const count = 5 + Math.floor(Math.random() * 4)
    for (let i = 0; i < count; i++) {
      const angle = rand(0, Math.PI * 2)
      const speed = rand(90, 200)
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        r: rand(3, 6),
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      })
    }
  }

  function updateComboStyle() {
    let color = '#8b3a1a'
    if (combo >= 15) color = `hsl(${(combo * 22) % 360}, 88%, 50%)`
    else if (combo >= 10) color = '#e84393'
    else if (combo >= 6) color = '#9b59b6'
    else if (combo >= 4) color = '#2980b9'
    else if (combo >= 2) color = '#27ae60'
    else if (combo >= 1) color = '#e67e22'

    comboEl.style.color = color
    comboEl.style.transform = combo >= 5 ? 'scale(1.12)' : combo >= 2 ? 'scale(1.05)' : 'scale(1)'
  }

  function catchBox() {
    const crying = cryTimer > 0
    const munching = munchTimer > 0
    const imgKey = crying ? 'toothy_monster' : 'big_mouth'
    const mouthOpen = munching ? 1.18 : crying ? 0.82 : 1
    const { ph } = playerMetrics(imgKey, mouthOpen)
    const padX = player.w * 0.14
    const bottomY = playerBottomY(crying, munching)
    return {
      x: player.x - player.w / 2 + padX,
      y: bottomY - ph,
      w: player.w - padX * 2,
      h: ph * 0.58,
    }
  }

  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    const pad = 6
    return ax + pad < bx + bw - pad && ax + aw - pad > bx + pad && ay + pad < by + bh - pad && ay + ah - pad > by + pad
  }

  function onCatch(f) {
    const def = FOOD_DEFS[f.type]
    combo += 1
    const gained = Math.round(def.points * (1 + combo * 0.04))
    score += gained
    munchTimer = 0.35
    spawnBurstParticles(f.x, f.y)
    addPopup(`+${gained}`, f.x, f.y - 8, def.special ? '#2a7a3b' : '#8b3a1a')
    if (def.special) {
      sfx('catchSpecial')
      addPopup('嗷呜!', player.x, player.y - 20, '#2a7a3b')
    } else {
      sfx('catch')
    }
  }

  function onMiss(f) {
    lives -= 1
    combo = 0
    cryTimer = 0.9
    sfx('miss')
    addPopup('漏了…', f.x, H - 50, '#b33')
  }

  function update(dt) {
    if (paused) return

    player.x = clamp(pointerX, player.w / 2, W - player.w / 2)
    player.wobble += dt * 6
    mouthPhase += dt * 5

    if (munchTimer > 0) munchTimer -= dt
    if (cryTimer > 0) cryTimer -= dt

    nextSpawnIn -= dt
    if (nextSpawnIn <= 0) {
      spawnFaller()
      scheduleSpawn()
    }

    const box = catchBox()

    for (let i = fallers.length - 1; i >= 0; i--) {
      const f = fallers[i]
      f.y += f.vy * dt
      f.rot += f.spin * dt

      const caught = rectsOverlap(box.x, box.y, box.w, box.h, f.x - f.size / 2, f.y - f.size / 2, f.size, f.size)

      if (caught) {
        onCatch(f)
        fallers.splice(i, 1)
        continue
      }

      if (f.y - f.size / 2 > H + 16) {
        onMiss(f)
        fallers.splice(i, 1)
      }
    }

    for (let i = popups.length - 1; i >= 0; i--) {
      popups[i].y -= 36 * dt
      popups[i].life -= dt
      if (popups[i].life <= 0) popups.splice(i, 1)
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vy += 80 * dt
      p.life -= dt * 1.6
      if (p.life <= 0) particles.splice(i, 1)
    }

    scoreEl.textContent = String(score)
    livesEl.textContent = String(lives)
    comboEl.textContent = String(combo)
    updateComboStyle()

    if (lives <= 0) endGame()
  }

  function drawPaperBg() {
    ctx.fillStyle = '#f5f0e4'
    ctx.fillRect(0, 0, W, H)
    ctx.strokeStyle = 'rgba(61, 46, 34, 0.06)'
    ctx.lineWidth = 1
    const step = Math.max(22, Math.floor(H / 18))
    for (let y = 0; y < H; y += step) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }
  }

  function drawSprite(img, x, y, dw, dh, rot = 0) {
    ctx.save()
    ctx.translate(x, y)
    if (rot) ctx.rotate(rot)
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh)
    ctx.restore()
  }

  function spriteDims(img, size) {
    const aspect = img.width / img.height
    let dw = size
    let dh = size
    if (aspect > 1) dh = size / aspect
    else dw = size * aspect
    return { dw, dh }
  }

  function drawFaller(f) {
    const img = images[f.type]
    if (!img) return
    const { dw, dh } = spriteDims(img, f.size)
    drawSprite(img, f.x, f.y, dw, dh, f.rot)
  }

  function drawPlayer() {
    const crying = cryTimer > 0
    const munching = munchTimer > 0
    const bob = crying ? 0 : Math.sin(player.wobble) * 2
    let px = player.x
    const mouthOpen = munching ? 1.18 : crying ? 0.82 : 0.92 + Math.sin(mouthPhase) * 0.1
    const imgKey = crying ? 'toothy_monster' : 'big_mouth'
    const img = images[imgKey]
    if (!img) return

    const scale = player.w / img.width
    const ph = img.height * scale
    const scaledH = ph * mouthOpen
    const bottomY = playerBottomY(crying, munching) - bob
    const centerY = bottomY - scaledH / 2

    if (crying) {
      px += Math.sin(cryTimer * 28) * 6
    }

    player.y = bottomY - ph

    ctx.save()
    ctx.translate(px, centerY)
    if (crying) ctx.rotate(Math.sin(cryTimer * 18) * 0.12)
    else ctx.rotate((pointerX - px) * 0.0006)
    ctx.scale(1, mouthOpen)
    ctx.drawImage(img, -player.w / 2, -ph / 2, player.w, ph)
    ctx.restore()

    if (crying) {
      ctx.font = `bold ${clamp(player.w * 0.14, 14, 20)}px Segoe UI, PingFang SC, sans-serif`
      ctx.fillStyle = '#5a8fd4'
      ctx.textAlign = 'center'
      ctx.fillText('呜呜…', px, bottomY - ph - 6)
    }
  }

  function draw() {
    drawPaperBg()

    for (const f of fallers) drawFaller(f)

    drawPlayer()

    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life, 0, 1)
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.r * (0.6 + p.life * 0.4), 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    ctx.fillStyle = 'rgba(61, 46, 34, 0.1)'
    ctx.fillRect(0, GROUND, W, H - GROUND)

    ctx.font = `bold ${clamp(W * 0.028, 14, 18)}px Segoe UI, PingFang SC, sans-serif`
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
    lives = 3
    combo = 0
    fallers = []
    popups = []
    particles = []
    munchTimer = 0
    cryTimer = 0
    mouthPhase = 0
    pointerX = W / 2
    player.x = W / 2
    scheduleSpawn()
    paused = false
    running = true
    lastTs = performance.now()
    overlay.classList.add('hidden')
    updateComboStyle()
    requestAnimationFrame(loop)
  }

  function endGame() {
    running = false
    if (window.GameAudio) GameAudio.stopBgm()
    sfx('gameover')
    overlayRules.classList.add('hidden')
    overlayTitle.textContent = '游戏结束'
    overlayMsg.textContent = `最终得分 ${score}，再试一次？`
    startBtn.textContent = '再来一局'
    overlay.classList.remove('hidden')
  }

  function showStart() {
    overlayTitle.textContent = '大嘴接怪'
    overlayMsg.textContent = '准备好了吗？'
    overlayRules.classList.remove('hidden')
    startBtn.textContent = '开始游戏'
    overlay.classList.remove('hidden')
    resizeCanvas()
    drawPaperBg()
    drawPlayer()
  }

  function setPointer(clientX) {
    const rect = canvas.getBoundingClientRect()
    pointerX = ((clientX - rect.left) / rect.width) * W
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId)
    setPointer(e.clientX)
  })
  canvas.addEventListener('pointermove', (e) => setPointer(e.clientX))
  canvas.addEventListener('pointerup', () => {})

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
