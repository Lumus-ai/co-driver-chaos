// Boot, menus, input, network orchestration, main loop.
import { Game } from "./game.js";
import * as THREE from "../lib/three.module.js";
import { buildCar } from "./world3d.js";
import { TEAMS } from "./sim.js";
import { Sound } from "./audio.js";
import { drawCard, CARDS, DISABLED_CARDS } from "./cards.js";
import { Net, makeRoomCode } from "./net.js";

const MENU_CSS = `
#menu{display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 30%,#232338,#0b0b12 75%);font-family:'Arial Black',Arial,sans-serif;color:#fff}
#menu .box{text-align:center;max-width:640px;padding:20px}
#menu h1{font-size:56px;color:#ffd21f;text-shadow:0 4px 0 #b3541e,0 8px 24px #000}
#menu h2{font-size:16px;color:#9fb;margin:2px 0 22px;font-family:Arial;color:#9aa}
#menu .mbtn{display:block;width:340px;margin:10px auto;padding:14px 18px;font-family:inherit;font-size:17px;font-weight:900;
  background:#f7c90f;color:#181818;border:3px solid #000;border-radius:12px;cursor:pointer}
#menu .mbtn.alt{background:#2c2c3c;color:#fff;border-color:#555}
#menu .mbtn:active{transform:scale(.97)}
#menu .row{display:flex;gap:10px;justify-content:center;margin:8px 0}
#menu .opt{padding:9px 16px;border-radius:10px;border:2px solid #555;background:#22222e;color:#ddd;cursor:pointer;font-family:inherit;font-weight:700}
#menu .opt.sel{background:#3fae4a;border-color:#2c7a34;color:#fff}
#menu .lbl{font-family:Arial;font-size:13px;color:#9aa;margin-top:14px}
#menu input{font-size:22px;padding:8px;width:150px;text-align:center;text-transform:uppercase;border-radius:10px;border:2px solid #555;background:#15151f;color:#ffd21f;font-family:monospace}
#menu .code{font-size:42px;letter-spacing:8px;color:#ffd21f;font-family:monospace;margin:14px 0}
#menu .err{color:#ff7d6e;font-family:Arial;font-size:13px;min-height:18px}
#menu .small{font-family:Arial;font-size:12px;color:#778;margin-top:16px;line-height:1.5}
`;

class App {
  constructor() {
    this.menuEl = document.getElementById("menu");
    const style = document.createElement("style"); style.textContent = MENU_CSS; document.head.appendChild(style);
    this.keys = { left: false, right: false, gas: false, brake: false };
    this.game = null;
    this.net = null;
    this.isHost = false; this.isGuest = false;
    this.autoCo = false;
    this.lastTs = 0;
    this.paused = false;
    // in-race pause menu (design approved by user 28.10): button left of the fullscreen button, overlay with continue/restart/exit
    const mb = document.createElement("button"); mb.id = "raceMenuBtn"; mb.textContent = "☰ МЕНЮ";
    mb.style.cssText = "position:fixed;top:14px;left:calc(50% - 132px);z-index:50;height:40px;padding:0 14px;font:bold 13px Arial;border-radius:10px;border:2px solid #f7c90f;background:rgba(18,18,24,.88);color:#ffd21f;cursor:pointer;display:none;touch-action:manipulation";
    mb.onclick = () => this.showRaceMenu();
    document.body.appendChild(mb); this.raceMenuBtn = mb;
    const ov = document.createElement("div"); ov.id = "raceMenu";
    ov.style.cssText = "position:fixed;inset:0;z-index:70;background:rgba(4,6,10,.45);display:none;align-items:center;justify-content:center";
    const panel = "display:block;width:230px;margin:8px auto;padding:9px 14px;font-family:inherit;font-size:14px;font-weight:900;border-radius:10px;cursor:pointer";
    ov.innerHTML = '<div style="background:rgba(10,12,18,.92);border:2px solid #f5c518;border-radius:12px;padding:14px 22px;text-align:center;font-family:Arial,sans-serif;max-height:92vh;overflow-y:auto">'
      + '<div style="font-size:15px;color:#fff;letter-spacing:1px;margin:2px 0 10px;font-weight:900">ПАУЗА</div>'
      + '<button data-rm="resume" style="' + panel + ';background:#f7c90f;color:#181818;border:3px solid #000">▶ ПРОДОЛЖИТЬ</button>'
      + '<button data-rm="restart" style="' + panel + ';background:#2c2c3c;color:#fff;border:3px solid #555">↻ ЗАНОВО</button>'
      + '<button data-rm="exit" style="' + panel + ';background:#2c2c3c;color:#fff;border:3px solid #555">В ГЛАВНОЕ МЕНЮ</button></div>';
    ov.onclick = (e) => { const a = e.target.dataset && e.target.dataset.rm;
      if (a === "resume") this.hideRaceMenu();
      else if (a === "restart") { this.hideRaceMenu(); this.startLocal(this.autoCo ? "solo" : "hot"); }
      else if (a === "exit") location.reload(); };
    document.body.appendChild(ov); this.raceMenuEl = ov;
    this.bindKeys();
    this.showMainMenu();
  }

  bindKeys() {
    const set = (e, v) => {
      const k = e.key.toLowerCase();
      if (["arrowleft", "a"].includes(k)) this.keys.left = v;
      if (["arrowright", "d"].includes(k)) this.keys.right = v;
      if (["arrowup", "w"].includes(k)) this.keys.gas = v;
      if (["arrowdown", "s"].includes(k)) this.keys.brake = v;
      if (k === "p" && v && this.game && !this.isGuest) this.game.race.player.wantsPit = true;
      if (k === "escape" && v && this.game && !this.isGuest && !this.isHost) this.toggleRaceMenu();
      if (["1", "2", "3"].includes(k) && v) this.playCard(parseInt(k) - 1);
      if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(k)) e.preventDefault();
    };
    window.addEventListener("keydown", e => { Sound.resume(); set(e, true); });
    window.addEventListener("keyup", e => set(e, false));
    // touch: hold left/right screen edge to steer; auto-gas on touch devices; tap brake strip center
    const app = document.getElementById("app");
    const touchSet = (e, v) => {
      let any = false;
      for (const t of (e.changedTouches ? Array.from(e.touches) : [])) {
        const x = t.clientX / window.innerWidth, y = t.clientY / window.innerHeight;
        if (y > 0.55) continue; // HUD zone
        if (x < 0.42) { this.keys.left = v; any = true; }
        else if (x > 0.58) { this.keys.right = v; any = true; }
        else { this.keys.brake = v; any = true; }
      }
      if (v === false) { this.keys.left = false; this.keys.right = false; this.keys.brake = false; }
      if (any) e.preventDefault && e.preventDefault();
    };
    app.addEventListener("touchstart", e => { Sound.resume(); this.autoGas = true; touchSet(e, true); }, { passive: false });
    app.addEventListener("touchmove", e => touchSet(e, true), { passive: false });
    app.addEventListener("touchend", e => touchSet(e, false));
    app.addEventListener("touchcancel", e => touchSet(e, false));
  }

  menu(html) { this.menuEl.innerHTML = `<div class="box">${html}</div>`; this.menuEl.classList.remove("hidden"); }
  hideMenu() { this.menuEl.classList.add("hidden"); }

  showMainMenu() {
    this.menu(`
      <h1>CO-DRIVER<br>CHAOS</h1>
      <h2>один рулит — второй пакостит</h2>
      <div class="lbl">РЕЖИМ КАРТ</div>
      <div class="row">
        <button class="opt ${this.prankMode !== "hostile" ? "sel" : ""}" data-m="coop">😈 СВОЕМУ ВОДИТЕЛЮ</button>
        <button class="opt ${this.prankMode === "hostile" ? "sel" : ""}" data-m="hostile">💣 СОПЕРНИКАМ</button>
      </div>
      <div class="lbl">КРУГИ</div>
      <div class="row">
        <button class="opt ${this.laps !== 3 ? "" : "sel"}" data-l="3">3</button>
        <button class="opt ${!this.laps || this.laps === 6 ? "sel" : ""}" data-l="6">6</button>
      </div>
      <div style="height:14px"></div>
      <button class="mbtn" data-a="solo">🏎 СОЛО + АВТО-НАПАРНИК</button>
      <button class="mbtn" data-a="hot">🐵 ВДВОЁМ НА ОДНОЙ КЛАВИАТУРЕ</button>
      <button class="mbtn alt" data-a="host">🌐 СОЗДАТЬ СЕТЕВУЮ ГОНКУ</button>
      <button class="mbtn alt" data-a="join">🔗 ПОДКЛЮЧИТЬСЯ ПО КОДУ</button>
      <div class="small">Болид ведёт ИИ - ты играешь стратегию: 1/2/3 или клик по картам, P — вызов в боксы.<br>Энергия ⚡ копится сама и за обгоны.</div>
    `);
    this.menuEl.querySelectorAll("[data-m]").forEach(b => b.onclick = () => { this.prankMode = b.dataset.m; this.showMainMenu(); });
    this.menuEl.querySelectorAll("[data-l]").forEach(b => b.onclick = () => { this.laps = parseInt(b.dataset.l); this.showMainMenu(); });
    this.menuEl.querySelector('[data-a="solo"]').onclick = () => this.startLocal("solo");
    this.menuEl.querySelector('[data-a="hot"]').onclick = () => this.startLocal("hot");
    this.menuEl.querySelector('[data-a="host"]').onclick = () => this.hostGame();
    this.menuEl.querySelector('[data-a="join"]').onclick = () => this.joinMenu();
  }

  startLocal(kind) {
    Sound.resume();
    this.autoCo = kind === "solo";
    this.game = new Game(document.getElementById("gl"), { laps: this.laps || 6, mode: this.prankMode || "coop", role: "codriver" }); // AI drives locally; humans play cards -> co-driver HUD (named cards, no touch steering zones)
    this.game.race.player.ai = true; // AI drives; the player plays strategy (cards + pit calls)
    this.game.onCardPlay = (i) => this.playCard(i);
    this.hideMenu();
    this.raceMenuBtn.style.display = "block";
    this.loopStart();
  }

  async hostGame() {
    Sound.resume();
    const code = makeRoomCode();
    this.net = new Net();
    try {
      await this.net.connect(code, "host");
    } catch (e) {
      this.menu(`<h1>СЕТЬ</h1><div class="err">Не удалось подключиться к серверу.<br>Запусти игру через <b>node server.js</b> и открой http://localhost:8080</div>
        <button class="mbtn alt" onclick="location.reload()">НАЗАД</button>`);
      return;
    }
    this.isHost = true;
    this.menu(`<h1>ЖДУ НАПАРНИКА</h1><div class="lbl">КОД КОМНАТЫ — продиктуй второму игроку:</div>
      <div class="code">${code}</div>
      <div class="small">Он должен открыть http://&lt;твой-IP&gt;:8080 и ввести код.<br>Как только подключится — гонка начнётся.</div>
      <button class="mbtn alt" onclick="location.reload()">ОТМЕНА</button>`);
    this.initCrew();
    this.net.onMessage = (msg) => this.hostOnMessage(msg);
  }

  initCrew() {
    // crew roster: slot order fills car by car (host always drives car 0)
    this.crewList = [{ id: "host", car: 0, role: "driver" }];
    this.crewSlots = [];
    for (let c = 0; c < 6; c++) {
      if (c > 0) this.crewSlots.push([c, "driver"]);
      this.crewSlots.push([c, "codriver"]);
    }
  }

  hostOnMessage(msg) {
    if ((msg.t === "peer" && msg.what === "guest_joined") || msg.t === "hello") {
      if (msg.t === "hello" && msg.id) this.assignCrew(msg.id);
      if (!this.game) this.startHostRace();
      else if (msg.t === "hello") this.net.send({ t: "start", laps: this.game.race.laps, mode: this.game.race.mode, roster: this.crewList });
    }
    if (msg.t === "card" && this.game) this.playCard(msg.idx, true, msg.id);
    if (msg.t === "input" && this.game && msg.id) {
      const mem = (this.crewList || []).find(x => x.id === msg.id);
      if (mem && mem.role === "driver" && mem.car > 0) {
        const car = this.game.race.cars[mem.car];
        car.remoteInput = { left: !!msg.l, right: !!msg.r, gas: !!msg.g, brake: !!msg.b };
        car.remoteT = 1.5;
        if (!this._remoteLogged) this._remoteLogged = {};
        if (!this._remoteLogged[mem.car]) { this._remoteLogged[mem.car] = true; console.log("HOST REMOTE INPUT ACTIVE car" + mem.car); }
      }
    }
  }

  assignCrew(cid) {
    if (this.crewList.some(x => x.id === cid)) { return; }
    const used = this.crewList.length - 1; // host occupies slot -1
    const slot = used < this.crewSlots.length ? this.crewSlots[used] : [0, "codriver"];
    this.crewList.push({ id: cid, car: slot[0], role: slot[1] });
    console.log("CREW assign", cid, "car" + slot[0], slot[1]);
    this.net.send({ t: "roster", list: this.crewList });
  }

  startHostRace() {
    this.game = new Game(document.getElementById("gl"), { laps: this.laps || 6, mode: this.prankMode || "coop", role: "driver" });
    this.game.race.player.ai = true; // AI drives; the player plays strategy (cards + pit calls)
    this.game.onCardPlay = (i) => this.playCard(i);
    this.game.onRematch = () => this.hostRematch();
    this.game.netForward = [];
    this.hideMenu();
    this.netStateT = 0;
    this.loopStart();
    this.net.send({ t: "start", laps: this.game.race.laps, mode: this.game.race.mode, roster: this.crewList });
  }

  hostRematch() {
    if (!this.game || this.game.race.state !== "finished") return;
    this.game.resetRace();
    this.net.send({ t: "start", laps: this.game.race.laps, mode: this.game.race.mode, roster: this.crewList });
    console.log("HOST REMATCH SENT");
  }

  // small status banner for connection states (not the big centre message: that one covers the HUD)
  netNotice(text, hideMs = 0, code = null) {
    let el = document.getElementById("netnotice");
    if (!el) {
      el = document.createElement("div"); el.id = "netnotice";
      el.style.cssText = "position:fixed;left:50%;top:44%;transform:translateX(-50%);max-width:86vw;z-index:60;background:rgba(10,12,18,.88);color:#fff;border:2px solid #f5c518;border-radius:12px;padding:10px 16px;font:600 16px/1.35 system-ui,sans-serif;text-align:center;pointer-events:none";
      document.body.appendChild(el);
    }
    clearTimeout(this._nnT);
    el.innerHTML = "";
    const t = document.createElement("div"); t.textContent = text; el.appendChild(t);
    if (code) {
      const h = document.createElement("div"); h.style.cssText = "font-weight:400;font-size:14px;margin-top:4px"; h.textContent = "Когда хост вернётся: меню, Подключение, код " + code + ". Прогресс этой гонки не сохранится."; el.appendChild(h);
      const b = document.createElement("button"); b.textContent = "В МЕНЮ"; b.style.cssText = "margin-top:8px;pointer-events:auto;padding:6px 18px;font:700 14px system-ui;background:#f5c518;border:0;border-radius:8px;cursor:pointer"; b.onclick = () => location.reload(); el.appendChild(b);
      el.style.pointerEvents = "none";
    }
    el.style.top = code ? "33%" : "44%"; el.style.display = "block";
    if (hideMs) this._nnT = setTimeout(() => { el.style.display = "none"; }, hideMs);
  }

  // guest lost its own connection: retry quietly, tell the player what is happening
  guestAutoReconnect(code) {
    if (this._reconnecting || this._leaving) return;
    this._reconnecting = true; let tries = 0;
    this.netNotice("Связь потеряна, переподключаюсь…");
    const attempt = async () => {
      tries++;
      try {
        await this.net.connect(code, "guest");
        this.net.send({ t: "hello", id: this.cid });
        this._reconnecting = false; this.netNotice("Связь восстановлена", 2500); return;
      } catch (e) {}
      if (tries >= 15) { this._reconnecting = false; this.netNotice("Не удалось подключиться.", 0, code); return; }
      setTimeout(attempt, 2000);
    };
    setTimeout(attempt, 1000);
  }

  joinMenu() {
    this.menu(`<h1>ПОДКЛЮЧЕНИЕ</h1><div class="lbl">КОД КОМНАТЫ</div>
      <input id="rcode" maxlength="4" placeholder="XXXX"><div class="err"></div>
      <button class="mbtn">В ГОНКУ</button><button class="mbtn alt" onclick="location.reload()">НАЗАД</button>`);
    const inp = this.menuEl.querySelector("#rcode"); inp.focus();
    this.menuEl.querySelector(".mbtn").onclick = async () => {
      const code = inp.value.trim().toUpperCase();
      if (code.length !== 4) { this.menuEl.querySelector(".err").textContent = "Код из 4 символов"; return; }
      this.net = new Net();
      try { await this.net.connect(code, "guest"); }
      catch { this.menuEl.querySelector(".err").textContent = "Нет связи с сервером"; return; }
      this.isGuest = true;
      this.net.onClose = () => this.guestAutoReconnect(code);
      if (!this.cid) this.cid = "g" + Math.random().toString(36).slice(2, 8);
      this.net.send({ t: "hello", id: this.cid });
      this._helloT = setInterval(() => { if (!this.game) this.net.send({ t: "hello", id: this.cid }); }, 2000);
      this.menu(`<h1>ПОДКЛЮЧЁН</h1><div class="small">Ждём распределения экипажа и старта гонки…</div>`);
      this.net.onMessage = (msg) => {
        if (msg.t === "roster") this.applyRoster(msg.list);
        else if (msg.t === "start") {
          if (msg.roster) this.applyRoster(msg.roster);
          if (this.myCar === undefined) return; // start raced ahead of my roster entry; host resends start on my next hello
          if (!this.game) this.startGuestRace(msg);
          else if (this.game.race.state === "finished") this.game.resetRace(); // true rematch only; a stray duplicate start mid-race must not wipe progress
        }
        else if (msg.t === "snap" && this.game) {
          if (this._hostGone && !this._reloading) { this._reloading = true; this.netNotice("Хост вернулся. Перезаходим…"); setTimeout(() => location.reload(), 2500); return; } // new host has no roster for me
          this.latestSnap = msg; this._snapAt = performance.now();
          if (msg.ev && msg.ev.length) this.game.pendingGuestEvents = (this.game.pendingGuestEvents || []).concat(msg.ev);
        }
        else if (msg.t === "peer" && msg.what === "host_left") { this._hostGone = true; this.netNotice("Хост отключился, игра остановлена.", 0, this.net && this.net.room); }
      };
    };
  }

  applyRoster(list) {
    this.crewList = list;
    const me = list.find(x => x.id === this.cid);
    if (me && (this.myCar === undefined || !this.game)) {
      this.myCar = me.car; this.myRole = me.role;
      console.log("GUEST ROLE", this.myRole, "car" + this.myCar);
      const what = this.myRole === "driver" ? `ВОДИТЕЛЬ болида №${this.myCar + 1}` : `НАПАРНИК болида №${this.myCar + 1}`;
      if (!this.game) this.menu(`<h1>ПОДКЛЮЧЁН</h1><div class="small">Ты — <b>${what}</b>.<br>${this.myRole === "driver" ? "Рули: стрелки/WASD или тач-зоны." : "Разыгрывай карты клавишами 1/2/3 или тапом."}<br>Ждём старта…</div>`);
    }
  }

  startGuestRace(msg) {
    clearInterval(this._helloT);
    Sound.resume();
    if (this.myCar === undefined) { this.myCar = 0; this.myRole = "codriver"; }
    const hudRole = this.myRole === "driver" ? "driver" : "codriver";
    this.game = new Game(document.getElementById("gl"), { laps: msg.laps, mode: msg.mode, role: hudRole, followIdx: this.myCar });
    this.game.isGuestView = true;
    if (this.myRole === "driver") this.game.race.cars[this.myCar].ai = true; // sim-side placeholder; snapshots own the state
    this.game.onCardPlay = (i) => this.playCard(i);
    this.hideMenu();
    this.loopStart();
  }

  playCard(idx, fromNet = false, fromId = null) {
    if (!this.game) return;
    const race = this.game.race;
    if (this.isGuest) { this.net.send({ t: "card", id: this.cid, idx }); return; }
    // which crew plays? local UI = crew 0 (host); network card = sender's crew
    let carIdx = 0;
    if (fromNet && fromId) {
      const mem = (this.crewList || []).find(x => x.id === fromId);
      if (!mem || mem.role !== "codriver") return;
      carIdx = mem.car;
    }
    const hand = race.crews[carIdx].hand;
    const card = hand[idx];
    if (!card) return;
    const res = race.playCard(card.id, carIdx);
    if (res.ok) { hand.splice(idx, 1); race.crews[carIdx].drawT = 2.2; }
    if (fromNet) console.log("HOST CARD crew car" + carIdx, card.id, res.ok ? "OK" : "DENIED");
  }

  autoCoDriver(dt) {
    // simple auto co-driver for solo mode
    const race = this.game.race, p = race.player;
    if (race.state !== "racing") return;
    this.autoT = (this.autoT || 0) - dt;
    if (this.autoT > 0) return;
    const idx = race.hand.findIndex(c => {
      if (race.energy < c.cost) return false;
      if (c.id === "repair") return p.wheelT > 0 || p.engineDead || p.tire < 15;
      if (c.id === "nitro") return Math.abs(race.track.at(p.s + 60).curv) < 0.004 && p.nitroT <= 0;
      if (c.id === "oil" || c.id === "smoke") {
        return race.cars.some(o => o !== p && race.wrapS(p.s - o.s) > 0 && race.wrapS(p.s - o.s) < 40);
      }
      if (c.id === "turborisk") return p.tire > 50 && !p.engineDead && Math.random() < 0.4;
      if (c.id === "aero") return Math.random() < 0.25;
      if (c.id === "minus_wheel" || c.id === "monkey" || c.id === "mirror") return Math.random() < 0.12;
      return false;
    });
    if (idx >= 0) { this.playCard(idx); this.autoT = 4 + Math.random() * 4; }
  }

  showRaceMenu() { if (!this.game || this.isHost || this.isGuest) return; this.paused = true; Sound.setEngine(0, false); this.raceMenuEl.style.display = "flex"; }
  hideRaceMenu() { this.paused = false; this.raceMenuEl.style.display = "none"; }
  toggleRaceMenu() { this.paused ? this.hideRaceMenu() : this.showRaceMenu(); }

  loopStart() {
    if (this._loopOn) return; // restart reuses the single rAF chain
    this._loopOn = true;
    this.lastTs = performance.now();
    requestAnimationFrame((ts) => this.loop(ts));
  }

  loop(ts) {
    const dt = Math.min(0.05, (ts - this.lastTs) / 1000) || 0.016;
    this.lastTs = ts;
    if (this.paused) { requestAnimationFrame((t) => this.loop(t)); return; } // pause menu open: freeze sim/cards/AI, keep the chain alive
    const race = this.game.race;
    // hand refill
    if (!this.isGuest && race.state !== "finished") {
      for (const cr of race.crews) {
        if (cr.hand.length < 3 && cr.drawT <= 0) { cr.hand.push(drawCard(race.mode)); cr.drawT = 2.2; }
      }
    }
    if (this.autoCo) this.autoCoDriver(dt);
    if (this.isGuest && this.latestSnap) this.applySnapshot(this.latestSnap, dt);
    if (this.isGuest && this.myRole === "driver" && !this._noInput && !this._inpInt && this.game && race.state === "racing") {
      // timer-driven (NOT rAF): render stalls must not starve the input stream,
      // otherwise the host's AI would grab the car during a hitch even though the human holds neutral input
      this._inpInt = setInterval(() => {
        if (this.game && this.game.race.state === "racing" && this.net) {
          this.net.send({ t: "input", id: this.cid, l: !!this.keys.left, r: !!this.keys.right, g: !!this.keys.gas, b: !!this.keys.brake });
        }
      }, 66);
      console.log("GUEST INPUT LOOP 15Hz timer started");
    }
    if (this.autoGas && !this.keys.brake) this.keys.gas = true;
    this.game.update(dt, this.isGuest ? null : this.keys);
    if (this.isHost) this.hostNetUpdate(dt);
    requestAnimationFrame((t) => this.loop(t));
  }

  hostNetUpdate(dt) {
    this.netStateT = (this.netStateT || 0) - dt;
    if (this.netStateT > 0) return;
    this.netStateT = 0.08;
    const race = this.game.race;
    const snap = {
      t: "snap",
      cars: race.cars.map(c => [Math.round(c.s * 10) / 10, Math.round(c.d * 100) / 100, Math.round(c.speed * 10) / 10,
        c.lap, c.nitroT > 0 ? 1 : 0, c.wheelT > 0 ? 1 : 0, c.scaredT > 0 ? 1 : 0, c.spinT > 0 ? 1 : 0,
        Math.round(c.tire), c.engineDead ? 1 : 0, c.inPit ? 1 : 0, c.finished ? 1 : 0,
        isFinite(c.bestLap) ? Math.round(c.bestLap * 1000) / 1000 : 0]),
      energy: Math.round(race.energy), hand: race.hand.map(c => c.id),
      crews: race.crews.map(cr => [Math.round(cr.energy), cr.hand.map(c => c.id)]),
      laps: race.laps, mode: race.mode,
      weather: race.weather, temp: race.temp, state: race.state, cd: race.countdown,
      time: Math.round(race.time * 10) / 10,
      ev: this.game.netForward,
    };
    this.game.netForward = [];
    this.net.send(snap);
  }

  applySnapshot(snap, dt) {
    const race = this.game.race;
    snap.cars.forEach((s, i) => {
      const c = race.cars[i];
      const rate = Math.min(1, dt * 10);
      // s wraps: lerp carefully
      const age = this._snapAt ? Math.min(0.25, (performance.now() - this._snapAt) / 1000) : 0;
      let ds = s[0] + (s[10] || s[11] ? 0 : s[2] * age) - c.s; // extrapolate along speed between snapshots
      const L = race.track.length;
      if (ds > L / 2) ds -= L; if (ds < -L / 2) ds += L;
      c.s += (s[10] || s[11] ? 0 : s[2] * dt) + ds * Math.min(1, dt * 6); c.d += (s[1] - c.d) * rate; c.speed = s[2];
      if (s[3] < c.lap) c.bestLap = Infinity; // new race/reset: stale lap history must not survive
      c.lap = s[3];
      c.nitroT = s[4] ? Math.max(c.nitroT, 0.2) : 0;
      if (s[5] && c.wheelT <= 0) c.wheelT = 5; if (!s[5] && c.wheelT > 0) c.wheelT = 0;
      if (s[6] && c.scaredT <= 0) c.scaredT = 1.2;
      if (s[7] && c.spinT <= 0) c.spinT = 0.8;
      c.tire = s[8]; c.engineDead = !!s[9]; c.inPit = !!s[10]; c.finished = !!s[11];
      if (s[12]) c.bestLap = s[12];
    });
    race.energy = snap.energy;
    race.hand = snap.hand.map(id => CARDS[id]).filter(c => c && !DISABLED_CARDS.has(c.id));
    if (snap.crews && this.myCar !== undefined && snap.crews[this.myCar]) {
      // HUD reads crew-0 aliases: mirror MY crew's resources there
      race.crews[0].energy = snap.crews[this.myCar][0];
      race.crews[0].hand = snap.crews[this.myCar][1].map(id => CARDS[id]).filter(c => c && !DISABLED_CARDS.has(c.id));
    }
    if (race.weather !== snap.weather) race.weather = snap.weather;
    race.temp = snap.temp;
    if (snap.time !== undefined) race.time = snap.time;
    race.state = snap.state; race.countdown = snap.cd;
  }

}

window.APP = new App();
function HUDmsg(t) { const el = document.querySelector(".centermsg"); if (el) { el.textContent = t; el.style.opacity = 1; } }
