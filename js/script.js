// ================================================================
// えぬチャリ v3
// ================================================================

function fillRoundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  } else {
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y);
    ctx.arcTo(x+w,y,x+w,y+r,r); ctx.lineTo(x+w,y+h-r);
    ctx.arcTo(x+w,y+h,x+w-r,y+h,r); ctx.lineTo(x+r,y+h);
    ctx.arcTo(x,y+h,x,y+h-r,r); ctx.lineTo(x,y+r);
    ctx.arcTo(x,y,x+r,y,r); ctx.closePath();
  }
}

const STORAGE_KEY_BEST  = 'enu-chari:bestScore';
const STORAGE_KEY_PLAYS = 'enu-chari:totalPlays';

const BASE_H         = 600;
const PLAYER_X_RATIO = 0.22;
const GRAVITY        = 0.55;
const JUMP_FORCE     = -13;
const TERRAIN_LEVELS = [450, 370, 290];  // LOW / MID / HIGH（小さいほど高い）

const canvas = document.getElementById('game-canvas');
const ctx    = canvas.getContext('2d');
let W = 0, H = 0, scale = 1;

function resizeCanvas() {
  W = window.innerWidth; H = window.innerHeight;
  canvas.width = W; canvas.height = H;
  scale = H / BASE_H;
}

const STATE = { TITLE: 0, PLAYING: 1, GAMEOVER: 2 };
let state = STATE.TITLE;
let distance = 0, bestScore = 0, totalPlays = 0, newBestSet = false;

function loadStorage() {
  bestScore  = parseInt(localStorage.getItem(STORAGE_KEY_BEST)  || '0', 10);
  totalPlays = parseInt(localStorage.getItem(STORAGE_KEY_PLAYS) || '0', 10);
}
function saveStorage() {
  const d = Math.floor(distance);
  newBestSet = d > bestScore;
  if (newBestSet) { bestScore = d; localStorage.setItem(STORAGE_KEY_BEST, bestScore); }
  totalPlays++;
  localStorage.setItem(STORAGE_KEY_PLAYS, totalPlays);
}

// ---------------------------------------------------------------- 空
const SKY_PHASES = [
  { at: 0,    top: '#0d1b2a', bottom: '#1a2e45' },
  { at: 200,  top: '#1a1a4e', bottom: '#6b3a7a' },
  { at: 400,  top: '#ff6b35', bottom: '#ffcc02' },
  { at: 700,  top: '#1a7fd4', bottom: '#87ceeb' },
  { at: 1100, top: '#e07020', bottom: '#ffd700' },
  { at: 1500, top: '#0a0a1a', bottom: '#1a1a3a' },
];

function getSkyPhase(dist) {
  let i = 0;
  for (let j = SKY_PHASES.length - 1; j >= 0; j--) {
    if (dist >= SKY_PHASES[j].at) { i = j; break; }
  }
  const a = SKY_PHASES[i], b = SKY_PHASES[Math.min(i+1, SKY_PHASES.length-1)];
  const t = b.at > a.at ? Math.min((dist - a.at) / (b.at - a.at), 1) : 1;
  return { a, b, t };
}

function lerpColor(c1, c2, t) {
  const h = (s,p) => parseInt(s.slice(p,p+2),16), ri = Math.round;
  const [r1,g1,b1]=[h(c1,1),h(c1,3),h(c1,5)], [r2,g2,b2]=[h(c2,1),h(c2,3),h(c2,5)];
  return '#'+ri(r1+(r2-r1)*t).toString(16).padStart(2,'0')
           +ri(g1+(g2-g1)*t).toString(16).padStart(2,'0')
           +ri(b1+(b2-b1)*t).toString(16).padStart(2,'0');
}

const STARS = Array.from({length:60}, () => ({
  x: Math.random(), y: Math.random()*0.62, r: Math.random()*1.5+0.3,
}));

function getStarOpacity(dist) {
  const n = dist<400 ? 1-dist/400 : dist>1100 ? (dist-1100)/400 : 0;
  return Math.max(0, Math.min(n*0.9, 0.9));
}

// ---------------------------------------------------------------- 雲
let clouds = [];
function initClouds() {
  clouds = [];
  const lw = W/scale;
  for (let i=0;i<7;i++) clouds.push(makeCloud(i*(lw/6)));
}
function makeCloud(x) {
  return { x, y: BASE_H*(0.07+Math.random()*0.27), w:55+Math.random()*75, h:18+Math.random()*17, spd:0.14+Math.random()*0.2 };
}
function updateClouds(dt) {
  const lw=W/scale, spd=getSpeed();
  for (const c of clouds) {
    c.x -= c.spd*spd*0.28*dt*60;
    if (c.x+c.w<0) { c.x=lw+c.w; c.y=BASE_H*(0.07+Math.random()*0.27); c.w=55+Math.random()*75; c.h=18+Math.random()*17; }
  }
}

// ---------------------------------------------------------------- 背景描画
function drawBackground() {
  const {a,b,t} = getSkyPhase(distance);
  const grad = ctx.createLinearGradient(0,0,0,H);
  grad.addColorStop(0,   lerpColor(a.top,    b.top,    t));
  grad.addColorStop(0.7, lerpColor(a.bottom, b.bottom, t));
  grad.addColorStop(1,   lerpColor(a.bottom, b.bottom, t));
  ctx.fillStyle = grad; ctx.fillRect(0,0,W,H);
  const sa = getStarOpacity(distance);
  if (sa > 0) {
    ctx.save();
    for (const s of STARS) {
      ctx.beginPath(); ctx.arc(s.x*W, s.y*H, s.r*scale, 0, Math.PI*2);
      ctx.fillStyle = `rgba(255,255,255,${sa})`; ctx.fill();
    }
    ctx.restore();
  }
}
function drawClouds() {
  const n = distance<400 ? 1-distance/400 : distance>1100 ? (distance-1100)/400 : 0;
  ctx.save();
  ctx.fillStyle = `rgba(255,255,255,${Math.max(0.1, 0.38*(1-n))})`;
  for (const c of clouds) {
    const [cx,cy,cw,ch] = [c.x*scale, c.y*scale, c.w*scale, c.h*scale];
    ctx.beginPath(); ctx.ellipse(cx,       cy,       cw,      ch,      0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx-cw*.35,cy+ch*.2, cw*.58,  ch*.68,  0,0,Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(cx+cw*.35,cy+ch*.2, cw*.52,  ch*.68,  0,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- 速度 / 難易度
function getSpeed()      { return Math.min(4 + distance*0.003, 10); }
function getDifficulty() { return Math.min(distance/1000, 1); }

// ---------------------------------------------------------------- 地形
let terrain = [];

function levelOf(y) { return TERRAIN_LEVELS.indexOf(y); }

function getGroundY(x) {
  for (const seg of terrain) {
    if (seg.type==='ground' && x>=seg.x && x<seg.x+seg.width) return seg.y;
  }
  return null;
}

function initTerrain() {
  terrain = [];
  const lw = W/scale;
  terrain.push({ type:'ground', x:-130, width:lw+530, y:TERRAIN_LEVELS[0] });
}

function generateTerrain() {
  const lw=W/scale, targetX=lw+440;
  let rightX = player.x+100, currentY = TERRAIN_LEVELS[0];

  // 最右端と直近の地面高さを取得
  for (const seg of terrain) {
    if (seg.x+seg.width > rightX) rightX = seg.x+seg.width;
  }
  for (let i=terrain.length-1; i>=0; i--) {
    if (terrain[i].type==='ground') { currentY=terrain[i].y; break; }
  }
  if (rightX >= targetX) return;

  const diff = getDifficulty();

  while (rightX < targetX) {
    // 地面セグメント追加
    const gw = 35 + Math.random()*55;
    terrain.push({ type:'ground', x:rightX, width:gw, y:currentY });
    rightX += gw;

    if (distance < 40) continue;  // 序盤は変化なし

    // 次の高さを決定
    const hRoll = Math.random();
    const hProb = 0.45 + diff*0.15;  // 45%〜60%
    let nextY = currentY;
    if (hRoll < hProb) {
      const lv = levelOf(currentY);
      let newLv;
      if (hRoll < 0.08+diff*0.08 && diff>0.3) {
        newLv = lv===0 ? 2 : lv===2 ? 0 : (Math.random()<0.5 ? 0 : 2);
      } else {
        if      (lv===0) newLv=1;
        else if (lv===2) newLv=1;
        else             newLv=Math.random()<0.5 ? 0 : 2;
      }
      nextY = TERRAIN_LEVELS[newLv];
    }

    const ascending = nextY < currentY;
    const stayFlat  = nextY === currentY;

    const gapProb = ascending ? 1.0
      : stayFlat  ? Math.min(0.18+diff*0.32, 0.48)
      :             Math.min(0.38+diff*0.28, 0.62);

    if (Math.random() < gapProb) {
      const hd   = Math.abs(currentY-nextY);
      const minG = ascending ? 80+hd*0.15 : 120;
      const maxG = ascending ? 120+hd*0.10 : 170+diff*50;
      const gapW = minG + Math.random()*Math.max(0, maxG-minG);
      terrain.push({ type:'gap', x:rightX, width:gapW });
      rightX += gapW;
      // ★ バグ修正: gap の直後に必ず新高さのアンカーを置く
      // （置かないと次回呼び出し時に currentY が gap 前に戻る）
      const gw2 = 35 + Math.random()*55;
      terrain.push({ type:'ground', x:rightX, width:gw2, y:nextY });
      rightX += gw2;
    } else if (nextY !== currentY) {
      // 直接崖落とし: gap なしで高さ変化、アンカーを置く
      const gw2 = 35 + Math.random()*55;
      terrain.push({ type:'ground', x:rightX, width:gw2, y:nextY });
      rightX += gw2;
    }

    currentY = nextY;
  }
}

function updateTerrain(dt) {
  const spd=getSpeed(), lw=W/scale;
  for (const seg of terrain) seg.x -= spd*dt*60;
  terrain = terrain.filter(s => s.x+s.width > -lw*0.15);
}

// ---------------------------------------------------------------- 地形描画
const TERRAIN_PALETTE = [
  { surface:'#283828', body:'#182818', edge:'rgba(0,212,255,0.65)' },
  { surface:'#283438', body:'#182428', edge:'rgba(0,212,255,0.52)' },
  { surface:'#262e3c', body:'#161e2c', edge:'rgba(0,212,255,0.40)' },
];

function drawTerrain() {
  for (const seg of terrain) {
    if (seg.type==='gap') continue;
    const lv  = Math.max(0, levelOf(seg.y));
    const col = TERRAIN_PALETTE[lv];
    const sx=seg.x*scale, sy=seg.y*scale, sw=seg.width*scale;

    const g = ctx.createLinearGradient(0,sy,0,H);
    g.addColorStop(0,    col.surface);
    g.addColorStop(0.12, col.body);
    g.addColorStop(1,    '#080e08');
    ctx.fillStyle = g; ctx.fillRect(sx, sy, sw, H-sy);

    ctx.fillStyle = col.edge; ctx.fillRect(sx, sy, sw, 2*scale);

    ctx.save();
    ctx.strokeStyle='rgba(255,255,255,0.13)'; ctx.lineWidth=1.5*scale;
    ctx.setLineDash([16*scale,18*scale]); ctx.lineDashOffset=-(distance*3.0)%34;
    ctx.beginPath(); ctx.moveTo(sx, sy+5*scale); ctx.lineTo(sx+sw, sy+5*scale); ctx.stroke();
    ctx.restore();

    if (sx > -10) {
      const sh = ctx.createLinearGradient(sx,0,sx+9*scale,0);
      sh.addColorStop(0,'rgba(0,0,0,0.38)'); sh.addColorStop(1,'rgba(0,0,0,0)');
      ctx.fillStyle=sh; ctx.fillRect(sx,sy,9*scale,H-sy);
    }
  }
}

// ---------------------------------------------------------------- プレイヤー
let player = {};

function resetPlayer() {
  player = {
    x: (W/scale)*PLAYER_X_RATIO, y: TERRAIN_LEVELS[0],
    vy: 0, w: 46, h: 46,
    onGround:true, jumpCount:0, maxJumps:2,
    frame:0, frameTimer:0,
    dead:false, deadTimer:0,
  };
}

function playerJump() {
  if (player.dead) return;
  if (player.jumpCount < player.maxJumps) {
    player.vy=JUMP_FORCE; player.onGround=false; player.jumpCount++;
  }
}

function updatePlayer(dt) {
  player.vy += GRAVITY*dt*60;
  player.y  += player.vy*dt*60;

  if (!player.dead) {
    const gy = getGroundY(player.x);
    if (gy!==null && player.y>=gy && player.vy>=0) {
      player.y=gy; player.vy=0; player.onGround=true; player.jumpCount=0;
    } else {
      player.onGround=false;
    }
    // ギャップ上（直下に地面なし）かつ LOW地面から30単位以上落下で死亡
    // getGroundY が null でない場合は崖落とし着地中なので死なない
    if (getGroundY(player.x) === null && player.y >= TERRAIN_LEVELS[0]+30) {
      player.dead=true; saveStorage();
      spawnParticles(player.x, TERRAIN_LEVELS[0]-20);
    }
    player.frameTimer += dt*60;
    if (player.frameTimer>6) { player.frame=(player.frame+1)%4; player.frameTimer=0; }
  } else {
    player.deadTimer += dt*60;
    if (player.deadTimer>55) { state=STATE.GAMEOVER; showGameoverScreen(); }
  }
}

// ---------------------------------------------------------------- 描画: 車輪
function drawWheel(cx, cy, r, angle) {
  ctx.strokeStyle='#00d4ff'; ctx.lineWidth=2.5*scale;
  ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.stroke();
  ctx.strokeStyle='rgba(0,212,255,0.45)'; ctx.lineWidth=1.2*scale;
  for (let i=0;i<3;i++) {
    const a=angle+(Math.PI*2/3)*i;
    ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(a)*r,cy+Math.sin(a)*r); ctx.stroke();
  }
  ctx.fillStyle='#1a2332'; ctx.beginPath(); ctx.arc(cx,cy,r*0.18,0,Math.PI*2); ctx.fill();
  ctx.strokeStyle='#00d4ff'; ctx.lineWidth=1.5*scale; ctx.stroke();
}

// ---------------------------------------------------------------- 描画: プレイヤー（シンプル化）
function drawPlayer() {
  ctx.save();
  ctx.translate(player.x*scale, player.y*scale);

  const s  = scale;
  const wr = 9*s;
  const wa = (state===STATE.PLAYING && !player.dead)
    ? (Date.now()/150)%(Math.PI*2) : 0;

  // 車輪（小さく）
  drawWheel(-9*s, -wr, wr, wa);
  drawWheel( 9*s, -wr, wr, wa);

  // フレーム（縮小）
  ctx.strokeStyle='#00d4ff'; ctx.lineWidth=2*s; ctx.lineCap='round';
  ctx.beginPath();
  ctx.moveTo(-6*s,-24*s); ctx.lineTo(  0,   -wr);   // シートチューブ
  ctx.moveTo(-6*s,-24*s); ctx.lineTo( 6*s, -17*s);  // トップチューブ
  ctx.moveTo(  0,   -wr); ctx.lineTo( 6*s, -17*s);  // ダウンチューブ
  ctx.moveTo(-6*s,-24*s); ctx.lineTo(-9*s,  -wr);   // シートステー
  ctx.moveTo(  0,   -wr); ctx.lineTo(-9*s,  -wr);   // チェーンステー
  ctx.moveTo( 6*s,-17*s); ctx.lineTo( 9*s,  -wr);   // フォーク
  ctx.moveTo( 6*s,-17*s); ctx.lineTo(10*s, -25*s);  // ハンドル
  ctx.stroke();

  ctx.restore();
}

// ---------------------------------------------------------------- パーティクル
let particles = [];

function spawnParticles(x, y) {
  for (let i=0;i<12;i++) {
    const angle=(Math.PI*2/12)*i+Math.random()*0.3, spd=2+Math.random()*4;
    particles.push({ x,y, vx:Math.cos(angle)*spd, vy:Math.sin(angle)*spd-3,
      life:1, color:['#00d4ff','#CC785C','#e8f4f8'][i%3], r:2+Math.random()*3 });
  }
}
function updateParticles(dt) {
  for (const p of particles) {
    p.x+=p.vx*dt*60; p.vy+=0.3*dt*60; p.y+=p.vy*dt*60; p.life-=0.028*dt*60;
  }
  particles = particles.filter(p=>p.life>0);
}
function drawParticles() {
  ctx.save();
  for (const p of particles) {
    ctx.globalAlpha=p.life; ctx.fillStyle=p.color;
    ctx.beginPath(); ctx.arc(p.x*scale,p.y*scale,p.r*scale,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- UI
function updateHUD() {
  document.getElementById('current-distance').textContent = Math.floor(distance);
  document.getElementById('hud-best-value').textContent   = bestScore;
}
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function showTitleScreen() {
  showScreen('screen-title');
  const b=localStorage.getItem(STORAGE_KEY_BEST);
  document.getElementById('title-best').textContent = b&&b!=='0' ? `ベスト記録：${b}m` : '';
}
function showGameoverScreen() {
  document.getElementById('result-distance').textContent = Math.floor(distance);
  document.getElementById('result-plays').textContent    = totalPlays;
  if (newBestSet && Math.floor(distance)>0) {
    document.getElementById('new-best-row').style.display    = '';
    document.getElementById('normal-best-row').style.display = 'none';
    document.getElementById('result-best').textContent       = bestScore;
  } else {
    document.getElementById('new-best-row').style.display    = 'none';
    document.getElementById('normal-best-row').style.display = '';
    document.getElementById('result-best-normal').textContent = bestScore;
  }
  showScreen('screen-gameover');
}

// ---------------------------------------------------------------- シェア
document.getElementById('btn-share').addEventListener('click', () => {
  const d=Math.floor(distance);
  const text=`えぬチャリで${d}m走った！\n崖だらけの道をタップジャンプで走り抜けるゲーム。\n#えぬチャリ @enu_dev`;
  const url=location.href;
  if (navigator.share) {
    navigator.share({text,url}).catch(()=>fallbackShare(text,url));
  } else {
    fallbackShare(text,url);
  }
});
function fallbackShare(text,url) {
  navigator.clipboard.writeText(`${text}\n${url}`).then(()=>{
    const btn=document.getElementById('btn-share'), orig=btn.textContent;
    btn.textContent='コピーしました！'; setTimeout(()=>{btn.textContent=orig;},2000);
  }).catch(()=>{
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,'_blank');
  });
}

// ---------------------------------------------------------------- ゲームループ
let lastTime = 0;

function gameLoop(ts) {
  const dt = Math.min((ts-lastTime)/1000, 0.05);
  lastTime = ts;
  ctx.clearRect(0,0,W,H);
  drawBackground(); updateClouds(dt); drawClouds();

  if (state===STATE.PLAYING) {
    // 死亡判定を先行させ、死亡フレームは地形スクロール不要にする（復活バグ対策）
    updatePlayer(dt);
    if (!player.dead) {
      distance += getSpeed()*dt*3.5;
      updateTerrain(dt);
      generateTerrain();
    }
    updateParticles(dt);
    drawTerrain(); drawPlayer(); drawParticles(); updateHUD();

  } else if (state===STATE.GAMEOVER) {
    updateParticles(dt);
    drawTerrain(); drawPlayer(); drawParticles();

  } else {
    drawTerrain();
    player.frameTimer+=dt*60;
    if (player.frameTimer>8) { player.frame=(player.frame+1)%4; player.frameTimer=0; }
    drawPlayer();
  }
  requestAnimationFrame(gameLoop);
}

// ---------------------------------------------------------------- 開始 / リセット
function startGame() {
  distance=0; particles=[]; newBestSet=false;
  resetPlayer(); initTerrain(); initClouds(); generateTerrain();
  state=STATE.PLAYING; showScreen('screen-play');
}

// ---------------------------------------------------------------- 入力
function handleInput(e) {
  if (e.target?.closest?.('button')) return;
  if (e.cancelable) e.preventDefault();
  if (state===STATE.TITLE)   { startGame();  return; }
  if (state===STATE.PLAYING) { playerJump(); }
}

const wrapper = document.getElementById('game-wrapper');
wrapper.addEventListener('touchstart', handleInput, {passive:false});
wrapper.addEventListener('mousedown',  handleInput);
document.getElementById('btn-retry').addEventListener('click', startGame);
document.addEventListener('keydown', e => {
  if (e.code==='Space'||e.code==='ArrowUp') { e.preventDefault(); handleInput(e); }
});

// ---------------------------------------------------------------- 初期化
function init() {
  loadStorage(); resizeCanvas(); resetPlayer(); initTerrain(); initClouds();
  showTitleScreen();
  lastTime = performance.now();
  requestAnimationFrame(gameLoop);
}
window.addEventListener('resize', ()=>{ resizeCanvas(); initClouds(); });
init();
