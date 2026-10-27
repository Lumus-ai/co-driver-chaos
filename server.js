// Co-Driver Chaos — локальный сервер: статика + WebSocket-комнаты.
// Запуск: node server.js  →  http://localhost:8080
// Без внешних зависимостей. Хост держит у себя браузер, второй игрок подключается по коду комнаты.
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 8080;
const ROOT = __dirname;
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".md": "text/plain; charset=utf-8" };

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const file = path.join(ROOT, path.normalize(urlPath));
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  });
});

// --- minimal WebSocket (RFC6455, text frames) ---
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const rooms = new Map(); // code -> {host: sock|null, guests: Set}

function wsAccept(key) {
  return crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
}
function wsSend(sock, str) {
  const payload = Buffer.from(str);
  const len = payload.length;
  let header;
  if (len < 126) { header = Buffer.from([0x81, len]); }
  else if (len < 65536) { header = Buffer.alloc(4); header[0] = 0x81; header[1] = 126; header.writeUInt16BE(len, 2); }
  else { header = Buffer.alloc(10); header[0] = 0x81; header[1] = 127; header.writeBigUInt64BE(BigInt(len), 2); }
  sock.write(Buffer.concat([header, payload]));
}
function wsParseFrames(sock, onMsg) {
  let buf = Buffer.alloc(0);
  sock.on("data", chunk => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 2) {
      const fin = buf[0] & 0x80, op = buf[0] & 0x0f;
      const masked = buf[1] & 0x80;
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      const maskLen = masked ? 4 : 0;
      if (buf.length < off + maskLen + len) return;
      let payload = buf.slice(off + maskLen, off + maskLen + len);
      if (masked) {
        const mask = buf.slice(off, off + 4);
        payload = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
      }
      buf = buf.slice(off + maskLen + len);
      if (op === 8) { sock.end(); return; }
      if (op === 9) { const pong = Buffer.from(payload); const h = Buffer.from([0x8a, pong.length]); sock.write(Buffer.concat([h, pong])); continue; }
      if (op === 1 && fin) onMsg(payload.toString("utf8"));
    }
  });
}

server.on("upgrade", (req, socket) => {
  const u = new URL(req.url, "http://x");
  if (u.pathname !== "/ws") { socket.destroy(); return; }
  const room = (u.searchParams.get("room") || "").toUpperCase().slice(0, 8);
  const role = u.searchParams.get("role") === "guest" ? "guest" : "host";
  const key = req.headers["sec-websocket-key"];
  socket.write("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
    `Sec-WebSocket-Accept: ${wsAccept(key)}\r\n\r\n`);
  if (!rooms.has(room)) rooms.set(room, { host: null, guests: new Set() });
  const r = rooms.get(room);
  if (role === "host") {
    if (r.host) try { r.host.end(); } catch {}
    r.host = socket;
    if (r.guests.size > 0) setTimeout(() => wsSend(socket, JSON.stringify({ t: "peer", what: "guest_joined" })), 100);
  }
  else r.guests.add(socket);
  console.log(`[room ${room}] ${role} joined (guests=${r.guests.size})`);
  wsSend(socket, JSON.stringify({ t: "joined", room, role }));
  if (role === "guest" && r.host) wsSend(r.host, JSON.stringify({ t: "peer", what: "guest_joined" }));

  wsParseFrames(socket, str => {
    // relay: host<->guests
    if (role === "host") for (const g of r.guests) wsSend(g, str);
    else if (r.host) wsSend(r.host, str);
  });
  const bye = () => {
    if (role === "host" && r.host === socket) { r.host = null; for (const g of r.guests) wsSend(g, JSON.stringify({ t: "peer", what: "host_left" })); }
    if (role === "guest") { r.guests.delete(socket); if (r.host) wsSend(r.host, JSON.stringify({ t: "peer", what: "guest_left" })); }
  };
  socket.on("close", bye); socket.on("error", bye);
});

server.listen(PORT, () => {
  console.log(`Co-Driver Chaos: http://localhost:${PORT}`);
  console.log("Для игры по сети второй игрок должен открыть http://<твой-IP>:" + PORT);
});
