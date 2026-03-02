// Porcupine-Run — canvas game
// Created for: Parth Pankaj Bakhda (credited in UI)

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// UI
const levelPill = document.getElementById("levelPill");
const goalPill = document.getElementById("goalPill");
const scorePill = document.getElementById("scorePill");
const heartsWrap = document.getElementById("hearts");
const statusText = document.getElementById("statusText");

const startOverlay = document.getElementById("startOverlay");
const howOverlay = document.getElementById("howOverlay");
const gameOverOverlay = document.getElementById("gameOverOverlay");
const winOverlay = document.getElementById("winOverlay");

document.getElementById("startBtn").addEventListener("click", () => startGame());
document.getElementById("howBtn").addEventListener("click", () => { howOverlay.classList.remove("hidden"); });
document.getElementById("backBtn").addEventListener("click", () => { howOverlay.classList.add("hidden"); });
document.getElementById("restartBtn").addEventListener("click", () => startGame());
document.getElementById("menuBtn").addEventListener("click", () => { gameOverOverlay.classList.add("hidden"); startOverlay.classList.remove("hidden"); });
document.getElementById("playAgainBtn").addEventListener("click", () => { winOverlay.classList.add("hidden"); startOverlay.classList.remove("hidden"); });

// --- Game constants ---
const WORLD = { w: 3600, h: 2200 }; // big grass map
const HEARTS_MAX = 8;
const LEVEL_GOALS = [1000, 2500, 5000, 7500, 10000, 12500, 15000, 17500, 20000];

const keys = { up:false, down:false, left:false, right:false };
window.addEventListener("keydown", (e) => {
  if(e.key === "ArrowUp") keys.up = true;
  if(e.key === "ArrowDown") keys.down = true;
  if(e.key === "ArrowLeft") keys.left = true;
  if(e.key === "ArrowRight") keys.right = true;
});
window.addEventListener("keyup", (e) => {
  if(e.key === "ArrowUp") keys.up = false;
  if(e.key === "ArrowDown") keys.down = false;
  if(e.key === "ArrowLeft") keys.left = false;
  if(e.key === "ArrowRight") keys.right = false;
});

// --- Utility ---
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function dist(ax, ay, bx, by){
  const dx = ax - bx, dy = ay - by;
  return Math.sqrt(dx*dx + dy*dy);
}
function rand(min, max){ return Math.random() * (max - min) + min; }

function drawHeart(x, y, filled){
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(0.9, 0.9);

  ctx.beginPath();
  ctx.moveTo(10, 18);
  ctx.bezierCurveTo(10, 18, 2, 12, 2, 7);
  ctx.bezierCurveTo(2, 3, 5, 1, 8, 1);
  ctx.bezierCurveTo(10, 1, 12, 2, 13, 4);
  ctx.bezierCurveTo(14, 2, 16, 1, 18, 1);
  ctx.bezierCurveTo(21, 1, 24, 3, 24, 7);
  ctx.bezierCurveTo(24, 12, 16, 18, 16, 18);
  ctx.bezierCurveTo(14, 20, 12, 21, 10, 18);
  ctx.closePath();

  ctx.fillStyle = filled ? "#ff5d7a" : "rgba(255,255,255,.16)";
  ctx.strokeStyle = "rgba(255,255,255,.22)";
  ctx.lineWidth = 2;
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function renderHearts(hearts){
  heartsWrap.innerHTML = "";
  for(let i=0;i<HEARTS_MAX;i++){
    const c = document.createElement("canvas");
    c.width = 18; c.height = 18;
    c.className = "heart";
    const cctx = c.getContext("2d");
    // draw with mini context
    cctx.save();
    cctx.translate(0,0);

    cctx.beginPath();
    cctx.moveTo(10, 18);
    cctx.bezierCurveTo(10, 18, 2, 12, 2, 7);
    cctx.bezierCurveTo(2, 3, 5, 1, 8, 1);
    cctx.bezierCurveTo(10, 1, 12, 2, 13, 4);
    cctx.bezierCurveTo(14, 2, 16, 1, 18, 1);
    cctx.bezierCurveTo(21, 1, 24, 3, 24, 7);
    cctx.bezierCurveTo(24, 12, 16, 18, 16, 18);
    cctx.bezierCurveTo(14, 20, 12, 21, 10, 18);
    cctx.closePath();

    cctx.fillStyle = i < hearts ? "#ff5d7a" : "rgba(255,255,255,.16)";
    cctx.strokeStyle = "rgba(255,255,255,.22)";
    cctx.lineWidth = 2;
    cctx.scale(0.7, 0.7);
    cctx.fill();
    cctx.stroke();
    cctx.restore();

    heartsWrap.appendChild(c);
  }
}

// --- Entities ---
function makePlayer(){
  return {
    x: WORLD.w/2, y: WORLD.h/2,
    r: 18,
    speed: 280, // px/sec
    vx: 0, vy: 0,
    hearts: HEARTS_MAX,
    invuln: 0 // seconds
  };
}

function makePorcupine(x, y){
  return {
    x, y,
    r: 22,
    baseSpeed: 165,
    speed: 165,
    eatTimer: 0,    // if >0, porcupine is eating
    shootTimer: rand(1.2, 2.4)
  };
}

function makeFlower(){
  return {
    x: rand(120, WORLD.w-120),
    y: rand(120, WORLD.h-120),
    r: 18,
    active: true
  };
}

function makeSpike(px, py, vx, vy){
  return { x:px, y:py, vx, vy, r: 6, life: 2.6 };
}

// --- Game state ---
let running = false;
let lastT = 0;

let player;
let porcs;
let spikes;
let flowers;

let score = 0;
let levelIndex = 0;

let survivalTimer = 0; // accumulates, +50 every 20s
let flowerRespawnTimer = 0;

function setHUD(){
  const goal = LEVEL_GOALS[levelIndex] ?? LEVEL_GOALS[LEVEL_GOALS.length-1];
  levelPill.textContent = `Level ${levelIndex+1}`;
  goalPill.textContent = `Goal: ${goal}`;
  scorePill.textContent = `Score: ${Math.floor(score)}`;
  renderHearts(player.hearts);
}

function levelTuning(){
  // difficulty ramps each level
  const L = levelIndex;
  const porcSpeed = 165 + L * 14;
  const spikeSpeed = 420 + L * 28;
  return { porcSpeed, spikeSpeed };
}

function startGame(){
  startOverlay.classList.add("hidden");
  howOverlay.classList.add("hidden");
  gameOverOverlay.classList.add("hidden");
  winOverlay.classList.add("hidden");

  player = makePlayer();
  porcs = [
    makePorcupine(player.x - 250, player.y - 120),
    makePorcupine(player.x + 260, player.y + 150)
  ];
  spikes = [];
  flowers = [];
  for(let i=0;i<16;i++) flowers.push(makeFlower());

  score = 0;
  levelIndex = 0;
  survivalTimer = 0;
  flowerRespawnTimer = 0;

  running = true;
  lastT = performance.now();
  statusText.textContent = "Survive! Lure porcupines to flowers.";
  setHUD();
  requestAnimationFrame(loop);
}

function gameOver(msg){
  running = false;
  statusText.textContent = "Game over.";
  document.getElementById("finalText").textContent = msg;
  gameOverOverlay.classList.remove("hidden");
}

function winGame(){
  running = false;
  winOverlay.classList.remove("hidden");
}

function levelUpIfNeeded(){
  const goal = LEVEL_GOALS[levelIndex];
  if(score >= goal){
    levelIndex++;
    if(levelIndex >= LEVEL_GOALS.length){
      winGame();
      return;
    }
    // reward + increase intensity
    player.hearts = Math.min(HEARTS_MAX, player.hearts + 1);
    player.invuln = 1.0;
    statusText.textContent = `Level up! New goal: ${LEVEL_GOALS[levelIndex]}`;
  }
}

function update(dt){
  // --- Player movement ---
  let ax = 0, ay = 0;
  if(keys.left) ax -= 1;
  if(keys.right) ax += 1;
  if(keys.up) ay -= 1;
  if(keys.down) ay += 1;

  // normalize
  const mag = Math.sqrt(ax*ax + ay*ay) || 1;
  ax /= mag; ay /= mag;

  player.vx = ax * player.speed;
  player.vy = ay * player.speed;

  player.x += player.vx * dt;
  player.y += player.vy * dt;
  player.x = clamp(player.x, player.r, WORLD.w - player.r);
  player.y = clamp(player.y, player.r, WORLD.h - player.r);

  if(player.invuln > 0) player.invuln -= dt;

  // --- Survival points ---
  survivalTimer += dt;
  if(survivalTimer >= 20){
    survivalTimer -= 20;
    score += 50;
    statusText.textContent = "+50 survival points!";
  }

  // --- Flowers respawn slowly ---
  flowerRespawnTimer += dt;
  if(flowerRespawnTimer > 6){
    flowerRespawnTimer = 0;
    if(flowers.length < 18){
      flowers.push(makeFlower());
    }
  }

  // --- Flower activation by player ---
  for(const f of flowers){
    if(!f.active) continue;
    if(dist(player.x, player.y, f.x, f.y) < player.r + f.r + 6){
      // activate distraction
      f.active = false;
      score += 100;
      statusText.textContent = "+100! Porcupines distracted (eating 5s).";
      for(const p of porcs){
        p.eatTimer = 5.0;
      }
    }
  }
  // remove inactive flowers sometimes
  flowers = flowers.filter(f => f.active);

  // --- Porcupines ---
  const tune = levelTuning();
  for(const p of porcs){
    p.speed = tune.porcSpeed;

    if(p.eatTimer > 0){
      p.eatTimer -= dt;
      // while eating, no chasing, no shooting
      continue;
    }

    // chase player
    const dx = player.x - p.x;
    const dy = player.y - p.y;
    const d = Math.sqrt(dx*dx + dy*dy) || 1;
    const ux = dx / d;
    const uy = dy / d;

    p.x += ux * p.speed * dt;
    p.y += uy * p.speed * dt;

    // close hit (melee)
    if(d < p.r + player.r + 8){
      if(player.invuln <= 0){
        player.hearts -= 1;
        player.invuln = 1.1;
        statusText.textContent = "Ouch! Porcupine hit!";
        if(player.hearts <= 0){
          gameOver(`You scored ${Math.floor(score)} points before getting caught.`);
          return;
        }
      }
    }

    // spike shooting
    p.shootTimer -= dt;
    const shootRate = Math.max(0.9, 2.0 - levelIndex*0.08); // faster later
    if(p.shootTimer <= 0){
      p.shootTimer = rand(shootRate*0.6, shootRate*1.2);

      // shoot toward player with a little spread
      const spread = rand(-0.20, 0.20);
      const ang = Math.atan2(uy, ux) + spread;
      const spd = tune.spikeSpeed;

      const vx = Math.cos(ang) * spd;
      const vy = Math.sin(ang) * spd;

      spikes.push(makeSpike(p.x, p.y, vx, vy));
    }
  }

  // --- Spikes update / collision ---
  for(const s of spikes){
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.life -= dt;
  }
  spikes = spikes.filter(s =>
    s.life > 0 &&
    s.x > -50 && s.x < WORLD.w+50 &&
    s.y > -50 && s.y < WORLD.h+50
  );

  for(const s of spikes){
    if(dist(player.x, player.y, s.x, s.y) < player.r + s.r + 4){
      if(player.invuln <= 0){
        player.hearts -= 1;
        player.invuln = 1.1;
        s.life = 0;
        statusText.textContent = "Spike hit! Zigzag to dodge.";
        if(player.hearts <= 0){
          gameOver(`You scored ${Math.floor(score)} points before getting caught.`);
          return;
        }
      }
    }
  }

  // --- Leveling ---
  levelUpIfNeeded();
  setHUD();
}

// --- Rendering ---
function drawGrass(cam){
  // grass base
  ctx.fillStyle = "#0f3b1d";
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // subtle grass pattern
  const step = 38;
  for(let y = -((cam.y|0)%step); y < canvas.height; y += step){
    for(let x = -((cam.x|0)%step); x < canvas.width; x += step){
      const gx = x + rand(-2,2);
      const gy = y + rand(-2,2);
      ctx.fillStyle = "rgba(46, 204, 113, 0.07)";
      ctx.fillRect(gx, gy, 22, 2);
      ctx.fillStyle = "rgba(46, 204, 113, 0.05)";
      ctx.fillRect(gx+6, gy+6, 16, 2);
    }
  }

  // faint vignette
  const g = ctx.createRadialGradient(
    canvas.width/2, canvas.height/2, 120,
    canvas.width/2, canvas.height/2, Math.max(canvas.width, canvas.height)
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,canvas.width,canvas.height);
}

function drawPlayer(px, py){
  // civilian: simple but nice
  ctx.save();
  ctx.translate(px, py);

  // shadow
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath();
  ctx.ellipse(0, 18, 18, 8, 0, 0, Math.PI*2);
  ctx.fill();

  // body
  ctx.fillStyle = "#e8f1ff";
  ctx.strokeStyle = "rgba(255,255,255,.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-12, -6, 24, 30, 8);
  ctx.fill();
  ctx.stroke();

  // shirt stripe
  ctx.fillStyle = "rgba(94,234,212,.35)";
  ctx.fillRect(-12, 8, 24, 5);

  // head
  ctx.fillStyle = "#ffd7b5";
  ctx.beginPath();
  ctx.arc(0, -16, 12, 0, Math.PI*2);
  ctx.fill();

  // hair
  ctx.fillStyle = "rgba(0,0,0,.25)";
  ctx.beginPath();
  ctx.arc(0, -18, 12, Math.PI, Math.PI*2);
  ctx.fill();

  // invuln glow
  if(player.invuln > 0){
    ctx.strokeStyle = "rgba(96,165,250,.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 4, 26, 0, Math.PI*2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPorcupine(px, py, eating){
  ctx.save();
  ctx.translate(px, py);

  // shadow
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.beginPath();
  ctx.ellipse(0, 18, 22, 9, 0, 0, Math.PI*2);
  ctx.fill();

  // body
  ctx.fillStyle = eating ? "rgba(255,255,255,.12)" : "rgba(255,255,255,.18)";
  ctx.strokeStyle = "rgba(255,255,255,.22)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-18, -6, 36, 28, 14);
  ctx.fill();
  ctx.stroke();

  // face
  ctx.fillStyle = "rgba(0,0,0,.35)";
  ctx.beginPath();
  ctx.arc(8, 2, 2, 0, Math.PI*2);
  ctx.arc(12, 2, 2, 0, Math.PI*2);
  ctx.fill();

  // spikes
  const spikeCount = 10;
  for(let i=0;i<spikeCount;i++){
    const a = (i/(spikeCount-1))*Math.PI + Math.PI;
    const x1 = Math.cos(a) * 14;
    const y1 = Math.sin(a) * 10 - 6;
    const x2 = Math.cos(a) * 26;
    const y2 = Math.sin(a) * 18 - 12;

    ctx.strokeStyle = eating ? "rgba(255,255,255,.18)" : "rgba(255,255,255,.36)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1,y1);
    ctx.lineTo(x2,y2);
    ctx.stroke();
  }

  // eating icon
  if(eating){
    ctx.fillStyle = "rgba(94,234,212,.75)";
    ctx.beginPath();
    ctx.arc(-10, -18, 6, 0, Math.PI*2);
    ctx.fill();
  }

  ctx.restore();
}

function drawFlower(px, py){
  ctx.save();
  ctx.translate(px, py);

  // glow
  const g = ctx.createRadialGradient(0,0,4, 0,0,26);
  g.addColorStop(0, "rgba(255,120,220,.35)");
  g.addColorStop(1, "rgba(255,120,220,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0,0,26,0,Math.PI*2);
  ctx.fill();

  // stem
  ctx.strokeStyle = "rgba(46, 204, 113, .7)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 16);
  ctx.lineTo(0, 30);
  ctx.stroke();

  // petals
  const petals = 6;
  for(let i=0;i<petals;i++){
    const a = (i/petals)*Math.PI*2;
    ctx.fillStyle = "rgba(255,120,220,.85)";
    ctx.beginPath();
    ctx.ellipse(Math.cos(a)*10, Math.sin(a)*10-6, 6, 10, a, 0, Math.PI*2);
    ctx.fill();
  }
  // center
  ctx.fillStyle = "rgba(255, 215, 0, .9)";
  ctx.beginPath();
  ctx.arc(0, -6, 6, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
}

function drawSpike(px, py){
  ctx.save();
  ctx.translate(px, py);
  ctx.strokeStyle = "rgba(255,255,255,.70)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-8, 0);
  ctx.lineTo(8, 0);
  ctx.stroke();

  ctx.fillStyle = "rgba(96,165,250,.55)";
  ctx.beginPath();
  ctx.arc(0, 0, 4, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function render(){
  // camera follows player
  const cam = {
    x: clamp(player.x - canvas.width/2, 0, WORLD.w - canvas.width),
    y: clamp(player.y - canvas.height/2, 0, WORLD.h - canvas.height)
  };

  drawGrass(cam);

  // translate world -> screen
  ctx.save();
  ctx.translate(-cam.x, -cam.y);

  // flowers
  for(const f of flowers){
    drawFlower(f.x, f.y);
  }

  // spikes
  for(const s of spikes){
    drawSpike(s.x, s.y);
  }

  // porcupines
  for(const p of porcs){
    drawPorcupine(p.x, p.y, p.eatTimer > 0);
  }

  // player
  drawPlayer(player.x, player.y);

  ctx.restore();

  // minimap / edges hint
  ctx.fillStyle = "rgba(255,255,255,.08)";
  ctx.fillRect(16, 16, 160, 86);
  ctx.strokeStyle = "rgba(255,255,255,.14)";
  ctx.strokeRect(16, 16, 160, 86);

  // mini dots
  function mapX(x){ return 16 + (x/WORLD.w)*160; }
  function mapY(y){ return 16 + (y/WORLD.h)*86; }

  ctx.fillStyle = "rgba(94,234,212,.9)";
  ctx.beginPath(); ctx.arc(mapX(player.x), mapY(player.y), 4, 0, Math.PI*2); ctx.fill();

  ctx.fillStyle = "rgba(255,120,220,.9)";
  for(const f of flowers){
    ctx.beginPath(); ctx.arc(mapX(f.x), mapY(f.y), 2.5, 0, Math.PI*2); ctx.fill();
  }

  ctx.fillStyle = "rgba(255,255,255,.85)";
  for(const p of porcs){
    ctx.beginPath(); ctx.arc(mapX(p.x), mapY(p.y), 3, 0, Math.PI*2); ctx.fill();
  }
}

function loop(t){
  if(!running) return;
  const dt = Math.min(0.033, (t - lastT)/1000);
  lastT = t;

  update(dt);
  render();

  requestAnimationFrame(loop);
}

// initial hearts UI in menu
player = makePlayer();
renderHearts(player.hearts);