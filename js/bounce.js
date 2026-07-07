;(() => {
  'use strict'

  const ASSETS = '../assets/sprites'
  const GAME_TIME = 60
  const MAX_PROJECTILES = 2
  const SHOOT_SPEED = 420
  const WALL_BOUNCE = 0.78
  const FRICTION = 0.992

  const canvas = document.getElementById('game')
  const ctx = canvas.getContext('2d')
  const scoreEl = document.getElementById('score')
  const timerEl = document.getElementById('timer')
  const knockedEl = document.getElementById('knocked')
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

  const MONSTER_DEFS = {
    dog_face: { file: 'dog_face.png', r: 26, mass: 1 },
    rabbit_head: { file: 'rabbit_head.png', r: 24, mass: 0.9 },
    happy_fish: { file: 'happy_fish.png', r: 22, mass: 0.85 },
    giant_eye: { file: 'giant_eye.png', r: 24, mass: 1 },
    eye_bug: { file: 'eye_bug.png', r: 25, mass: 1.05 },
    toothy_monster: { file: 'toothy_monster.png', r: 23, mass: 0.95 },
    spiral_snail: { file: 'spiral_snail.png', r: 20, mass: 1.2 },
  }

  const MONSTER_TYPES = Object.keys(MONSTER_DEFS)
  const CONFETTI = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff8fc7']

  let W = 400
  let H = 500
  let sizeScale = 1
  const images = {}
  let bodies = []
  let launcher = { x: 0, y: 0 }
  let running = false
  let paused = false
  let lastTs = 0
  let timeLeft = GAME_TIME
  let score = 0
  let knocked = 0
  let combo = 0
  let comboTimer = 0
  let popups = []
  let particles = []
  let shakeTimer = 0

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
      loadImage('spiky_puff', 'spiky_puff.png'),
      ...MONSTER_TYPES.map((t) => loadImage(t, MONSTER_DEFS[t].file)),
    ])
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
    launcher.x = W / 2
    launcher.y = H - (isMobileView() ? 14 : 8)
  }

  function sfx(key) {
    if (window.GameAudio) GameAudio.play(key)
  }

  function scaledR(base) {
    return base * sizeScale
  }

  function spawnMonsters() {
    bodies = []
    const count = 6
    for (let i = 0; i < count; i++) {
      const type = MONSTER_TYPES[i % MONSTER_TYPES.length]
      const def = MONSTER_DEFS[type]
      const r = scaledR(def.r)
      let x = 0
      let y = 0
      let tries = 0
      do {
        x = rand(r + 20, W - r - 20)
        y = rand(r + 30, H * 0.72)
        tries++
      } while (tries < 40 && bodies.some((b) => !b.projectile && Math.hypot(b.x - x, b.y - y) < b.r + r + 8))

      bodies.push({
        type,
        projectile: false,
        x,
        y,
        vx: rand(-40, 40),
        vy: rand(-30, 30),
        r,
        mass: def.mass,
        rot: rand(0, Math.PI * 2),
        spin: rand(-1.5, 1.5),
      })
    }
  }

  function projectileCount() {
    return bodies.filter((b) => b.projectile).length
  }

  function shoot(targetX, targetY) {
    if (!running || paused || projectileCount() >= MAX_PROJECTILES) return
    const dx = targetX - launcher.x
    const dy = targetY - launcher.y
    const len = Math.hypot(dx, dy) || 1
    const r = scaledR(22)
    bodies.push({
      type: 'spiky_puff',
      projectile: true,
      x: launcher.x,
      y: launcher.y,
      vx: (dx / len) * SHOOT_SPEED,
      vy: (dy / len) * SHOOT_SPEED,
      r,
      mass: 2.2,
      rot: 0,
      spin: 0,
      life: 4,
    })
    sfx('pop')
  }

  function resolveCollision(a, b) {
    const dx = b.x - a.x
    const dy = b.y - a.y
    const dist = Math.hypot(dx, dy)
    const minDist = a.r + b.r
    if (dist >= minDist || dist === 0) return false

    const nx = dx / dist
    const ny = dy / dist
    const overlap = minDist - dist
    const total = a.mass + b.mass
    a.x -= (nx * overlap * b.mass) / total
    a.y -= (ny * overlap * b.mass) / total
    b.x += (nx * overlap * a.mass) / total
    b.y += (ny * overlap * a.mass) / total

    const dvx = a.vx - b.vx
    const dvy = a.vy - b.vy
    const impact = dvx * nx + dvy * ny
    if (impact <= 0) return false

    const impulse = (2 * impact) / total
    a.vx -= impulse * b.mass * nx
    a.vy -= impulse * b.mass * ny
    b.vx += impulse * a.mass * nx
    b.vy += impulse * a.mass * ny
    return true
  }

  function addPopup(text, x, y, color = '#8b3a1a') {
    popups.push({ text, x, y, life: 1, color })
  }

  function burst(x, y) {
    for (let i = 0; i < 7; i++) {
      const a = rand(0, Math.PI * 2)
      const sp = rand(80, 200)
      particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: 1,
        r: rand(2, 5),
        color: CONFETTI[i % CONFETTI.length],
      })
    }
  }

  function onKnocked(b) {
    const gained = Math.round(15 * (1 + combo * 0.08))
    score += gained
    knocked += 1
    combo += 1
    comboTimer = 2.5
    shakeTimer = 0.18
    burst(b.x, b.y)
    addPopup(`+${gained}`, b.x, b.y, '#2a7a3b')
    sfx('bounce')
  }

  function update(dt) {
    if (paused) return

    timeLeft -= dt
    if (timeLeft <= 0) {
      timeLeft = 0
      endGame()
      return
    }

    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        if (resolveCollision(bodies[i], bodies[j])) {
          sfx('bounce')
        }
      }
    }

    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i]
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.vx *= FRICTION
      b.vy *= FRICTION
      b.rot += b.spin * dt

      if (b.x - b.r < 0) {
        b.x = b.r
        b.vx = Math.abs(b.vx) * WALL_BOUNCE
      } else if (b.x + b.r > W) {
        b.x = W - b.r
        b.vx = -Math.abs(b.vx) * WALL_BOUNCE
      }
      if (b.y - b.r < 0) {
        b.y = b.r
        b.vy = Math.abs(b.vy) * WALL_BOUNCE
      } else if (b.y + b.r > H) {
        b.y = H - b.r
        b.vy = -Math.abs(b.vy) * WALL_BOUNCE
      }

      if (b.projectile) {
        b.life -= dt
        if (b.life <= 0) bodies.splice(i, 1)
        continue
      }

      const margin = 28
      if (b.x < -margin || b.x > W + margin || b.y < -margin || b.y > H + margin) {
        onKnocked(b)
        bodies.splice(i, 1)
      }
    }

    if (bodies.filter((b) => !b.projectile).length < 4 && Math.random() < dt * 0.35) {
      const type = MONSTER_TYPES[Math.floor(Math.random() * MONSTER_TYPES.length)]
      const def = MONSTER_DEFS[type]
      const r = scaledR(def.r)
      const side = Math.floor(Math.random() * 4)
      let x = 0
      let y = 0
      if (side === 0) {
        x = -r
        y = rand(r, H - r)
      } else if (side === 1) {
        x = W + r
        y = rand(r, H - r)
      } else if (side === 2) {
        x = rand(r, W - r)
        y = -r
      } else {
        x = rand(r, W - r)
        y = H + r
      }
      const cx = W / 2
      const cy = H / 2
      const len = Math.hypot(cx - x, cy - y) || 1
      bodies.push({
        type,
        projectile: false,
        x,
        y,
        vx: ((cx - x) / len) * rand(60, 120),
        vy: ((cy - y) / len) * rand(60, 120),
        r,
        mass: def.mass,
        rot: rand(0, Math.PI * 2),
        spin: rand(-1, 1),
      })
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
      p.vy += 70 * dt
      p.life -= dt * 1.6
      if (p.life <= 0) particles.splice(i, 1)
    }
    if (shakeTimer > 0) shakeTimer -= dt
    if (combo > 0) {
      comboTimer -= dt
      if (comboTimer <= 0) combo = 0
    }

    scoreEl.textContent = String(score)
    timerEl.textContent = String(Math.ceil(timeLeft))
    knockedEl.textContent = String(knocked)
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

  function drawBody(b) {
    const img = images[b.type]
    if (!img) return
    const d = b.r * 2.1
    const aspect = img.width / img.height
    let dw = d
    let dh = d
    if (aspect > 1) dh = d / aspect
    else dw = d * aspect

    ctx.save()
    ctx.translate(b.x, b.y)
    ctx.rotate(b.rot)
    if (b.projectile) {
      ctx.shadowColor = 'rgba(61, 46, 34, 0.25)'
      ctx.shadowBlur = 6
    }
    ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh)
    ctx.restore()
  }

  function drawLauncher() {
    const img = images.spiky_puff
    if (!img) return
    const r = scaledR(20)
    const bob = Math.sin(performance.now() * 0.004) * 2
    ctx.save()
    ctx.globalAlpha = 0.55
    ctx.translate(launcher.x, launcher.y + bob)
    ctx.drawImage(img, -r, -r, r * 2, r * 2)
    ctx.restore()
    ctx.strokeStyle = 'rgba(61, 46, 34, 0.2)'
    ctx.lineWidth = 2
    ctx.setLineDash([4, 6])
    ctx.beginPath()
    ctx.arc(launcher.x, launcher.y, r + 6, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
  }

  function draw() {
    const shakeX = shakeTimer > 0 ? Math.sin(shakeTimer * 80) * 4 : 0
    const shakeY = shakeTimer > 0 ? Math.cos(shakeTimer * 60) * 3 : 0

    ctx.save()
    ctx.translate(shakeX, shakeY)
    drawPaperBg()

    for (const b of bodies) {
      if (!b.projectile) drawBody(b)
    }
    drawLauncher()
    for (const b of bodies) {
      if (b.projectile) drawBody(b)
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
    ctx.restore()
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
    knocked = 0
    combo = 0
    comboTimer = 0
    timeLeft = GAME_TIME
    popups = []
    particles = []
    shakeTimer = 0
    spawnMonsters()
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
    overlayMsg.textContent = `弹飞了 ${knocked} 只，得分 ${score}！再来一局？`
    startBtn.textContent = '再来一局'
    overlay.classList.remove('hidden')
  }

  function showStart() {
    overlayTitle.textContent = '刺刺球弹弹乐'
    overlayMsg.textContent = '准备好了吗？'
    overlayRules.classList.remove('hidden')
    startBtn.textContent = '开始游戏'
    overlay.classList.remove('hidden')
    resizeCanvas()
    spawnMonsters()
    draw()
  }

  function scheduleLayout() {
    fitShellToViewport()
    resizeCanvas()
    if (running) {
      for (const b of bodies) {
        if (!b.projectile) {
          b.x = clamp(b.x, b.r, W - b.r)
          b.y = clamp(b.y, b.r, H - b.r)
        }
      }
    }
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
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * W
    const y = ((e.clientY - rect.top) / rect.height) * H
    shoot(x, y)
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
