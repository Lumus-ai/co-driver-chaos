// DOM HUD styled after the approved mockup: leaderboard, weather, minimap,
// dashboard (energy/speedo/tires/pit), co-driver cards, messages, monkey screamer.
import { CARDS } from "./cards.js";
import { Sound } from "./audio.js";
import { TEAMS } from "./sim.js";


export const ICONS = {
  bolt: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M13 2 L4 14 h6 l-2 8 L20 9 h-6 z" fill="#ffd21f" stroke="#7a5b00" stroke-width="1"/></svg>',
  tire: '<svg viewBox="0 0 24 24" width="22" height="22"><circle cx="12" cy="12" r="10" fill="#16161c"/><circle cx="12" cy="12" r="5.5" fill="#8a8a95"/><circle cx="12" cy="12" r="2.2" fill="#3a3a44"/><circle cx="12" cy="6.5" r="1.3" fill="#f7c90f"/></svg>',
  wrench: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M21 6.5 a5.5 5.5 0 0 1-7.3 5.2 L7 18.4 a2.1 2.1 0 0 1-3-3 l6.7-6.7 A5.5 5.5 0 0 1 17.5 3 l-3 3 2.5 2.5 3-3 z" fill="#c8ccd8"/></svg>',
  flame: '<svg viewBox="0 0 24 24" width="40" height="40"><path d="M12 2 c1 4-5 6-5 12 a5 5 0 0 0 10 0 c0-2-1-3.5-2-4.5 0 2-1 3-2 3 .5-3-1-7-1-10.5 z" fill="#ff7d1f" stroke="#b34300" stroke-width="1"/><path d="M12 12 c.4 1.6-1.5 2.2-1.5 4 a1.5 1.5 0 0 0 3 0 c0-1-.5-1.4-1-1.8 0 .8-.4 1.2-.5 1.2 .2-1.2 0-2.4 0-3.4z" fill="#ffd21f"/></svg>',
  wheel: '<svg viewBox="0 0 24 24" width="40" height="40"><circle cx="12" cy="12" r="10" fill="#16161c" stroke="#000" stroke-width="1"/><circle cx="12" cy="12" r="5.5" fill="#9a9aa5"/><circle cx="12" cy="12" r="2.2" fill="#3a3a44"/><path d="M12 2 v4 M12 18 v4 M2 12 h4 M18 12 h4" stroke="#333" stroke-width="1.6"/></svg>',
  oil: '<svg viewBox="0 0 24 24" width="40" height="40"><path d="M7 3 h10 v4 h-10 z M8 7 h8 l1.5 12 a2 2 0 0 1-2 2 h-7 a2 2 0 0 1-2-2 z" fill="#c93b2e" stroke="#7a1d12" stroke-width="1"/><path d="M8 12 h8" stroke="#7a1d12" stroke-width="1"/><path d="M17.5 14 c2 2 3 3.4 3 4.6 a3 3 0 0 1-6 0 c0-1.2 1-2.6 3-4.6z" fill="#1a1a22"/></svg>',
  monkey: '<svg viewBox="0 0 24 24" width="40" height="40"><circle cx="4.5" cy="9" r="2.6" fill="#8a4b21"/><circle cx="19.5" cy="9" r="2.6" fill="#8a4b21"/><circle cx="12" cy="12" r="8.5" fill="#8a4b21"/><ellipse cx="12" cy="14" rx="6" ry="5" fill="#e8b07a"/><circle cx="8.8" cy="10.5" r="2.1" fill="#fff"/><circle cx="15.2" cy="10.5" r="2.1" fill="#fff"/><circle cx="9.2" cy="10.8" r=".9" fill="#1a1a1a"/><circle cx="14.8" cy="10.8" r=".9" fill="#1a1a1a"/><ellipse cx="12" cy="16.5" rx="3" ry="2.4" fill="#4a1414"/></svg>',
  aero: '<svg viewBox="0 0 24 24" width="40" height="40"><path d="M3 16 c4-1 6-6 9-6 s5 5 9 6 c-3 1-5 3-9 3 s-6-2-9-3z" fill="#7ec8ff" stroke="#2a6a9e" stroke-width="1"/><path d="M3 9 c4-1 6-5 9-5 s5 4 9 5" fill="none" stroke="#7ec8ff" stroke-width="2"/></svg>',
  smoke: '<svg viewBox="0 0 24 24" width="40" height="40"><circle cx="8" cy="15" r="4.5" fill="#9a9aa5"/><circle cx="14" cy="12" r="5.5" fill="#b5b5c0"/><circle cx="17" cy="16" r="4" fill="#8a8a95"/></svg>',
  warn: '<svg viewBox="0 0 24 24" width="40" height="40"><path d="M12 2 L23 21 H1 z" fill="#e8b62a" stroke="#7a5b00" stroke-width="1.4"/><path d="M12 8 v6" stroke="#181818" stroke-width="2.4"/><circle cx="12" cy="17.5" r="1.4" fill="#181818"/></svg>',
  mirror: '<svg viewBox="0 0 24 24" width="40" height="40"><path d="M6 4 a8 8 0 0 1 13 3 l2-2 v6 h-6 l2.4-2.4 A5.5 5.5 0 0 0 6.5 9 z" fill="#7ec8ff"/><path d="M18 20 a8 8 0 0 1-13-3 l-2 2 v-6 h6 l-2.4 2.4 A5.5 5.5 0 0 0 17.5 15 z" fill="#c93b2e"/></svg>',
  sun: '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="12" cy="12" r="5" fill="#ffd21f"/><g stroke="#ffd21f" stroke-width="2"><path d="M12 1 v3 M12 20 v3 M1 12 h3 M20 12 h3 M4 4 l2 2 M18 18 l2 2 M20 4 l-2 2 M6 18 l-2 2"/></g></svg>',
  cloud: '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="9" cy="10" r="4.5" fill="#ffd21f"/><path d="M6 20 a4 4 0 0 1 0-8 6 6 0 0 1 11.5 1.5 A3.5 3.5 0 0 1 17 20 z" fill="#cfd8e3"/></svg>',
  rain: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M5 14 a4 4 0 0 1 0-8 6 6 0 0 1 11.5 1.5 A3.5 3.5 0 0 1 16 14 z" fill="#8fa1b3"/><g stroke="#5a9ae0" stroke-width="2"><path d="M8 16 l-1.5 4 M13 16 l-1.5 4 M18 16 l-1.5 4"/></g></svg>',
};
export const CARD_ICONS = { nitro:"flame", minus_wheel:"wheel", monkey:"monkey", oil:"oil", repair:"wrench", aero:"aero", smoke:"smoke", turborisk:"warn", mirror:"mirror" };

const CSS = `
#hud{font-family:'Arial Black',Arial,sans-serif;color:#fff;user-select:none;pointer-events:none}
.card,.pitbtn,.results,.results .btn,.fsbtn{pointer-events:auto}
.fsbtn{position:absolute;top:14px;left:50%;transform:translateX(-50%);width:40px;height:40px;border-radius:10px;background:rgba(18,18,24,.88);border:2px solid #f7c90f;color:#ffd21f;font-size:20px;line-height:1;cursor:pointer;display:none;padding:0}
.fsbtn.on{display:block}
.lb{position:absolute;top:14px;left:14px;background:rgba(18,18,24,.88);border:2px solid #f7c90f;border-radius:10px;padding:6px 10px;min-width:230px}
.lb .lap{font-size:19px;color:#fff;border-bottom:2px solid rgba(255,255,255,.15);padding-bottom:4px;margin-bottom:4px}
.lb .row{display:flex;align-items:center;gap:7px;padding:2.5px 2px;font-size:14px}
.lb .row.you{background:rgba(63,174,74,.25);border-radius:6px}
.lb .pos{width:18px;text-align:right;color:#ffd21f}
.lb .sw{width:15px;height:15px;border-radius:4px;flex:none}
.lb .nm{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lb .gap{color:#e06fe8;font-size:12px}
.wx{position:absolute;top:14px;right:14px;background:rgba(18,18,24,.88);border:2px solid #f7c90f;border-radius:26px;padding:6px 14px;font-size:18px;display:flex;gap:8px;align-items:center}
#minimap{position:absolute;top:64px;right:14px;background:rgba(14,14,20,.82);border:2px solid #f7c90f;border-radius:12px}
.dash{position:absolute;left:0;right:0;bottom:0;height:130px;display:flex;align-items:flex-end;justify-content:center;gap:10px;
  padding-bottom:8px}
.dash::before{content:"";position:absolute;left:0;right:0;bottom:0;height:104px;z-index:-1;
  background:linear-gradient(#f7b84a,#f7a51f);clip-path:polygon(6% 18%,94% 18%,100% 100%,0 100%);
  border-top:3px solid #b3541e}
.dash .panel{background:#1c1c26;border:3px solid #101018;border-radius:16px;height:78px;display:flex;align-items:center;gap:10px;padding:0 16px;box-shadow:inset 0 2px 0 rgba(255,255,255,.12)}
.dash .ic{font-size:26px}
.bar{width:190px;height:26px;background:#0c0c12;border-radius:13px;overflow:hidden;border:2px solid #000}
.bar>i{display:block;height:100%;border-radius:11px;transition:width .15s}
.bar.energy>i{background:linear-gradient(90deg,#ff9d1f,#ffd21f)}
.bar.tire>i{background:linear-gradient(90deg,#27c83f,#9df01f)}
.bar>i.low{background:linear-gradient(90deg,#d92b2b,#ff7d1f)}
.barpct{font-size:15px;width:48px;text-align:right}
.speedo{background:#14141d;border:4px solid #f7c90f;border-radius:50%;width:118px;height:118px;display:flex;flex-direction:column;align-items:center;justify-content:center;margin-bottom:-6px}
.speedo .v{font-size:38px;line-height:1}
.speedo .u{font-size:12px;color:#aab}
.pitbtn{cursor:pointer;background:#f7c90f;color:#181818;border:3px solid #101018;border-radius:50%;width:64px;height:64px;font-family:inherit;font-size:14px;font-weight:900;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px}
.pitbtn:active{transform:scale(.94)}
.cards{position:absolute;left:50%;bottom:140px;transform:translateX(-50%);display:flex;gap:12px;align-items:flex-end}
.cd-tab{position:absolute;left:50%;bottom:294px;transform:translateX(-50%);background:#1c1c26;border:2px solid #f7c90f;border-bottom:none;border-radius:10px 10px 0 0;padding:3px 14px;font-size:12px;color:#ffd21f}
.card{cursor:pointer;width:112px;min-height:150px;height:auto;border-radius:12px;border:3px solid #222;background:#20202c;display:flex;flex-direction:column;align-items:center;padding:8px 6px;position:relative;transition:transform .1s}
.card:hover{transform:translateY(-6px) scale(1.04)}
.card .art{margin:6px 0 2px;height:44px}
.card .nm{font-size:12.5px;text-align:center;line-height:1.15;min-height:30px}
.card .ds{font-family:Arial;font-size:10.5px;color:#cfd2dc;text-align:center;line-height:1.2}
.card .cost{position:absolute;top:5px;left:7px;font-size:13px;color:#ffd21f}
.card .key{position:absolute;top:4px;right:7px;background:#000a;border-radius:6px;padding:1px 7px;font-size:12px}
.card.empty{opacity:.35;cursor:default;border-style:dashed}
.card.nope{filter:grayscale(.7) brightness(.6)}
.centermsg{position:absolute;top:26%;left:50%;transform:translate(-50%,-50%) scale(1);font-size:44px;color:#ffd21f;
  text-shadow:0 3px 0 #000,0 0 24px rgba(0,0,0,.6);transition:opacity .3s;opacity:0;white-space:nowrap}
.countdown{position:absolute;top:34%;left:50%;transform:translate(-50%,-50%);display:flex;gap:18px}
.countdown .l{width:52px;height:52px;border-radius:50%;background:#2a2a34;border:3px solid #000}
.countdown .l.on{background:#e02f2f;box-shadow:0 0 26px #e02f2f}
.countdown .l.go{background:#27c83f;box-shadow:0 0 30px #27c83f}
#monkey{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:radial-gradient(circle,rgba(230,40,40,.45),rgba(120,10,10,.75));z-index:5}
#monkey canvas{width:46vmin;height:46vmin}
.results{position:absolute;inset:0;background:rgba(8,8,14,.92);display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:auto}
.results h1{color:#ffd21f;font-size:44px;margin-bottom:4px}
.results .sub{color:#aab;margin-bottom:18px;font-family:Arial}
.results table{border-collapse:collapse;font-size:17px;min-width:430px}
.results td,.results th{padding:7px 16px;text-align:left;border-bottom:1px solid #333}
.results tr.you td{background:rgba(63,174,74,.22)}
.results .btn{pointer-events:auto;cursor:pointer;margin-top:22px;background:#f7c90f;border:3px solid #000;border-radius:12px;padding:12px 34px;font-family:inherit;font-size:19px;font-weight:900}
.statusfx{position:absolute;bottom:262px;left:14px;display:flex;flex-direction:column;gap:4px}
.statusfx .fx{background:rgba(18,18,24,.85);border-left:4px solid #f7c90f;border-radius:6px;padding:4px 10px;font-size:12.5px}
.hint{position:absolute;bottom:8px;left:14px;font-family:Arial;font-size:12px;color:#ffffffa8}

.touchui{display:none}
.forcetouch .touchui{display:block}
@media (pointer:coarse){ .touchui{display:block} }
.tzone{position:absolute;top:12%;bottom:46%;width:38%;display:flex;align-items:center;justify-content:center;
  background:rgba(255,255,255,.05);border:2px dashed rgba(255,255,255,.28);border-radius:18px;margin:0 6px;pointer-events:none}
.tzone.left{left:0}
.tzone.right{right:0}
.tbrake{position:absolute;left:41%;right:41%;top:12%;bottom:46%;display:flex;align-items:center;justify-content:center;
  background:rgba(217,43,43,.10);border:2px dashed rgba(255,120,120,.45);border-radius:18px;color:#ff9a9a;font-size:13px;pointer-events:none}
@media (max-width:480px){ .tzone{top:27%;bottom:44%} .tbrake{top:27%;bottom:44%} }

.cards.mini{left:18px;transform:none;bottom:150px}
.cards.mini .card{width:60px;height:80px;min-height:0;padding:4px 3px;border-width:2px}
.cards.mini .card .art{margin:2px 0;height:30px}
.cards.mini .card .art svg{width:30px;height:30px}
.cards.mini .card .nm{display:none}
.cards.mini .card .ds{display:none}
.cards.mini .card .cost{font-size:11px;top:3px;left:4px}
.cards.mini .card .key{font-size:10px;padding:0 4px;top:2px;right:3px}
@media (max-width:640px){
 .lb{min-width:150px;padding:4px 8px}
 .lb .lap{font-size:15px}
 .lb .row{font-size:11px}
 #minimap{width:110px;height:150px;top:56px}
 .wx{font-size:14px;padding:4px 10px}
 .dash{height:96px;gap:5px}
 .dash::before{height:74px}
 .dash .panel{height:52px;padding:0 7px;gap:4px;border-radius:12px}
 .dash .ic svg{width:16px;height:16px}
 .bar{width:52px;height:16px}
 .barpct{font-size:11px;width:30px}
 .speedo{width:78px;height:78px;border-width:3px}
 .speedo .v{font-size:24px}
 .speedo .u{font-size:9px}
 .pitbtn{width:42px;height:42px;font-size:10px;border-width:2px}
 .pitbtn svg{width:14px;height:14px}
 .cards{bottom:104px;gap:7px}
 .cards.mini{bottom:104px}
 .card{width:76px;height:106px;padding:5px 4px;border-width:2px}
 .card .art{margin:3px 0 1px;height:30px}
 .card .art svg{width:28px;height:28px}
 .card .nm{font-size:10.5px;min-height:24px}
 .card .ds{font-size:9px}
 .cd-tab{bottom:216px;font-size:10px;padding:2px 10px}
 .centermsg{font-size:28px}
 .hint{display:none}
 .statusfx{bottom:216px}
 .results h1{font-size:28px}
 .results table{font-size:13px;min-width:0}
}

@media (max-height:480px) and (orientation:landscape){
 .lb{top:8px;left:8px;min-width:132px;padding:3px 7px;border-width:2px}
 .lb .lap{font-size:12px;padding-bottom:2px;margin-bottom:2px}
 .lb .row{font-size:10px;padding:1px 2px;gap:5px}
 .lb .sw{width:9px;height:9px}
 .lb .gap{font-size:9px}
 .wx{top:8px;right:8px;font-size:12px;padding:2px 9px}
 #minimap{width:78px;height:106px;top:40px;right:8px;border-width:2px}
 .dash{height:64px;gap:6px;padding-bottom:4px}
 .dash::before{height:50px}
 .dash .panel{height:42px;padding:0 8px;gap:5px;border-radius:10px;border-width:2px}
 .dash .ic svg{width:14px;height:14px}
 .bar{width:110px;height:13px}
 .barpct{font-size:11px;width:32px}
 .speedo{width:62px;height:62px;border-width:3px;margin-bottom:-2px}
 .speedo .v{font-size:20px}
 .speedo .u{font-size:8px}
 .pitbtn{width:34px;height:34px;font-size:9px;border-width:2px}
 .pitbtn svg{width:12px;height:12px}
 .cards,.cards.mini{left:8px;transform:none;bottom:70px;gap:5px}
 .card,.cards.mini .card{width:58px;height:70px;min-height:0;padding:3px 2px;border-width:2px}
 .card .art,.cards.mini .card .art{margin:2px 0;height:26px}
 .card .art svg,.cards.mini .card .art svg{width:24px;height:24px}
 .card .nm{font-size:8.5px;min-height:0;line-height:1.05;display:block}
 .card .ds{display:none}
 .card .cost{font-size:10px;top:2px;left:4px}
 .card .key{font-size:9px;padding:0 4px;top:2px;right:3px}
 .cd-tab{left:8px;transform:none;bottom:144px;font-size:9px;padding:2px 8px}
 .statusfx{top:8px;bottom:auto;left:148px}
 .statusfx .fx{font-size:10px;padding:2px 7px}
 .centermsg{font-size:24px;top:22%}
 .hint{display:none}
 .fsbtn{top:8px;width:30px;height:30px;font-size:15px}
 .results h1{font-size:26px}
 .results table{font-size:12px;min-width:0}
 .results .btn{margin-top:10px;padding:8px 24px;font-size:15px}
}
@media (pointer:coarse){ .hint{display:none} }
`;

function drawMonkeyCanvas() {
  const c = document.createElement("canvas"); c.width = c.height = 420;
  const x = c.getContext("2d");
  // red burst
  x.save(); x.translate(210, 210);
  for (let i = 0; i < 18; i++) {
    x.rotate(Math.PI / 9);
    x.fillStyle = i % 2 ? "#e03028" : "#ff5a3c";
    x.beginPath(); x.moveTo(0, 0); x.lineTo(-30, -210); x.lineTo(30, -210); x.fill();
  }
  x.restore();
  const brown = "#8a4b21", tan = "#e8b07a";
  // ears
  x.fillStyle = brown; x.beginPath(); x.arc(72, 165, 46, 0, 7); x.fill(); x.beginPath(); x.arc(348, 165, 46, 0, 7); x.fill();
  x.fillStyle = tan; x.beginPath(); x.arc(72, 165, 26, 0, 7); x.fill(); x.beginPath(); x.arc(348, 165, 26, 0, 7); x.fill();
  // head
  x.fillStyle = brown; x.beginPath(); x.arc(210, 200, 130, 0, 7); x.fill();
  // face
  x.fillStyle = tan; x.beginPath(); x.ellipse(210, 225, 95, 85, 0, 0, 7); x.fill();
  // eyes
  x.fillStyle = "#fff"; x.beginPath(); x.arc(165, 180, 34, 0, 7); x.fill(); x.beginPath(); x.arc(255, 180, 34, 0, 7); x.fill();
  x.fillStyle = "#1a1a1a"; x.beginPath(); x.arc(170, 184, 14, 0, 7); x.fill(); x.beginPath(); x.arc(250, 184, 14, 0, 7); x.fill();
  // brows raised
  x.strokeStyle = "#5e3212"; x.lineWidth = 9; x.lineCap = "round";
  x.beginPath(); x.moveTo(135, 132); x.quadraticCurveTo(165, 116, 196, 130); x.stroke();
  x.beginPath(); x.moveTo(224, 130); x.quadraticCurveTo(255, 116, 286, 132); x.stroke();
  // screaming mouth
  x.fillStyle = "#4a1414"; x.beginPath(); x.ellipse(210, 285, 52, 44, 0, 0, 7); x.fill();
  x.fillStyle = "#e05a5a"; x.beginPath(); x.ellipse(210, 300, 30, 20, 0, 0, 7); x.fill();
  x.fillStyle = "#fff"; x.fillRect(172, 246, 76, 14);
  for (let i = 0; i < 5; i++) { x.strokeStyle = "#c9c9c9"; x.lineWidth = 2; x.beginPath(); x.moveTo(180 + i * 15, 246); x.lineTo(180 + i * 15, 260); x.stroke(); }
  return c;
}

export class HUD {
  constructor(game) {
    this.game = game;
    this.root = document.getElementById("hud");
    const style = document.createElement("style"); style.textContent = CSS; document.head.appendChild(style);
    const I = ICONS;
    this.root.innerHTML = `
      <div class="lb"><div class="lap">LAP 1/${game.race.laps}</div><div class="rows"></div></div>
      <div class="wx"><span class="wi">☀️</span><span class="wt">24°</span></div>
      <canvas id="minimap" width="170" height="230"></canvas>
      <div class="cd-tab">CO-DRIVER</div>
      <div class="cards"></div>
      <div class="statusfx"></div>
      <div class="dash">
        <div class="panel"><span class="ic">${I.bolt}</span><div class="bar energy"><i></i></div><span class="barpct ep">43%</span></div>
        <div class="speedo"><span class="v">0</span><span class="u">КМ/Ч</span></div>
        <div class="panel"><button class="pitbtn">${I.wrench}Pit</button><span class="ic">${I.tire}</span><div class="bar tire"><i></i></div><span class="barpct tp">86%</span></div>
      </div>
      <button class="fsbtn" aria-label="Полный экран">⛶</button>
      <div class="centermsg"></div>
      <div class="countdown hidden"><div class="l"></div><div class="l"></div><div class="l"></div></div>
      <div id="monkey"></div>
      <div class="hint">🤖 ИИ за рулём · 1 2 3 карты · P пит-стоп</div>
      <div class="touchui" style="${((game.opts && game.opts.role) || 'driver') === 'codriver' ? 'display:none !important' : ''}">
        <div class="tzone left"><svg viewBox="0 0 24 24" width="46" height="46"><path d="M16 3 L6 12 L16 21 z" fill="#ffffff70"/></svg></div>
        <div class="tbrake">ТОРМОЗ</div>
        <div class="tzone right"><svg viewBox="0 0 24 24" width="46" height="46"><path d="M8 3 L18 12 L8 21 z" fill="#ffffff70"/></svg></div>
      </div>
    `;
    this.monkeyEl = this.root.querySelector("#monkey");
    this.monkeyEl.appendChild(drawMonkeyCanvas());
    this.msgEl = this.root.querySelector(".centermsg");
    this.msgTimer = null;
    this.mm = this.root.querySelector("#minimap").getContext("2d");
    this.minimapBase = this.buildMinimapBase();
    this.root.querySelector(".pitbtn").addEventListener("click", () => { game.race.player.wantsPit = true; });
    // fullscreen: only shown where the browser really supports it (not on iPhone Safari); user-gesture click, toggles in/out
    { const fb = this.root.querySelector(".fsbtn"), de = document.documentElement;
      const rq = de.requestFullscreen || de.webkitRequestFullscreen;
      const ok = !!rq && (document.fullscreenEnabled || document.webkitFullscreenEnabled);
      const cur = () => document.fullscreenElement || document.webkitFullscreenElement;
      if (ok) {
        fb.classList.add("on");
        for (const ev of ["touchstart", "touchend", "pointerdown"]) fb.addEventListener(ev, e => e.stopPropagation(), { passive: true });
        fb.addEventListener("click", () => {
          if (cur()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
          const fail = () => HUD.centerMsg("Браузер не разрешил полный экран", 2200);
          let p;
          try { p = rq.call(de); } catch (e) { fail(); return; }
          if (p && p.then) p.then(() => { try { screen.orientation.lock("landscape").catch(() => {}); } catch (e) {} }).catch(fail);
          setTimeout(() => { if (!cur()) fail(); }, 1200); // no fullscreen state after the request: tell the user, never pretend it is on
        });
        const upd = () => { fb.textContent = cur() ? "✕" : "⛶"; };
        document.addEventListener("fullscreenchange", upd); document.addEventListener("webkitfullscreenchange", upd);
      }
    }
    this.monkeyT = 0;
    this.lastCountdown = 4;
    this.resultsShown = false;
    this.cardEls = [];
    const role = (game.opts && game.opts.role) || "driver";
    if (role !== "codriver") {
      this.root.querySelector(".cards").classList.add("mini");
      this.root.querySelector(".cd-tab").style.display = "none";
    }
    this.renderCards();
  }

  static centerMsg(text, ms = 1000) {
    const el = document.querySelector(".centermsg");
    if (!el) return;
    el.textContent = text; el.style.opacity = 1;
    clearTimeout(el._t);
    el._t = setTimeout(() => el.style.opacity = 0, ms);
  }

  monkeyScream(isPlayer) {
    this.monkeyEl.style.display = "flex";
    const cv = this.monkeyEl.querySelector("canvas");
    cv.animate([{ transform: "scale(.2) rotate(-8deg)" }, { transform: "scale(1.15) rotate(4deg)" }, { transform: "scale(1) rotate(0)" }], { duration: 320, easing: "ease-out" });
    this.monkeyT = isPlayer ? 2.6 : 1.4;
  }

  buildMinimapBase() {
    const track = this.game.track;
    const pts = track.points;
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    pts.forEach(p => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
    const W = 170, H = 230, pad = 22;
    const sc = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
    const map = pts.map(p => [pad + (p.x - minX) * sc, pad + (p.z - minZ) * sc]);
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    x.strokeStyle = "#0c0c12"; x.lineWidth = 9; x.lineJoin = "round";
    x.beginPath(); map.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.closePath(); x.stroke();
    x.strokeStyle = "#e8e8ee"; x.lineWidth = 5;
    x.beginPath(); map.forEach(([px, py], i) => i ? x.lineTo(px, py) : x.moveTo(px, py)); x.closePath(); x.stroke();
    // start tick
    x.fillStyle = "#ffd21f"; x.beginPath(); x.arc(map[0][0], map[0][1], 4, 0, 7); x.fill();
    return { canvas: c, map };
  }

  renderCards() {
    const race = this.game.race;
    const wrap = this.root.querySelector(".cards");
    wrap.innerHTML = "";
    this.cardEls = [];
    for (let i = 0; i < 3; i++) {
      const card = race.hand[i];
      const el = document.createElement("div");
      if (card) {
        const afford = race.energy >= card.cost;
        el.className = "card" + (afford ? "" : " nope");
        const dsc = (card.descH && this.game.race.mode === "hostile") ? card.descH : card.desc;
        el.title = card.name + " — " + dsc;
        el.style.borderColor = card.color;
        el.style.boxShadow = `0 0 14px ${card.color}66`;
        el.innerHTML = `<span class="cost">⚡${card.cost}</span><span class="key">${i + 1}</span>
          <div class="art">${ICONS[CARD_ICONS[card.id]] || card.icon}</div><div class="nm">${card.name}</div><div class="ds">${(card.descH && this.game.race.mode === "hostile") ? card.descH : card.desc}</div>`;
        el.addEventListener("click", () => this.game.onCardPlay && this.game.onCardPlay(i));
      } else {
        el.className = "card empty";
        el.innerHTML = `<div class="art">…</div><div class="ds">новая карта</div>`;
      }
      wrap.appendChild(el);
      this.cardEls.push(el);
    }
  }

  update(dt) {
    const race = this.game.race, p = race.cars[this.game.followIdx] || race.player;
    // lap
    this.root.querySelector(".lb .lap").textContent = `LAP ${Math.min(p.lap, race.laps)}/${race.laps}`;
    // leaderboard
    const rows = race.standings().map((c, i) => {
      const gap = i === 0 ? "" : "+" + Math.max(0, (race.time - 0) - 0, 0); // replaced below
      return { c, i };
    });
    const leader = rows[0]?.c;
    this.root.querySelector(".lb .rows").innerHTML = rows.map(({ c, i }) => {
      let gap = "";
      if (i > 0 && leader) {
        const g = leader.progress(race.track) - c.progress(race.track);
        gap = g > race.track.length * 0.9 ? "+1 LAP" : "+" + (g / Math.max(20, leader.speed || 60)).toFixed(3);
      }
      return `<div class="row${c === p ? " you" : ""}"><span class="pos">${i + 1}</span>
        <span class="sw" style="background:${c.team.hud}"></span>
        <span class="nm">${c === p ? (c === race.player && !this.game.isGuestView ? "Ты" : "Ты·" + c.team.name) : c.team.name}</span><span class="gap">${c.finished ? "FIN" : gap}</span></div>`;
    }).join("");
    // weather
    const wi = this.root.querySelector(".wx .wi"), wt = this.root.querySelector(".wx .wt");
    wi.innerHTML = race.weather === "rain" ? ICONS.rain : race.weather === "cloud" ? ICONS.cloud : ICONS.sun;
    wt.textContent = race.temp + "°";
    // dashboard
    const kmh = Math.round(p.speed * 3.6);
    this.root.querySelector(".speedo .v").textContent = kmh;
    const eb = this.root.querySelector(".bar.energy i");
    eb.style.width = race.energy + "%";
    this.root.querySelector(".ep").textContent = Math.round(race.energy) + "%";
    const tb = this.root.querySelector(".bar.tire i");
    tb.style.width = p.tire + "%";
    tb.classList.toggle("low", p.tire < 25);
    this.root.querySelector(".tp").textContent = Math.round(p.tire) + "%";
    // status fx list
    const fx = [];
    if (p.nitroT > 0) fx.push(`НИТРО ${p.nitroT.toFixed(1)}с`);
    if (p.wheelT > 0) fx.push(`БЕЗ КОЛЕСА ${p.wheelT.toFixed(0)}с`);
    if (p.scaredT > 0) fx.push(`ВОДИТЕЛЬ В ШОКЕ`);
    if (p.aeroT > 0) fx.push(`АЭРО ${p.aeroT.toFixed(0)}с`);
    if (p.engineDead) fx.push(`ДВИГАТЕЛЬ МЁРТВ - ПИТ!`);
    if (p.tire < 25) fx.push(`РЕЗИНА КРИТИЧНАЯ`);
    this.root.querySelector(".statusfx").innerHTML = fx.map(f => `<div class="fx">${f}</div>`).join("");
    // cards refresh (cheap: rebuild only when hand/cost-afford changes)
    const sig = race.hand.map(c => c ? c.id : "-").join(",") + "|" + Math.floor(race.energy);
    if (sig !== this._cardSig) { this._cardSig = sig; this.renderCards(); }
    // monkey overlay timer
    if (this.monkeyT > 0) { this.monkeyT -= dt; if (this.monkeyT <= 0) this.monkeyEl.style.display = "none"; }
    // countdown
    const cd = this.root.querySelector(".countdown");
    if (race.state === "countdown") {
      cd.classList.remove("hidden");
      const n = Math.ceil(race.countdown - 0.8);
      [...cd.children].forEach((l, i) => { l.className = "l" + (i < 3 - Math.max(0, n) ? " on" : ""); });
      const step = Math.ceil(race.countdown - 0.8);
      if (step !== this.lastCountdown) { this.lastCountdown = step; if (step >= 1 && step <= 3) Sound.countBeep(false); }
    } else if (!this._goShown) {
      this._goShown = true;
      [...cd.children].forEach(l => l.className = "l go");
      Sound.countBeep(true);
      setTimeout(() => cd.classList.add("hidden"), 700);
    }
    // minimap
    const mm = this.mm;
    mm.clearRect(0, 0, 170, 230);
    mm.drawImage(this.minimapBase.canvas, 0, 0);
    race.standings().forEach((c, i) => {
      const idx = Math.max(0, Math.min(this.minimapBase.map.length - 1, Math.floor(((c.s % race.track.length + race.track.length) % race.track.length) / race.track.length * this.minimapBase.map.length)));
      const [mx, my] = this.minimapBase.map[idx];
      mm.fillStyle = c.team.hud;
      mm.beginPath(); mm.arc(mx, my, c === p ? 7 : 5.5, 0, 7); mm.fill();
      mm.fillStyle = "#fff"; mm.font = "bold 8px Arial"; mm.textAlign = "center"; mm.textBaseline = "middle";
      mm.fillText(String(i + 1), mx, my + 0.5);
    });
    // results
    // fire only on a real transition into finished: stale post-rematch snapshots
    // still carry the old finished state and must not re-render last race's table
    if (race.state === "finished" && this._prevRaceState !== "finished") { this.resultsShown = true; this.showResults(); }
    this._prevRaceState = race.state;
  }

  showResults() {
    const cm = this.root.querySelector(".centermsg");
    if (cm) { cm.style.display = "none"; cm.textContent = ""; }
    const race = this.game.race;
    const me = race.cars[this.game.followIdx] || race.player;
    const st = race.standings();
    const youPos = st.indexOf(me) + 1;
    const div = document.createElement("div");
    div.className = "results";
    div.innerHTML = `<h1>${youPos === 1 ? "ПОБЕДА!" : `ФИНИШ — P${youPos}`}</h1>
      <div class="sub">Обгонов: ${me === race.player ? race.overtakeCount : "—"} · Лучший круг: ${isFinite(me.bestLap) ? fmtT(me.bestLap) : "—"}</div>
      <table><tr><th>#</th><th>Пилот</th><th>Лучший круг</th></tr>
      ${st.map((c, i) => `<tr${c === me ? ' class="you"' : ""}><td>${i + 1}</td><td>${c === me ? (c === race.player && !this.game.isGuestView ? "Ты" : "Ты·" + c.team.name) : c.team.name}</td>
        <td>${isFinite(c.bestLap) ? fmtT(c.bestLap) : "—"}</td></tr>`).join("")}
      </table>
      ${this.game.isGuestView
        ? '<div class="sub wait">Хост решает — новый заезд начнётся автоматически…</div>'
        : '<button class="btn">ЕЩЁ ГОНКУ</button>'}`;
    const btn = div.querySelector(".btn");
    if (btn) {
      if (this.game.onRematch) btn.addEventListener("click", () => this.game.onRematch());
      else btn.addEventListener("click", () => location.reload());
    }
    this.root.appendChild(div);
  }

  resetResults() {
    this.resultsShown = false;
    this._prevRaceState = this.game && this.game.race ? this.game.race.state : null;
    const r = this.root.querySelector(".results");
    if (r) r.remove();
  }
}
function fmtT(sec) {
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60), ms = Math.floor((sec % 1) * 1000);
  return `${m}:${String(s).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
          }
