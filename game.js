const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const levelText = document.getElementById("levelText");
const goalText = document.getElementById("goalText");
const scoreText = document.getElementById("scoreText");
const heartsWrap = document.getElementById("heartsWrap");
const statusText = document.getElementById("statusText");

const menuOverlay = document.getElementById("menuOverlay");
const howOverlay = document.getElementById("howOverlay");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const winOverlay = document.getElementById("winOverlay");
const gameOverMessage = document.getElementById("gameOverMessage");
const highscoreList = document.getElementById("highscoreList");
const winHighscoreList = document.getElementById("winHighscoreList");

document.getElementById("startBtn").addEventListener("click", startGame);
document.getElementById("howBtn").addEventListener("click", () => howOverlay.classList.remove("hidden"));
document.getElementById("backBtn").addEventListener("click", () => howOverlay.classList.add("hidden"));
document.getElementById("restartBtn").addEventListener("click", startGame);
document.getElementById("menuBtn").addEventListener("click", () => {
  gameOverOverlay.classList.add("hidden");
  menuOverlay.classList.remove("hidden");
});
document.getElementById("playAgainBtn").addEventListener("click", startGame);

// Mobile joystick
const joystickBase = document.getElementById("joystickBase");
const joystickKnob = document.getElementById("joystickKnob");

const WORLD = { w: 3200, h: 2200 };
const HEARTS_MAX = 8;
const GOALS = [1000, 2500, 5000, 7500, 10000, 12500, 15000, 17500, 20000];
const HIGHSCORE_KEY = "porcupine_run_mobile_scores";

let gameRunning = false;
let lastTime = 0;
let player, porcupines, spikes, flowers;
let score = 0;
let levelIndex = 0;
let survivalTimer = 0;
let flowerSpawnTimer = 0;
let animationId = null;

const keys = { up:false, down:false, left:false, right:false };
let touchMove = { x:0, y:0 };

window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowUp") keys.up = true;
  if (e.key === "ArrowDown") keys.down = true;
  if (e.key === "ArrowLeft") keys.left = true;
  if (e.key === "ArrowRight") keys.right = true;
});

window.addEventListener("keyup", (e) => {
  if (e.key === "ArrowUp") keys.up = false;
  if (e.key === "ArrowDown") keys.down = false;
  if (e.key === "ArrowLeft") keys.left = false;
  if (e.key === "ArrowRight") keys.right = false;
});

function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
function dist(ax, ay, bx, by){
  const dx = ax - bx, dy = ay - by;
  return Math.hypot(dx, dy);
}
function rand(min, max){ return Math.random() * (max - min) + min; }

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * window.devicePixelRatio);
  canvas.height = Math.floor(rect.height * window.devicePixelRatio);
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
}
window.addEventListener("resize", resizeCanvas);

function makePlayer() {
  return {
    x: WORLD.w / 2,
    y: WORLD.h / 2,
    r: 18,
    speed: 260,
    hearts: HEARTS_MAX,
    invuln: 0
  };
}

function makePorcupine(x, y) {
  return {
    x, y,
    r: 24,
    speed: 150,
    eatTimer: 0,
    shootTimer: rand(1.1, 2.0)
  };
}

function makeFlower() {
  return {
    x: rand(120, WORLD.w - 120),
    y: rand(120, WORLD.h - 120),
    r: 18,
    active: true
  };
}

function makeSpike(x, y, vx, vy) {
  return { x, y, vx, vy, r: 6, life: 2.5 };
}

function currentGoal() {
  return GOALS[Math.min(levelIndex, GOALS.length - 1)];
}

function renderHearts(count) {
  heartsWrap.innerHTML = "";
  for (let i = 0; i < HEARTS_MAX; i++) {
    const c = document.createElement("canvas");
    c.width = 18;
    c.height = 18;
    c.className = "heart";
    const hctx = c.getContext("2d");

    hctx.save();
    hctx.scale(0.7, 0.7);
    hctx.beginPath();
    hctx.moveTo(10, 18);
    hctx.bezierCurveTo(10, 18, 2, 12, 2, 7);
    hctx.bezierCurveTo(2, 3, 5, 1, 8, 1);
    hctx.bezierCurveTo(10, 1, 12, 2, 13, 4);
    hctx.bezierCurveTo(14, 2, 16, 1, 18, 1);
    hctx.bezierCurveTo(21, 1, 24, 3, 24, 7);
    hctx.bezierCurveTo(24, 12, 16, 18, 16, 18);
    hctx.bezierCurveTo(14, 20, 12, 21, 10, 18);
    hctx.closePath();
    hctx.fillStyle = i < count ? "#ff5d7a" : "rgba(255,255,255,.16)";
    hctx.strokeStyle = "rgba(255,255,255,.22)";
    hctx.lineWidth = 2;
    hctx.fill();
    hctx.stroke();
    hctx.restore();

    heartsWrap.appendChild(c);
  }
}

function setHUD() {
  levelText.textContent = `Level ${levelIndex + 1}`;
  goalText.textContent = `Goal: ${currentGoal()}`;
  scoreText.textContent = `Score: ${Math.floor(score)}`;
  renderHearts(player.hearts);
}

function difficulty() {
  return {
    porcupineSpeed: 150 + levelIndex * 14,
    spikeSpeed: 390 + levelIndex * 24,
    shootBase: Math.max(0.8, 1.7 - levelIndex * 0.07)
  };
}

function resetGameState() {
  player = makePlayer();
  porcupines = [
    makePorcupine(player.x - 260, player.y - 120),
    makePorcupine(player.x + 260, player.y + 150)
  ];
  spikes = [];
  flowers = [];
  for (let i = 0; i < 14; i++) flowers.push(makeFlower());

  score = 0;
  levelIndex = 0;
  survivalTimer = 0;
  flowerSpawnTimer = 0;
  setHUD();
  statusText.textContent = "Survive and use flowers wisely.";
}

function startGame() {
  menuOverlay.classList.add("hidden");
  howOverlay.classList.add("hidden");
  gameOverOverlay.classList.add("hidden");
  winOverlay.classList.add("hidden");

  cancelAnimationFrame(animationId);
  resetGameState();
  resizeCanvas();

  gameRunning = true;
  lastTime = performance.now();
  animationId = requestAnimationFrame(loop);
}

function saveScore(newScore) {
  const old = JSON.parse(localStorage.getItem(HIGHSCORE_KEY) || "[]");
  old.push({ name: "I Love You", score: Math.floor(newScore) });
  old.sort((a,b) => b.score - a.score);
  const top = old.slice(0, 5);
  localStorage.setItem(HIGHSCORE_KEY, JSON.stringify(top));
  return top;
}

function renderHighscores(target, scores) {
  target.innerHTML = "";
  scores.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "highscore-row";
    row.innerHTML = `<span>${i + 1}. ${s.name}</span><strong>${s.score}</strong>`;
    target.appendChild(row);
  });
}

function endGame(message) {
  gameRunning = false;
  const scores = saveScore(score);
  gameOverMessage.textContent = message;
  renderHighscores(highscoreList, scores);
  gameOverOverlay.classList.remove("hidden");
}

function winGame() {
  gameRunning = false;
  const scores = saveScore(score);
  renderHighscores(winHighscoreList, scores);
  winOverlay.classList.remove("hidden");
}

function levelUpIfNeeded() {
  if (score >= currentGoal()) {
    levelIndex++;
    if (levelIndex >= GOALS.length) {
      winGame();
      return;
    }
    player.hearts = Math.min(HEARTS_MAX, player.hearts + 1);
    player.invuln = 1.0;
    statusText.textContent = `Level up! New goal: ${currentGoal()}`;
  }
}

function update(dt) {
  const dir = getInputDirection();
  player.x += dir.x * player.speed * dt;
  player.y += dir.y * player.speed * dt;
  player.x = clamp(player.x, player.r, WORLD.w - player.r);
  player.y = clamp(player.y, player.r, WORLD.h - player.r);

  if (player.invuln > 0) player.invuln -= dt;

  survivalTimer += dt;
  if (survivalTimer >= 20) {
    survivalTimer -= 20;
    score += 50;
    statusText.textContent = "+50 survival points!";
  }

  flowerSpawnTimer += dt;
  if (flowerSpawnTimer >= 5.5) {
    flowerSpawnTimer = 0;
    if (flowers.length < 18) flowers.push(makeFlower());
  }

  for (const f of flowers) {
    if (!f.active) continue;
    if (dist(player.x, player.y, f.x, f.y) < player.r + f.r + 6) {
      f.active = false;
      score += 100;
      statusText.textContent = "+100! Porcupines distracted.";
      porcupines.forEach(p => p.eatTimer = 3);
    }
  }
  flowers = flowers.filter(f => f.active);

  const tune = difficulty();

  for (const p of porcupines) {
    p.speed = tune.porcupineSpeed;

    if (p.eatTimer > 0) {
      p.eatTimer -= dt;
      continue;
    }

    const dx = player.x - p.x;
    const dy = player.y - p.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / d;
    const uy = dy / d;

    p.x += ux * p.speed * dt;
    p.y += uy * p.speed * dt;

    if (d < p.r + player.r + 10 && player.invuln <= 0) {
      player.hearts--;
      player.invuln = 1;
      statusText.textContent = "Porcupine hit!";
      if (player.hearts <= 0) {
        endGame(`You scored ${Math.floor(score)} points.`);
        return;
      }
    }

    p.shootTimer -= dt;
    if (p.shootTimer <= 0) {
      p.shootTimer = rand(tune.shootBase * 0.7, tune.shootBase * 1.2);
      const spread = rand(-0.22, 0.22);
      const angle = Math.atan2(uy, ux) + spread;
      spikes.push(makeSpike(
        p.x, p.y,
        Math.cos(angle) * tune.spikeSpeed,
        Math.sin(angle) * tune.spikeSpeed
      ));
    }
  }

  for (const s of spikes) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
  }
  spikes = spikes.filter(s =>
    s.life > 0 &&
    s.x > -100 && s.x < WORLD.w + 100 &&
    s.y > -100 && s.y < WORLD.h + 100
  );

  for (const s of spikes) {
    if (dist(player.x, player.y, s.x, s.y) < player.r + s.r + 3 && player.invuln <= 0) {
      player.hearts--;
      player.invuln = 1;
      s.life = 0;
      statusText.textContent = "Spike hit!";
      if (player.hearts <= 0) {
        endGame(`You scored ${Math.floor(score)} points.`);
        return;
      }
    }
  }

  levelUpIfNeeded();
  setHUD();
}

function getInputDirection() {
  let x = 0;
  let y = 0;

  if (keys.left) x -= 1;
  if (keys.right) x += 1;
  if (keys.up) y -= 1;
  if (keys.down) y += 1;

  x += touchMove.x;
  y += touchMove.y;

  const mag = Math.hypot(x, y);
  if (mag > 0) {
    x /= mag;
    y /= mag;
  }
  return { x, y };
}

function drawGrass(camX, camY, w, h) {
  ctx.fillStyle = "#11351a";
  ctx.fillRect(0, 0, w, h);

  const step = 34;
  for (let y = -((camY | 0) % step); y < h; y += step) {
    for (let x = -((camX | 0) % step); x < w; x += step) {
      ctx.fillStyle = "rgba(46,204,113,0.08)";
      ctx.fillRect(x + 3, y + 5, 18, 2);
      ctx.fillRect(x + 11, y + 13, 14, 2);
    }
  }

  const g = ctx.createRadialGradient(w/2, h/2, 80, w/2, h/2, Math.max(w, h));
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,.32)");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,w,h);
}

function drawFlower(x, y) {
  ctx.save();
  ctx.translate(x, y);

  const glow = ctx.createRadialGradient(0,0,4,0,0,24);
  glow.addColorStop(0, "rgba(255,120,220,.35)");
  glow.addColorStop(1, "rgba(255,120,220,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(0,0,24,0,Math.PI*2);
  ctx.fill();

  ctx.strokeStyle = "rgba(46,204,113,.8)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 12);
  ctx.lineTo(0, 28);
  ctx.stroke();

  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.fillStyle = "rgba(255,120,220,.9)";
    ctx.beginPath();
    ctx.ellipse(Math.cos(a)*9, Math.sin(a)*9 - 4, 5, 9, a, 0, Math.PI*2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255,215,0,.95)";
  ctx.beginPath();
  ctx.arc(0, -4, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawSpike(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = "rgba(255,255,255,.78)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-7, 0);
  ctx.lineTo(7, 0);
  ctx.stroke();

  ctx.fillStyle = "rgba(96,165,250,.65)";
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function drawPlayer(x, y) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath();
  ctx.ellipse(0, 18, 18, 8, 0, 0, Math.PI*2);
  ctx.fill();

  ctx.fillStyle = "#e8f1ff";
  ctx.strokeStyle = "rgba(255,255,255,.25)";
  ctx.lineWidth = 2;
  roundRect(ctx, -12, -6, 24, 30, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(94,234,212,.35)";
  ctx.fillRect(-12, 7, 24, 5);

  ctx.fillStyle = "#ffd7b5";
  ctx.beginPath();
  ctx.arc(0, -16, 12, 0, Math.PI*2);
  ctx.fill();

  ctx.fillStyle = "rgba(0,0,0,.24)";
  ctx.beginPath();
  ctx.arc(0, -18, 12, Math.PI, Math.PI*2);
  ctx.fill();

  if (player.invuln > 0) {
    ctx.strokeStyle = "rgba(96,165,250,.8)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 4, 26, 0, Math.PI*2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPorcupine(x, y, eating) {
  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath();
  ctx.ellipse(0, 18, 22, 9, 0, 0, Math.PI*2);
  ctx.fill();

  ctx.fillStyle = eating ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.18)";
  ctx.strokeStyle = "rgba(255,255,255,.22)";
  ctx.lineWidth = 2;
  roundRect(ctx, -18, -6, 36, 28, 14);
  ctx.fill();
  ctx.stroke();

  for (let i = 0; i < 10; i++) {
    const a = (i / 9) * Math.PI + Math.PI;
    const x1 = Math.cos(a) * 14;
    const y1 = Math.sin(a) * 10 - 6;
    const x2 = Math.cos(a) * 26;
    const y2 = Math.sin(a) * 18 - 12;
    ctx.strokeStyle = eating ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.36)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath();
  ctx.arc(8, 2, 2, 0, Math.PI*2);
  ctx.arc(12, 2, 2, 0, Math.PI*2);
  ctx.fill();

  if (eating) {
    ctx.fillStyle = "rgba(94,234,212,.8)";
    ctx.beginPath();
    ctx.arc(-10, -18, 6, 0, Math.PI*2);
    ctx.fill();
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function render() {
  const rect = canvas.getBoundingClientRect();
  const viewW = rect.width;
  const viewH = rect.height;

  const camX = clamp(player.x - viewW / 2, 0, WORLD.w - viewW);
  const camY = clamp(player.y - viewH / 2, 0, WORLD.h - viewH);

  drawGrass(camX, camY, viewW, viewH);

  ctx.save();
  ctx.translate(-camX, -camY);

  for (const f of flowers) drawFlower(f.x, f.y);
  for (const s of spikes) drawSpike(s.x, s.y);
  for (const p of porcupines) drawPorcupine(p.x, p.y, p.eatTimer > 0);
  drawPlayer(player.x, player.y);

  ctx.restore();

  // Mini map
  ctx.fillStyle = "rgba(255,255,255,.08)";
  ctx.fillRect(16, 16, 150, 82);
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.strokeRect(16, 16, 150, 82);

  const mx = x => 16 + (x / WORLD.w) * 150;
  const my = y => 16 + (y / WORLD.h) * 82;

  ctx.fillStyle = "rgba(94,234,212,.95)";
  ctx.beginPath();
  ctx.arc(mx(player.x), my(player.y), 4, 0, Math.PI*2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,120,220,.95)";
  for (const f of flowers) {
    ctx.beginPath();
    ctx.arc(mx(f.x), my(f.y), 2.4, 0, Math.PI*2);
    ctx.fill();
  }

  ctx.fillStyle = "rgba(255,255,255,.9)";
  for (const p of porcupines) {
    ctx.beginPath();
    ctx.arc(mx(p.x), my(p.y), 3, 0, Math.PI*2);
    ctx.fill();
  }
}

function loop(ts) {
  if (!gameRunning) return;
  const dt = Math.min(0.033, (ts - lastTime) / 1000);
  lastTime = ts;

  update(dt);
  render();

  if (gameRunning) animationId = requestAnimationFrame(loop);
}

// Joystick
let dragging = false;
const joyCenter = { x: 60, y: 60 };
const joyRadius = 42;

function updateJoystick(clientX, clientY) {
  const rect = joystickBase.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  let dx = x - joyCenter.x;
  let dy = y - joyCenter.y;
  const mag = Math.hypot(dx, dy);

  if (mag > joyRadius) {
    dx = (dx / mag) * joyRadius;
    dy = (dy / mag) * joyRadius;
  }

  joystickKnob.style.left = `${33 + dx}px`;
  joystickKnob.style.top = `${33 + dy}px`;

  touchMove.x = dx / joyRadius;
  touchMove.y = dy / joyRadius;
}

function resetJoystick() {
  joystickKnob.style.left = `33px`;
  joystickKnob.style.top = `33px`;
  touchMove.x = 0;
  touchMove.y = 0;
}

joystickBase.addEventListener("pointerdown", (e) => {
  dragging = true;
  joystickBase.setPointerCapture(e.pointerId);
  updateJoystick(e.clientX, e.clientY);
});
joystickBase.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  updateJoystick(e.clientX, e.clientY);
});
joystickBase.addEventListener("pointerup", () => {
  dragging = false;
  resetJoystick();
});
joystickBase.addEventListener("pointercancel", () => {
  dragging = false;
  resetJoystick();
});

player = makePlayer();
renderHearts(player.hearts);
resizeCanvas();