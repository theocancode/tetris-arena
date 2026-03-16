'use strict';
const BLOCK = 28, PANEL = 22, MINI = 9;
// Merge renderer-specific colour keys into the shared window.COLORS from engine.js
Object.assign(window.COLORS, {
  GARBAGE:'#2b3d50', bg:'#080c14',
  grid:'rgba(255,255,255,0.035)', border:'rgba(100,180,255,0.12)'
});

class ParticleSystem {
  constructor() { this.p = []; }
  burst(x, y, color, n=12) {
    for (let i=0;i<n;i++) {
      const a=(Math.PI*2*i/n)+Math.random()*0.4, sp=1.5+Math.random()*3.5;
      this.p.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-1.5,life:1,
        decay:0.03+Math.random()*0.025,sz:2+Math.random()*3,color});
    }
  }
  lineClear(bx, by, rows) {
    const cols=[COLORS.I,COLORS.O,COLORS.T,COLORS.S,COLORS.Z];
    for (const r of rows)
      for (let c=0;c<10;c++)
        this.burst(bx+c*BLOCK+BLOCK/2, by+r*BLOCK+BLOCK/2, cols[c%cols.length], 4);
  }
  update() {
    this.p=this.p.filter(p=>p.life>0);
    for (const p of this.p){p.x+=p.vx;p.y+=p.vy;p.vy+=0.12;p.life-=p.decay;p.vx*=0.97;}
  }
  draw(ctx) {
    for (const p of this.p){
      ctx.save(); ctx.globalAlpha=p.life;
      ctx.fillStyle=p.color; ctx.shadowColor=p.color; ctx.shadowBlur=4;
      ctx.fillRect(p.x-p.sz/2,p.y-p.sz/2,p.sz,p.sz); ctx.restore();
    }
  }
}

function drawBlock(ctx,x,y,sz,type){
  if(!type||type==='GHOST') return;
  const col=COLORS[type]||type;
  ctx.fillStyle='rgba(0,0,0,0.4)'; ctx.fillRect(x+3,y+3,sz-2,sz-2);
  ctx.fillStyle=col; ctx.fillRect(x+1,y+1,sz-2,sz-2);
  const g=ctx.createLinearGradient(x+1,y+1,x+1,y+sz-1);
  g.addColorStop(0,'rgba(255,255,255,0.38)');g.addColorStop(0.4,'rgba(255,255,255,0.08)');g.addColorStop(1,'rgba(0,0,0,0.25)');
  ctx.fillStyle=g; ctx.fillRect(x+1,y+1,sz-2,sz-2);
  ctx.fillStyle='rgba(255,255,255,0.52)'; ctx.fillRect(x+1,y+1,sz-2,2);
  ctx.fillStyle='rgba(255,255,255,0.22)'; ctx.fillRect(x+1,y+3,2,sz-4);
  ctx.fillStyle='rgba(0,0,0,0.38)'; ctx.fillRect(x+1,y+sz-3,sz-2,2);
  ctx.strokeStyle='rgba(255,255,255,0.10)'; ctx.lineWidth=0.5;
  ctx.strokeRect(x+2,y+2,sz-4,sz-4);
}

function drawGhost(ctx,x,y,sz,type){
  const col=COLORS[type]||'#fff';
  ctx.save(); ctx.globalAlpha=0.16;
  ctx.fillStyle=col; ctx.fillRect(x+1,y+1,sz-2,sz-2); ctx.restore();
  ctx.strokeStyle=col; ctx.globalAlpha=0.30; ctx.lineWidth=1;
  ctx.strokeRect(x+1.5,y+1.5,sz-3,sz-3); ctx.globalAlpha=1;
}

function drawBoard(ctx,board,ox,oy,sz,cols,rows){
  ctx.fillStyle=COLORS.bg; ctx.fillRect(ox,oy,cols*sz,rows*sz);
  ctx.strokeStyle=COLORS.grid; ctx.lineWidth=0.5;
  for(let c=1;c<cols;c++){ctx.beginPath();ctx.moveTo(ox+c*sz,oy);ctx.lineTo(ox+c*sz,oy+rows*sz);ctx.stroke();}
  for(let r=1;r<rows;r++){ctx.beginPath();ctx.moveTo(ox,oy+r*sz);ctx.lineTo(ox+cols*sz,oy+r*sz);ctx.stroke();}
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++){
    const cell=board[r]?.[c]; if(!cell) continue;
    if(cell==='GHOST') drawGhost(ctx,ox+c*sz,oy+r*sz,sz,'I');
    else drawBlock(ctx,ox+c*sz,oy+r*sz,sz,cell);
  }
  ctx.strokeStyle=COLORS.border; ctx.lineWidth=1.5; ctx.strokeRect(ox,oy,cols*sz,rows*sz);
}

function drawPieceInBox(ctx,type,ox,oy,bw,bh,csz){
  if(!type) return;
  const sh=window.SHAPES[type]; if(!sh) return;
  let r0=99,r1=-1,c0=99,c1=-1;
  for(let r=0;r<sh.length;r++) for(let c=0;c<sh[r].length;c++)
    if(sh[r][c]){r0=Math.min(r0,r);r1=Math.max(r1,r);c0=Math.min(c0,c);c1=Math.max(c1,c);}
  const pw=(c1-c0+1)*csz,ph=(r1-r0+1)*csz;
  const sx=ox+(bw-pw)/2,sy=oy+(bh-ph)/2;
  for(let r=r0;r<=r1;r++) for(let c=c0;c<=c1;c++)
    if(sh[r][c]) drawBlock(ctx,sx+(c-c0)*csz,sy+(r-r0)*csz,csz,type);
}

function renderMain(ctx,engine,x,y,particles){
  const board=engine.serialiseBoardWithPiece();
  drawBoard(ctx,board,x,y,BLOCK,10,20);
  if(particles){particles.update();particles.draw(ctx);}
}

function renderHold(ctx,hold,holdUsed,x,y){
  const W=PANEL*4,H=PANEL*3;
  ctx.save(); if(holdUsed) ctx.globalAlpha=0.35;
  roundRect(ctx,x,y,W,H,6);
  ctx.fillStyle='rgba(255,255,255,0.03)'; ctx.fill();
  ctx.strokeStyle=holdUsed?'rgba(255,255,255,0.06)':COLORS.border; ctx.lineWidth=1; ctx.stroke();
  ctx.fillStyle='rgba(255,255,255,0.28)'; ctx.font='10px "Share Tech Mono",monospace'; ctx.fillText('HOLD',x+4,y-5);
  drawPieceInBox(ctx,hold,x,y,W,H,PANEL); ctx.restore();
}

function renderNext(ctx,queue,x,y){
  const W=PANEL*4,bh=PANEL*3,gap=5;
  ctx.fillStyle='rgba(255,255,255,0.28)'; ctx.font='10px "Share Tech Mono",monospace'; ctx.fillText('NEXT',x+4,y-5);
  for(let i=0;i<Math.min(5,queue.length);i++){
    const by=y+i*(bh+gap);
    roundRect(ctx,x,by,W,bh,4);
    ctx.fillStyle=i===0?'rgba(255,255,255,0.06)':'rgba(255,255,255,0.025)'; ctx.fill();
    drawPieceInBox(ctx,queue[i],x,by,W,bh,i===0?PANEL:PANEL-4);
  }
}

function renderStats(ctx,score,lines,level,combo,x,y){
  const rows=[['SCORE',String(score).padStart(7,'0')],['LINES',String(lines).padStart(5,'0')],['LEVEL',String(level)]];
  let sy=y;
  for(const [lbl,val] of rows){
    ctx.fillStyle='rgba(255,255,255,0.30)'; ctx.font='9px "Share Tech Mono",monospace'; ctx.fillText(lbl,x,sy);
    ctx.fillStyle='#fff'; ctx.font='bold 15px "Share Tech Mono",monospace'; ctx.fillText(val,x,sy+16);
    sy+=36;
  }
  if(combo>1){
    ctx.save(); ctx.fillStyle=COLORS.O; ctx.shadowColor=COLORS.O; ctx.shadowBlur=10;
    ctx.font=`bold ${Math.min(10+combo,18)}px "Orbitron",monospace`;
    ctx.fillText(`${combo}× COMBO`,x,sy+10); ctx.restore();
  }
}

function renderGarbageMeter(ctx,pending,boardX,boardY){
  const x=boardX+10*BLOCK+4,W=6,H=20*BLOCK;
  ctx.fillStyle='rgba(255,255,255,0.04)'; ctx.fillRect(x,boardY,W,H);
  if(pending>0){
    const h=Math.min(pending/12,1)*H, gy=boardY+H-h;
    const danger=pending>=6;
    ctx.fillStyle=danger?'#ff1133':'#ff8800';
    ctx.shadowColor=ctx.fillStyle; ctx.shadowBlur=danger?8:4;
    ctx.fillRect(x,gy,W,h); ctx.shadowBlur=0;
    ctx.fillStyle=danger?'#ff5566':'#ffaa44';
    ctx.font='bold 9px "Share Tech Mono",monospace';
    ctx.textAlign='center'; ctx.fillText(pending,x+W/2,boardY+H+12); ctx.textAlign='left';
  }
}

function renderMini(ctx,board,name,pending,x,y,alive){
  const W=10*MINI,H=20*MINI;
  if(!alive){
    ctx.fillStyle='rgba(0,0,0,0.75)'; ctx.fillRect(x,y,W,H);
    ctx.strokeStyle='rgba(255,50,50,0.3)'; ctx.lineWidth=1; ctx.strokeRect(x,y,W,H);
    ctx.fillStyle='rgba(255,80,80,0.6)'; ctx.font='bold 9px "Orbitron",monospace';
    ctx.textAlign='center'; ctx.fillText('OUT',x+W/2,y+H/2+3); ctx.textAlign='left'; return;
  }
  ctx.fillStyle=COLORS.bg; ctx.fillRect(x,y,W,H);
  for(let r=0;r<20;r++) for(let c=0;c<10;c++){
    const cell=board[r]?.[c]; if(!cell) continue;
    const col=COLORS[cell]||cell;
    ctx.fillStyle=col; ctx.fillRect(x+c*MINI+1,y+r*MINI+1,MINI-1,MINI-1);
    ctx.fillStyle='rgba(255,255,255,0.22)'; ctx.fillRect(x+c*MINI+1,y+r*MINI+1,MINI-1,2);
  }
  ctx.strokeStyle=COLORS.border; ctx.lineWidth=1; ctx.strokeRect(x,y,W,H);
  ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(x,y+H-13,W,13);
  ctx.fillStyle='rgba(255,255,255,0.65)'; ctx.font='7px "Share Tech Mono",monospace';
  ctx.textAlign='center'; ctx.fillText(name.slice(0,10),x+W/2,y+H-4); ctx.textAlign='left';
  if(pending>0){
    const bh=Math.min(pending/8,1)*H;
    ctx.fillStyle=pending>=4?'#ff1133':'#ff8800';
    ctx.fillRect(x-4,y+H-bh,3,bh);
  }
}

function renderComboFlash(ctx,combo,W,H,alpha){
  if(alpha<=0) return;
  const cols=[COLORS.I,COLORS.O,COLORS.T,COLORS.S,COLORS.Z,COLORS.J,COLORS.L];
  ctx.save(); ctx.globalAlpha=alpha*0.22;
  ctx.fillStyle=cols[(combo-1)%cols.length]; ctx.fillRect(0,0,W,H); ctx.restore();
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath(); ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y); ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r); ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h); ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r); ctx.quadraticCurveTo(x,y,x+r,y); ctx.closePath();
}

window.Renderer={drawBoard,renderMain,renderHold,renderNext,renderStats,
  renderGarbageMeter,renderMini,renderComboFlash,drawPieceInBox,
  ParticleSystem,BLOCK,PANEL,MINI,COLORS};
