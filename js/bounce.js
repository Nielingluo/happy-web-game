;(() => {
  'use strict'

  const ASSETS = '../assets/sprites'
  const GAME_TIME = 60
  const MAX_PROJECTILES = 1
  const SHOOT_SPEED = 880
  const KNOCK_SPEED = 720

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
    dog_face: { file: 'dog_face.png', r: 26 },
    rabbit_head: { file: 'rabbit_head.png', r: 24 },
    happy_fish: { file: 'happy_fish.png', r: 22 },
    giant_eye: { file: 'giant_eye.png', r: 24 },
    eye_bug: { file: 'eye_bug.png', r: 25 },
    toothy_monster: { file: 'toothy_monster.png', r: 23 },
    spiral_snail: { file: 'spiral_snail.png', r: 20 },
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

  function sfx(key, fromGesture = false) {
    if (!window.GameAudio) return
    if (fromGesture) GameAudio.playFromGesture(key)
    else GameAudio.play(key)
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
        x = rand(r + 24, W - r - 24)
        y = rand(r + 36, H * 0.68)
        tries++
      } while (tries < 40 && bodies.some((b) => !b.projectile && Math.hypot(b.x - x, b.y - y) < b.r + r + 10))

      bodies.push({
        type,
        projectile: false,
        knocked: false,
        x,
        y,
        vx: 0,
        vy: 0,
        r,
        rot: rand(0, Math.PI * 2),
        spin: rand(-0.4, 0.4),
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
    const r = scaledR(20)
    bodies.push({
      type: 'spiky_puff',
      projectile: true,
      x: launcher.x,
      y: launcher.y,
      vx: (dx / len) * SHOOT_SPEED,
      vy: (dy / len) * SHOOT_SPEED,
      r,
      rot: 0,
      spin: rand(-6, 6),
      life: 1.2,
    })
    sfx('pop', true)
  }

  function circlesHit(a, b) {
    const dist = Math.hypot(b.x - a.x, b.y - a.y)
    return dist < a.r + b.r
  }

  function knockMonster(proj, monster) {
    const len = Math.hypot(proj.vx, proj.vy) || 1
    monster.vx = (proj.vx / len) * KNOCK_SPEED
    monster.vy = (proj.vy / len) * KNOCK_SPEED
    monster.knocked = true
    monster.spin = rand(-6, 6)
    shakeTimer = 0.14
    burst(monster.x, monster.y)
    sfx('bounce', true)
  }

  function addPopup(text, x, y, color = '#8b3a1a') {
    popups.push({ text, x, y, life: 1, color })
  }

  function burst(x, y) {
    for (let i = 0; i < 7; i++) {
      const a = rand(0, Math.PI * 2)
      const sp = rand(90, 220)
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
    addPopup(`+${gained}`, b.x, b.y, '#2a7a3b')
  }

  function trySpawnMonster() {
    if (bodies.filter((b) => !b.projectile).length >= 6) return
    const type = MONSTER_TYPES[Math.floor(Math.random() * MONSTER_TYPES.length)]
    const def = MONSTER_DEFS[type]
    const r = scaledR(def.r)
    const side = Math.floor(Math.random() * 4)
    let x = 0
    let y = 0
    if (side === 0) {
      x = rand(r + 20, W - r - 20)
      y = H + r + 8
    } else if (side === 1) {
      x = -r - 8
      y = rand(r + 20, H - r - 20)
    } else if (side === 2) {
      x = W + r + 8
      y = rand(r + 20, H - r - 20)
    } else {
      x = rand(r + 20, W - r - 20)
      y = -r - 8
    }
    bodies.push({
      type,
      projectile: false,
      knocked: false,
      x,
      y,
      vx: 0,
      vy: 0,
      r,
      rot: rand(0, Math.PI * 2),
      spin: rand(-0.4, 0.4),
    })
  }

  function update(dt) {
    if (paused) return

    timeLeft -= dt
    if (timeLeft <= 0) {
      timeLeft = 0
      endGame()
      return
    }

    for (let i = bodies.length - 1; i >= 0; i--) {
      const proj = bodies[i]
      if (!proj.projectile) continue
      for (let j = bodies.length - 1; j >= 0; j--) {
        if (i === j) continue
        const monster = bodies[j]
        if (monster.projectile || monster.knocked) continue
        if (circlesHit(proj, monster)) {
          knockMonster(proj, monster)
          bodies.splice(i, 1)
          break
        }
      }
    }

    for (let i = bodies.length - 1; i >= 0; i--) {
      const b = bodies[i]
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.rot += b.spin * dt

      if (b.projectile) {
        b.life -= dt
        if (
          b.life <= 0 ||
          b.x < -b.r - 10 ||
          b.x > W + b.r + 10 ||
          b.y < -b.r - 10 ||
          b.y > H + b.r + 10
        ) {
          bodies.splice(i, 1)
        }
        continue
      }

      if (!b.knocked) {
        b.vx *= 0.9
        b.vy *= 0.9
        if (b.x - b.r < 0) {
          b.x = b.r
          b.vx = Math.abs(b.vx) * 0.2
        } else if (b.x + b.r > W) {
          b.x = W - b.r
          b.vx = -Math.abs(b.vx) * 0.2
        }
        if (b.y - b.r < 0) {
          b.y = b.r
          b.vy = Math.abs(b.vy) * 0.2
        } else if (b.y + b.r > H) {
          b.y = H - b.r
          b.vy = -Math.abs(b.vy) * 0.2
        }
        continue
      }

      const margin = 20
      if (b.x < -margin || b.x > W + margin || b.y < -margin || b.y > H + margin) {
        onKnocked(b)
        bodies.splice(i, 1)
      }
    }

    if (bodies.filter((b) => !b.projectile && !b.knocked).length < 4 && Math.random() < dt * 0.45) {
      trySpawnMonster()
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
      ctx.shadowColor = 'rgba(61, 46, 34, 0.3)'
      ctx.shadowBlur = 8
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
        if (!b.projectile && !b.knocked) {
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
    if (window.GameAudio) GameAudio.unlock()
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
