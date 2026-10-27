// Networking: host runs the sim, guests are co-drivers watching + playing cards.
// Transport: WebSocket to the bundled server.js room relay. No external services.
export class Net {
  constructor() { this.ws = null; this.role = null; this.onMessage = null; this.onOpen = null; this.onClose = null; this.room = null; }
  connect(room, role) {
    return new Promise((resolve, reject) => {
      const proto = location.protocol === "https:" ? "wss" : "ws";
      const ws = new WebSocket(`${proto}://${location.host}/ws?room=${room}&role=${role}`);
      this.ws = ws; this.room = room; this.role = role;
      const to = setTimeout(() => reject(new Error("timeout")), 20000);
      ws.onopen = () => { clearTimeout(to); resolve(); this.onOpen && this.onOpen(); };
      ws.onerror = () => { clearTimeout(to); reject(new Error("ws error")); };
      ws.onclose = () => this.onClose && this.onClose();
      ws.onmessage = (ev) => {
        let msg; try { msg = JSON.parse(ev.data); } catch { return; }
        this.onMessage && this.onMessage(msg);
      };
    });
  }
  send(obj) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(obj)); }
  close() { try { this.ws && this.ws.close(); } catch {} }
}
export function makeRoomCode() {
  const A = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = ""; for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
}
