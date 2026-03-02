/* Porcupine-Run
   - Big grass world with camera follow
   - Player (civilian) moves with arrow keys, shift to sprint (stamina)
   - 8 hearts health; spikes remove hearts; iFrames after hit
   - Two porcupines chase; shoot spikes when near + cooldown
   - Flowers spawn around map:
       - Player collects for points
       - Porcupines that touch a flower get distracted (stop/eat) for a short time
   - Score:
       - +50 every 20 seconds survived
       - +Flower points on collect
   - Level goals:
     1000, 2500, 5000, 7500, 10000, 12500, 15000, 17500, 20000
*/

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const startBtn = document.getElementById("startBtn");
const howBtn = document.getElementById("howBtn");
const howBox = document.getElementById("howBox");

const heartsEl = document.getElementById("hearts");
const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const goalEl = document.getElementById("goal");
const staminaFill = document.getElementById("staminaFill");
const iFramesFill = document.getElementById("iFramesFill");
const levelsBox = document.getElementById("levelsBox");

const LEVEL_GOALS = [1000, 2500, 5000, 7500, 10000, 12500, 15000, 17500, 20000];

function buildLevelsUI(){
  levelsBox.innerHTML = "";
  LEVEL_GOALS.forEach((g, i) => {
    const div = document.createElement("div");
    div.className = "level-chip";
    div.innerHTML = `<span>Level <strong>${i+1}</strong></span><span><strong>${g}</strong></span>`;
    levelsBox.appendChild(div);
  });
}
buildLevelsUI();

const keys = {
  ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, ShiftLeft: false, ShiftRight: false
};
let paused = false;

window.addEventListener("keydown", (e) => {
  if (e.code in keys) keys[e.code] = true;
  if (e.code === "KeyP"){
    if (!game.running) return;
    paused = !paused;
    if (paused) showPause();
    else hideOverlay();
  }
});
window.addEventListener("keyup", (e) => {
  if (e.code in keys) keys[e.code] = false;
});

howBtn.addEventListener("click", () => {
  howBox.classList.toggle("hidden");
});

startBtn.addEventListener("click", () => {
  startGame();
});

function showOverlay(title, text, buttonText="Start Game"){
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  startBtn.textContent = buttonText;
  overlay.classList.remove("hidden");
}
function hideOverlay(){
  overlay.classList.add("hidden");
  howBox.classList.add("hidden");
}
function showPause(){
  showOverlay("Paused", "Press P to resume. Dodge spikes, use flowers to distract porcupines.", "Resume");
}
function showGameOver(){
  showOverlay("Game Over", "You ran out of hearts. Click Restart to try again.", "Restart");
}
function showWin(){
  showOverlay("You Win!", "You completed the final level (20,000 points). Click Play Again to restart.", "Play Again");
}
function showLevelUp(level){
  showOverlay(`Level ${level} Complete!`, "Get ready — porcupines get faster and spikes get meaner.", "Next Level");
}

function clamp(v, min, max){ return Math.max(min, Math.min(max, v)); }
function rand(min, max){ return Math.random() * (max - min) + min; }
function dist(a,b){ const dx=a.x-b.x, dy=a.y-b.y; return Math.hypot(dx,dy); }

function normalize(vx, vy){
  const d = Math.hypot(vx, vy) || 1;
  return {x: vx/d, y: vy/d};
}

function lerp(a,b,t){ return a+(b-a)*t; }

// ----- World -----
const WORLD = {
  w: 4200,
  h: 2800,
};

// ----- Game state -----
const game = {
  running: false,
  time: 0,
  score: 0,
  levelIndex: 0,
  survivalTimer: 0,
  lastTickBonus: 0,
  flowers: [],
  spikes: [],
  particles: [],
};

const player = {
  x: WORLD.w/2,
  y: WORLD.h/2,
  r: 18,
  speed: 260,
  sprintMult: 1.55,
  stamina: 1.0,        // 0..1
  staminaDrain: 0.40,  // per second
  staminaRegen: 0.28,  // per second
  maxHearts: 8,
  hearts: 8,
  iFrames: 0,          // seconds remaining
  iFramesMax: 1.1,
};

function makePorcupine(id, x, y){
  return {
    id,
    x, y,
    r: 26,
    baseSpeed: 165,
    speed: 165,
    shootRange: 520,
    dangerRange: 340,
    shootCooldown: 0,
    shootCooldownBase: 1.35,
    distracted: 0, // seconds remaining
    targetFlowerId: null,
  };
}

let porcupines = [
  makePorcupine(1, player.x - 520, player.y - 360),
  makePorcupine(2, player.x + 620, player.y + 420),
];

// Camera
const cam = { x: 0, y: 0 };

function resetAll(){
  game.running = false;
  paused = false;

  game.time = 0;
  game.score = 0;
  game.levelIndex = 0;
  game.survivalTimer = 0;
  game.lastTickBonus = 0;

  player.x = WORLD.w/2;
  player.y = WORLD.h/2;
  player.hearts = player.maxHearts;
  player.stamina = 1.0;
  player.iFrames = 0;

  porcupines = [
    makePorcupine(1, player.x - 520, player.y - 360),
    makePorcupine(2, player.x + 620, player.y + 420),
  ];

  game.spikes = [];
  game.flowers = [];
  game.particles = [];

  spawnFlowers(26);
  updateHUD();
  moveCameraToPlayer();
  draw(0);
}

function startGame(){
  // overlay button doubles as resume/next/restart
  if (!game.running){
    resetAll();
    game.running = true;
    hideOverlay();
    last = performance.now();
    requestAnimationFrame(loop);
    return;
  }

  // if paused: resume
  if (paused){
    paused = false;
    hideOverlay();
    last = performance.now();
    requestAnimationFrame(loop);
    return;
  }

  // if game over/win/levelup: continue
  hideOverlay();
  last = performance.now();
  requestAnimationFrame(loop);
}

function updateHUD(){
  // hearts
  heartsEl.innerHTML = "";
  for (let i=0; i<player.maxHearts; i++){
    const h = document.createElement("div");
    h.className = "heart " + (i < player.hearts ? "full" : "empty");
    heartsEl.appendChild(h);
  }
  scoreEl.textContent = Math.floor(game.score).toLocaleString();
  levelEl.textContent = (game.levelIndex + 1).toString();
  goalEl.textContent = LEVEL_GOALS[game.levelIndex].toLocaleString();

  staminaFill.style.width = `${Math.round(player.stamina * 100)}%`;
  const ifr = clamp(player.iFrames / player.iFramesMax, 0, 1);
  iFramesFill.style.width = `${Math.round(ifr * 100)}%`;
}

function currentGoal(){
  return LEVEL_GOALS[game.levelIndex];
}

// ----- Spawning -----
function spawnFlowers(count){
  game.flowers.length = 0;
  for (let i=0; i<count; i++){
    game.flowers.push(makeFlower(i));
  }
}

function makeFlower(id){
  // avoid spawning too close to player
  let x, y;
  let tries = 0;
  do{
    x = rand(120, WORLD.w - 120);
    y = rand(120, WORLD.h - 120);
    tries++;
  } while (Math.hypot(x - player.x, y - player.y) < 300 && tries < 30);

  return {
    id,
    x, y,
    r: 18,
    alive: true,
    // “distract aura” radius: porcupines that reach it get distracted
    distractRadius: 40,
    value: 120, // flower points
  };
}

function respawnFlower(f){
  const nf = makeFlower(f.id);
  f.x = nf.x; f.y = nf.y;
  f.alive = true;
}

// ----- Combat -----
function shootSpike(from, to){
  const dir = normalize(to.x - from.x, to.y - from.y);
  const speed = 560 + game.levelIndex * 35;

  // Add slight spread for “shotgun-ish” porcupine feel
  const spread = (Math.random() - 0.5) * 0.18;
  const cs = Math.cos(spread), sn = Math.sin(spread);
  const vx = dir.x * cs - dir.y * sn;
  const vy = dir.x * sn + dir.y * cs;

  game.spikes.push({
    x: from.x + vx * (from.r + 6),
    y: from.y + vy * (from.r + 6),
    vx: vx * speed,
    vy: vy * speed,
    r: 6,
    life: 2.2, // seconds
    dmg: 1,
    owner: from.id,
  });

  // particles
  for (let i=0; i<10; i++){
    game.particles.push({
      x: from.x, y: from.y,
      vx: vx * rand(50,150) + rand(-80,80),
      vy: vy * rand(50,150) + rand(-80,80),
      life: rand(0.25, 0.55),
      t: 0,
      kind: "spark",
    });
  }
}

function hurtPlayer(){
  if (player.iFrames > 0) return;
  player.hearts -= 1;
  player.iFrames = player.iFramesMax;

  // hit burst
  for (let i=0; i<22; i++){
    game.particles.push({
      x: player.x, y: player.y,
      vx: rand(-220,220),
      vy: rand(-220,220),
      life: rand(0.25, 0.7),
      t: 0,
      kind: "hit",
    });
  }

  if (player.hearts <= 0){
    game.running = false;
    showGameOver();
  }
}

// ----- Loop -----
let last = performance.now();
function loop(now){
  if (!game.running) return;
  if (paused) return;

  const dt = clamp((now - last) / 1000, 0, 0.033);
  last = now;

  update(dt);
  draw(dt);
  requestAnimationFrame(loop);
}

function update(dt){
  game.time += dt;

  // survival scoring: +50 every 20 seconds
  game.survivalTimer += dt;
  if (game.survivalTimer >= 20){
    const ticks = Math.floor(game.survivalTimer / 20);
    game.survivalTimer -= ticks * 20;
    game.score += ticks * 50;
  }

  // player movement
  const sprinting = (keys.ShiftLeft || keys.ShiftRight) && player.stamina > 0.05;
  let moveSpeed = player.speed * (sprinting ? player.sprintMult : 1);

  // stamina
  if (sprinting){
    player.stamina -= player.staminaDrain * dt;
  } else {
    player.stamina += player.staminaRegen * dt;
  }
  player.stamina = clamp(player.stamina, 0, 1);

  let vx = 0, vy = 0;
  if (keys.ArrowUp) vy -= 1;
  if (keys.ArrowDown) vy += 1;
  if (keys.ArrowLeft) vx -= 1;
  if (keys.ArrowRight) vx += 1;

  if (vx !== 0 || vy !== 0){
    const d = normalize(vx, vy);
    player.x += d.x * moveSpeed * dt;
    player.y += d.y * moveSpeed * dt;
  }

  player.x = clamp(player.x, player.r, WORLD.w - player.r);
  player.y = clamp(player.y, player.r, WORLD.h - player.r);

  // invincibility frames
  player.iFrames = Math.max(0, player.iFrames - dt);

  // flowers: player collect
  for (const f of game.flowers){
    if (!f.alive) continue;
    if (dist(player, f) < player.r + f.r){
      f.alive = false;
      game.score += f.value + game.levelIndex * 15;
      // respawn later
      setTimeout(() => respawnFlower(f), 900 + Math.random()*900);
      // particle pop
      for (let i=0; i<18; i++){
        game.particles.push({
          x: f.x, y: f.y,
          vx: rand(-180,180),
          vy: rand(-180,180),
          life: rand(0.25, 0.7),
          t: 0,
          kind: "flower",
        });
      }
    }
  }

  // porcupines behavior
  for (const p of porcupines){
    // scale difficulty by level
    p.speed = p.baseSpeed + game.levelIndex * 18;
    p.shootCooldownBase = clamp(1.35 - game.levelIndex * 0.05, 0.72, 1.35);

    p.shootCooldown = Math.max(0, p.shootCooldown - dt);
    p.distracted = Math.max(0, p.distracted - dt);

    // choose target
    let target = player;
    if (p.distracted > 0 && p.targetFlowerId != null){
      const tf = game.flowers.find(x => x.id === p.targetFlowerId);
      if (tf && tf.alive) target = tf;
      else { p.distracted = 0; p.targetFlowerId = null; target = player; }
    }

    // movement (unless eating)
    if (p.distracted <= 0){
      const d = normalize(target.x - p.x, target.y - p.y);
      p.x += d.x * p.speed * dt;
      p.y += d.y * p.speed * dt;
    } else {
      // “eating wiggle”
      p.x += Math.sin(game.time * 14 + p.id) * 10 * dt;
      p.y += Math.cos(game.time * 12 + p.id) * 10 * dt;
    }

    p.x = clamp(p.x, p.r, WORLD.w - p.r);
    p.y = clamp(p.y, p.r, WORLD.h - p.r);

    // if porcupine reaches a flower: get distracted
    if (p.distracted <= 0){
      for (const f of game.flowers){
        if (!f.alive) continue;
        if (dist(p, f) < p.r + f.distractRadius){
          p.distracted = 2.2 + Math.random()*1.4; // eat duration
          p.targetFlowerId = f.id;
          break;
        }
      }
    }

    // spike shooting (only when not distracted)
    if (p.distracted <= 0){
      const dToPlayer = dist(p, player);
      if (dToPlayer < p.shootRange && p.shootCooldown <= 0){
        // extra rule: must be “threat close-ish” to feel fair
        if (dToPlayer < p.dangerRange + game.levelIndex*18){
          shootSpike(p, player);
          p.shootCooldown = p.shootCooldownBase;
        }
      }
    }
  }

  // spikes update
  for (let i=game.spikes.length-1; i>=0; i--){
    const s = game.spikes[i];
    s.life -= dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;

    // remove if out of world or life ended
    if (s.life <= 0 || s.x < -100 || s.y < -100 || s.x > WORLD.w + 100 || s.y > WORLD.h + 100){
      game.spikes.splice(i,1);
      continue;
    }

    // collide with player
    if (dist(s, player) < s.r + player.r){
      // remove spike
      game.spikes.splice(i,1);
      hurtPlayer();
      continue;
    }
  }

  // particles
  for (let i=game.particles.length-1; i>=0; i--){
    const p = game.particles[i];
    p.t += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= (1 - 1.8 * dt);
    p.vy *= (1 - 1.8 * dt);
    if (p.t >= p.life) game.particles.splice(i,1);
  }

  // camera follow
  moveCameraToPlayer();

  // Level progression
  if (game.score >= currentGoal()){
    // final win?
    if (game.levelIndex >= LEVEL_GOALS.length - 1){
      game.running = false;
      showWin();
      return;
    }
    game.running = false;
    game.levelIndex += 1;

    // bonus: heal 1 heart on level up (cap)
    player.hearts = Math.min(player.maxHearts, player.hearts + 1);
    // refill some stamina
    player.stamina = Math.min(1, player.stamina + 0.35);

    // make world a bit more “alive” each level (more flowers)
    const extraFlowers = clamp(26 + game.levelIndex * 2, 26, 46);
    spawnFlowers(extraFlowers);

    updateHUD();
    showLevelUp(game.levelIndex);
    return;
  }

  updateHUD();
}

function moveCameraToPlayer(){
  const vw = canvas.width;
  const vh = canvas.height;

  cam.x = clamp(player.x - vw/2, 0, WORLD.w - vw);
  cam.y = clamp(player.y - vh/2, 0, WORLD.h - vh);
}

// ----- Drawing -----
function draw(dt){
  // clear
  ctx.clearRect(0,0,canvas.width, canvas.height);

  // grass background with subtle pattern + parallax
  drawGrass();

  // flowers
  for (const f of game.flowers){
    if (!f.alive) continue;
    drawFlower(f);
  }

  // spikes
  for (const s of game.spikes){
    drawSpike(s);
  }

  // porcupines
  for (const p of porcupines){
    drawPorcupine(p);
  }

  // player
  drawPlayer();

  // particles
  for (const p of game.particles){
    drawParticle(p);
  }

  // mini info text inside canvas
  drawCornerText();
}

function worldToScreen(x,y){
  return { x: x - cam.x, y: y - cam.y };
}

function drawGrass(){
  // base fill
  ctx.fillStyle = "#0e1a11";
  ctx.fillRect(0,0,canvas.width, canvas.height);

  // gradient overlay
  const g = ctx.createLinearGradient(0,0,canvas.width, canvas.height);
  g.addColorStop(0, "rgba(46, 190, 120, 0.12)");
  g.addColorStop(1, "rgba(20, 120, 80, 0.06)");
  ctx.fillStyle = g;
  ctx.fillRect(0,0,canvas.width, canvas.height);

  // grass blades pattern
  const step = 38;
  const offsetX = (cam.x * 0.15) % step;
  const offsetY = (cam.y * 0.15) % step;

  for (let y = -step; y < canvas.height + step; y += step){
    for (let x = -step; x < canvas.width + step; x += step){
      const px = x - offsetX;
      const py = y - offsetY;
      const sway = Math.sin((px + py) * 0.02 + game.time * 0.8) * 6;

      ctx.strokeStyle = "rgba(60, 220, 140, 0.10)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, py+18);
      ctx.lineTo(px + sway, py - 6);
      ctx.stroke();
    }
  }

  // vignette
  const v = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 100, canvas.width/2, canvas.height/2, Math.max(canvas.width, canvas.height)*0.7);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = v;
  ctx.fillRect(0,0,canvas.width, canvas.height);
}

function drawPlayer(){
  const s = worldToScreen(player.x, player.y);

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(s.x, s.y + player.r + 10, player.r*0.9, player.r*0.45, 0, 0, Math.PI*2);
  ctx.fill();

  // body (civilian)
  const bodyGrad = ctx.createLinearGradient(s.x - player.r, s.y - player.r, s.x + player.r, s.y + player.r);
  bodyGrad.addColorStop(0, "rgba(233,238,252,0.95)");
  bodyGrad.addColorStop(1, "rgba(124,92,255,0.75)");

  // blink effect during iFrames
  const blink = player.iFrames > 0 && Math.floor(game.time * 14) % 2 === 0;
  ctx.globalAlpha = blink ? 0.45 : 1;

  ctx.fillStyle = bodyGrad;
  ctx.beginPath();
  ctx.arc(s.x, s.y, player.r, 0, Math.PI*2);
  ctx.fill();

  // face
  ctx.globalAlpha = 1;
  ctx.fillStyle = "rgba(11,15,23,0.9)";
  ctx.beginPath();
  ctx.arc(s.x - 6, s.y - 4, 3, 0, Math.PI*2);
  ctx.arc(s.x + 6, s.y - 4, 3, 0, Math.PI*2);
  ctx.fill();

  // direction indicator (based on keys)
  let dx = 0, dy = 0;
  if (keys.ArrowUp) dy -= 1;
  if (keys.ArrowDown) dy += 1;
  if (keys.ArrowLeft) dx -= 1;
  if (keys.ArrowRight) dx += 1;
  const d = (dx || dy) ? normalize(dx,dy) : {x:0, y:1};

  ctx.strokeStyle = "rgba(45,212,191,0.9)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(s.x, s.y);
  ctx.lineTo(s.x + d.x * (player.r + 14), s.y + d.y * (player.r + 14));
  ctx.stroke();
}

function drawPorcupine(p){
  const s = worldToScreen(p.x, p.y);

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(s.x, s.y + p.r + 10, p.r*1.0, p.r*0.5, 0, 0, Math.PI*2);
  ctx.fill();

  // body gradient
  const g = ctx.createLinearGradient(s.x - p.r, s.y - p.r, s.x + p.r, s.y + p.r);
  g.addColorStop(0, "rgba(255,209,102,0.95)");
  g.addColorStop(1, "rgba(255,77,109,0.75)");

  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(s.x, s.y, p.r, 0, Math.PI*2);
  ctx.fill();

  // spikes (ring)
  const spikesCount = 22;
  for (let i=0; i<spikesCount; i++){
    const ang = (i / spikesCount) * Math.PI*2 + Math.sin(game.time*2 + p.id)*0.2;
    const len = 18 + Math.sin(game.time*6 + i)*2;
    const x1 = s.x + Math.cos(ang) * (p.r - 4);
    const y1 = s.y + Math.sin(ang) * (p.r - 4);
    const x2 = s.x + Math.cos(ang) * (p.r + len);
    const y2 = s.y + Math.sin(ang) * (p.r + len);

    ctx.strokeStyle = "rgba(11,15,23,0.75)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1,y1);
    ctx.lineTo(x2,y2);
    ctx.stroke();
  }

  // eyes
  ctx.fillStyle = "rgba(11,15,23,0.92)";
  ctx.beginPath();
  ctx.arc(s.x - 7, s.y - 5, 3.2, 0, Math.PI*2);
  ctx.arc(s.x + 7, s.y - 5, 3.2, 0, Math.PI*2);
  ctx.fill();

  // distracted indicator
  if (p.distracted > 0){
    ctx.fillStyle = "rgba(45,212,191,0.95)";
    ctx.font = "900 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.fillText("EATING", s.x - 26, s.y - p.r - 18);
  }
}

function drawSpike(s){
  const p = worldToScreen(s.x, s.y);
  const ang = Math.atan2(s.vy, s.vx);

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(ang);

  ctx.fillStyle = "rgba(233,238,252,0.95)";
  ctx.strokeStyle = "rgba(124,92,255,0.75)";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(-10, -4);
  ctx.lineTo(10, 0);
  ctx.lineTo(-10, 4);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // glow
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = "rgba(45,212,191,0.65)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(-12, 0);
  ctx.lineTo(8, 0);
  ctx.stroke();

  ctx.restore();
}

function drawFlower(f){
  const s = worldToScreen(f.x, f.y);

  // stem
  ctx.strokeStyle = "rgba(70, 230, 160, 0.75)";
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(s.x, s.y + 22);
  ctx.lineTo(s.x, s.y + 2);
  ctx.stroke();

  // petals
  const petalCount = 6;
  for (let i=0; i<petalCount; i++){
    const ang = (i / petalCount) * Math.PI*2 + game.time*0.4;
    const px = s.x + Math.cos(ang) * 16;
    const py = s.y + Math.sin(ang) * 16;

    ctx.fillStyle = "rgba(124,92,255,0.85)";
    ctx.beginPath();
    ctx.arc(px, py, 8, 0, Math.PI*2);
    ctx.fill();
  }

  // center
  ctx.fillStyle = "rgba(255,209,102,0.95)";
  ctx.beginPath();
  ctx.arc(s.x, s.y, 9, 0, Math.PI*2);
  ctx.fill();

  // subtle aura
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = "rgba(45,212,191,0.9)";
  ctx.beginPath();
  ctx.arc(s.x, s.y, 28 + Math.sin(game.time*2)*3, 0, Math.PI*2);
  ctx.fill();
  ctx.globalAlpha = 1;
}

function drawParticle(p){
  const s = worldToScreen(p.x, p.y);
  const t = p.t / p.life;
  const a = 1 - t;

  if (p.kind === "spark"){
    ctx.globalAlpha = a;
    ctx.strokeStyle = "rgba(45,212,191,0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(s.x - p.vx * 0.02, s.y - p.vy * 0.02);
    ctx.stroke();
    ctx.globalAlpha = 1;
  } else if (p.kind === "hit"){
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(255,77,109,0.9)";
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3 + (1-t)*2, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else if (p.kind === "flower"){
    ctx.globalAlpha = a;
    ctx.fillStyle = "rgba(124,92,255,0.85)";
    ctx.beginPath();
    ctx.arc(s.x, s.y, 3 + (1-t)*3, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawCornerText(){
  ctx.fillStyle = "rgba(233,238,252,0.75)";
  ctx.font = "800 14px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial";
  ctx.fillText(`Survival: +50 / 20s  |  Flowers: +120  |  Porcupines x2`, 18, 26);

  // minimap
  const mw = 170, mh = 110;
  const mx = canvas.width - mw - 18;
  const my = 18;

  ctx.fillStyle = "rgba(0,0,0,0.30)";
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  roundRectCanvas(mx, my, mw, mh, 14);
  ctx.fill();
  ctx.stroke();

  const sx = mw / WORLD.w;
  const sy = mh / WORLD.h;

  // flowers dots
  ctx.fillStyle = "rgba(124,92,255,0.85)";
  for (const f of game.flowers){
    if (!f.alive) continue;
    ctx.fillRect(mx + f.x * sx, my + f.y * sy, 2, 2);
  }

  // player dot
  ctx.fillStyle = "rgba(45,212,191,0.95)";
  ctx.fillRect(mx + player.x * sx - 2, my + player.y * sy - 2, 4, 4);

  // porcupines dots
  ctx.fillStyle = "rgba(255,77,109,0.9)";
  for (const p of porcupines){
    ctx.fillRect(mx + p.x * sx - 2, my + p.y * sy - 2, 4, 4);
  }

  // camera view rect
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1.5;
  const vw = canvas.width, vh = canvas.height;
  ctx.strokeRect(mx + cam.x*sx, my + cam.y*sy, vw*sx, vh*sy);
}

function roundRectCanvas(x,y,w,h,r){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}

// initial screen
showOverlay(
  "Ready?",
  "Survive, dodge spikes, use flowers to distract porcupines, and reach the level goals.",
  "Start Game"
);
resetAll();