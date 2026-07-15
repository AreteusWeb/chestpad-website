/**
 * ChestPad WebSocket Server — production + relay + GCS persistence
 * Receives real data from ESP32 according to Data_format.docx
 * Relays data to connected web clients (React app) in real time
 * NEW: Buffers 10-second chunks per device, converts raw ADC → mV,
 *      and writes them to GCS for the AI/preprocessing pipeline.
 *
 * CAMBIO (2026-07-14): formato de canales actualizado según confirmó Axel.
 * Antes: channels: [[25 samples], [25 samples], ...] (array de arrays, posicional)
 * Ahora: channels: [{ index, name, samples: [25 samples] }, ...] (array de objetos,
 *        con nombre/índice explícitos — ya no se adivina el orden).
 * siempre se mandan los 10 canales completos,
 * 25 samples/canal cada 100ms (250Hz). El 11vo canal (Temperature) todavía
 * está en desarrollo y no se manda.
 *
 * Install: npm install ws firebase-admin @google-cloud/storage
 * Run:     node server.cjs
 */

const { WebSocketServer } = require('ws');
const admin = require('firebase-admin');
const { Storage } = require('@google-cloud/storage');
const http = require('http');

// ─── Firebase Admin ───────────────────────────────────────────────────────────
// En Cloud Run las credenciales se obtienen automáticamente del entorno.
// No se necesita service account key.
admin.initializeApp({
  projectId: process.env.GOOGLE_CLOUD_PROJECT || 'areteus-chestpad-backend-dev',
});

// ─── GCS ──────────────────────────────────────────────────────────────────────
// Igual que Firebase Admin, en Cloud Run las credenciales se obtienen
// automáticamente del service account del servicio — no necesita key.
const storage = new Storage();
const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'areteus-patch-ecg-raw';
const bucket = storage.bucket(BUCKET_NAME);

const PORT = process.env.PORT || 8080;

// Servidor HTTP normal — responde algo a peticiones simples (health checks
// de Cloud Run, navegador, etc). Las conexiones WebSocket reales se
// "upgradean" desde aquí mismo.
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ChestPad WS Server is running\n');
});

const wss = new WebSocketServer({ server });

server.listen(PORT, () => {
  console.log(`HTTP + WS server listening on port ${PORT}`);
});

// ESP32 devices: deviceId (MAC sin colons) → { ws, lastSeen, packetCount }
const devices = new Map();

// Web clients: Set de WebSockets
// Cada ws tiene: ws.uid, ws.deviceMac (MAC sin colons, para matching con devices)
const webClients = new Set();

// ─── Buffers de chunking (10s) para GCS, por device ──────────────────────────
// chunkBuffers: deviceId -> { channelData: Map<index, {name, samples:[]}>, startTs, packetCount }
const chunkBuffers = new Map();

// Constantes de conversión raw → mV, confirmadas por Axel (2026-07-13):
// voltaje_mV = (raw / ADC_VAL_MAX) * ADC_VAL_MAX_MV
// ADC_VAL_MAX (8388607) también es el valor que reporta un canal SIN sensor
// conectado (pin flotando) — hay que filtrarlo como "no conectado", no como
// una lectura real de 1200mV.
const ADC_VAL_MAX = 8388607;
const ADC_VAL_MAX_MV = 1200;

// Packets de 100ms, 25 samples/canal cada uno.
// 250Hz * 10s = 2500 samples/canal = 100 packets de 25 samples.
const PACKETS_PER_CHUNK = 100;

// CAMBIO: nombres de canal confirmados por Axel (2026-07-14). 
// ESP32 manda `name` explícito en cada canal. Este
// mapa solo se usa como fallback por si algún día llega un packet sin
// `name` (no debería pasar en condiciones normales).
const FALLBACK_CHANNEL_NAMES = {
  0: 'V6',
  1: 'V5',
  2: 'V4',
  3: 'V3',
  4: 'V2',
  5: 'V1',
  6: 'Lead II',
  7: 'Lead I',
  8: 'Resp',
  9: 'PPG',
  10: 'Temperature', // en desarrollo aún no se manda
};

// raw ADC value -> mV, o null si el canal no tiene sensor conectado
function rawToMv(raw) {
  if (raw === ADC_VAL_MAX) return null; // sensor no conectado (pin flotando)
  return (raw / ADC_VAL_MAX) * ADC_VAL_MAX_MV;
}

console.log(`\nChestPad WS Server running on port ${PORT}\n`);

// ─── Acumula packets de 100ms hasta juntar un chunk de 10s, luego lo sube ────
// CAMBIO: channelsArr ahora es [{ index, name, samples: [...] }, ...]
function onChannelsPacket(deviceId, timestamp, channelsArr) {
  let buf = chunkBuffers.get(deviceId);
  if (!buf) {
    buf = { channelData: new Map(), startTs: timestamp, packetCount: 0 };
    chunkBuffers.set(deviceId, buf);
  }

  for (const ch of channelsArr) {
    const idx = ch.index;
    const name = ch.name || FALLBACK_CHANNEL_NAMES[idx] || `CH_${idx}`;

    if (!Array.isArray(ch.samples)) {
      console.warn(`[WARN] Canal sin samples válidos, device=${deviceId} idx=${idx}`);
      continue;
    }

    if (!buf.channelData.has(idx)) {
      buf.channelData.set(idx, { name, samples: [] });
    }
    buf.channelData.get(idx).samples.push(...ch.samples);
  }

  buf.packetCount++;

  if (buf.packetCount >= PACKETS_PER_CHUNK) {
    flushChunkToGCS(deviceId, buf).catch(err => {
      console.error(`[GCS ERROR] device=${deviceId} | ${err.message}`);
      // TODO: sin retry/persistencia local por ahora (decisión consciente,
      // ver propuesta del pipeline) — si falla el flush, se pierde ese chunk.
    });
    chunkBuffers.delete(deviceId);
  }
}

async function flushChunkToGCS(deviceId, buf) {
  // CAMBIO: ordenamos por índice de canal para que el chunk salga consistente
  // sin importar en qué orden hayan llegado los canales en cada packet.
  const sortedIndices = [...buf.channelData.keys()].sort((a, b) => a - b);
  const channel_labels = sortedIndices.map(i => buf.channelData.get(i).name);
  const data = sortedIndices.map(i => buf.channelData.get(i).samples.map(rawToMv));

  const metadata = {
    device_id: deviceId,
    timestamp_start: buf.startTs,
    sample_rate_hz: 250,
    num_channels: data.length,
    channel_labels,
  };

  const payload = JSON.stringify({ metadata, data });
  const dateStr = new Date().toISOString().slice(0, 10);
  const path = `${deviceId}/${dateStr}/${buf.startTs}.json`;

  await bucket.file(path).save(payload, { contentType: 'application/json' });
  console.log(`[GCS] device=${deviceId} | chunk written → gs://${BUCKET_NAME}/${path} | canales=${channel_labels.join(',')} | samples/ch=${data[0]?.length ?? 0}`);
}

wss.on('connection', (ws, req) => {
  ws.role          = null;   // 'device' | 'webclient'
  ws.deviceId      = null;   // MAC sin colons (dispositivos) o null
  ws.deviceMac     = null;   // MAC sin colons del ESP32 vinculado (webclients)
  ws.uid           = null;   // Firebase UID (webclients)
  ws.authenticated = false;

  console.log(`[+] New connection from ${req.socket.remoteAddress}`);

  const authTimeout = setTimeout(() => {
    if (!ws.authenticated) {
      console.log('[TIMEOUT] No auth in 15s, closing connection');
      ws.close();
    }
  }, 15_000);

  ws.on('message', async (data, isBinary) => {

    // ── Binary packet — auscultation audio ───────────────────────────────────
    if (isBinary) {
      if (ws.role !== 'device') return;

      // Relay solo al webclient dueño de este dispositivo
      let relayed = 0;
      for (const client of webClients) {
        if (client.readyState === client.OPEN && client.deviceMac === ws.deviceId) {
          client.send(data, { binary: true });
          relayed++;
        }
      }
      console.log(`[BIN] device=${ws.deviceId} | bytes=${data.byteLength} | relay→${relayed} clients`);
      // NOTA: el audio de auscultación NO entra al pipeline de GCS/AI —
      // Jennifer confirmó que el modelo solo usa señales de ECG. Este binary
      // frame se queda solo en el relay en vivo al frontend, como ya estaba.
      return;
    }

    // ── JSON packet ───────────────────────────────────────────────────────────
    let msg;
    try {
      msg = JSON.parse(data.toString());
      console.log('[MSG]', JSON.stringify(msg).slice(0, 500));
    } catch (e) {
      console.warn('[WARN] Non-JSON message ignored');
      return;
    }

    // ── Auth handshake ────────────────────────────────────────────────────────
    if (msg.type === 'auth') {

      // ── Webclient: JWT de Firebase ────────────────────────────────────────
      if (msg.token) {
        try {
          const decoded = await admin.auth().verifyIdToken(msg.token);

          clearTimeout(authTimeout);
          ws.authenticated = true;
          ws.role          = 'webclient';
          ws.uid           = decoded.uid;
          // Normalizar MAC igual que los devices (sin colons, uppercase)
          ws.deviceMac     = (msg.deviceMac ?? '').replace(/:/g, '').toUpperCase();

          webClients.add(ws);
          console.log(`[AUTH OK] WEBCLIENT | uid=${decoded.uid} | deviceMac=${ws.deviceMac} | webclients=${webClients.size}`);
          ws.send(JSON.stringify({ type: 'auth_ok', role: 'webclient', uid: decoded.uid }));

        } catch (err) {
          console.warn(`[AUTH FAIL] Invalid token — ${err.message}`);
          ws.send(JSON.stringify({ type: 'auth_error', reason: 'invalid_token' }));
          ws.close();
        }
        return;
      }

      // ── Device (ESP32): MAC — sin cambios ─────────────────────────────────
      if (msg.mac) {
        clearTimeout(authTimeout);
        ws.authenticated = true;
        ws.role          = 'device';
        ws.deviceId      = msg.mac.replace(/:/g, '').toUpperCase();

        devices.set(ws.deviceId, {
          ws,
          lastSeen: Date.now(),
          packetCount: 0,
        });
        console.log(`[AUTH OK] DEVICE | deviceId=${ws.deviceId} | mac=${msg.mac} | devices=${devices.size}`);
        ws.send(JSON.stringify({ type: 'auth_ok', deviceId: ws.deviceId }));
        return;
      }

      // ── Auth sin token ni mac ─────────────────────────────────────────────
      console.warn('[AUTH FAIL] No token or mac in auth message');
      ws.send(JSON.stringify({ type: 'auth_error', reason: 'missing_credentials' }));
      ws.close();
      return;
    }

    // ── Multichannel telemetry → relay + GCS ───────────────────────────────
    // msg.channels ahora es [{ index, name, samples }, ...]
    if (msg.channels && ws.role === 'device') {
      const { timestamp, channels } = msg;

      if (!Array.isArray(channels) || channels.length === 0) {
        console.warn(`[WARN] Invalid channels from device=${ws.deviceId}`);
        return;
      }

      let sess = devices.get(ws.deviceId);
      if (!sess) {
        console.warn(`[WARN] Session not found for device=${ws.deviceId}, re-registering`);
        sess = { ws, lastSeen: Date.now(), packetCount: 0 };
        devices.set(ws.deviceId, sess);
      }

      sess.packetCount++;
      sess.lastSeen = Date.now();

      // Relay SOLO al webclient cuyo deviceMac coincide con este dispositivo
      // (comportamiento en vivo, sin cambios — sigue mandando raw values,
      // no mV, para no romper lo que ya consume el frontend)
      const payload = JSON.stringify({ timestamp, channels });
      let relayed = 0;
      for (const client of webClients) {
        if (client.readyState === client.OPEN && client.deviceMac === ws.deviceId) {
          client.send(payload);
          relayed++;
        }
      }

      // NUEVO: acumular hacia el chunk de 10s y subir a GCS cuando se complete
      onChannelsPacket(ws.deviceId, timestamp, channels);

      if (sess.packetCount % 10 === 0) {
        // CAMBIO: ya no asumimos posiciones fijas [0] y [9] — buscamos por name
        const v6 = channels.find(c => c.name === 'V6' || c.index === 0)?.samples?.[0] ?? 'N/A';
        const resp = channels.find(c => c.name === 'Resp' || c.index === 8)?.samples?.[0] ?? 'N/A';
        console.log(`[DATA] device=${ws.deviceId} | ts=${timestamp} | V6[0]=${v6} | Resp[0]=${resp} | canales=${channels.length} | relay→${relayed} clients`);
      }
    }
  });

  ws.on('close', () => {
    if (ws.role === 'device') {
      devices.delete(ws.deviceId);
      chunkBuffers.delete(ws.deviceId); // TODO: hoy se pierde el chunk parcial en curso; ver nota de fault-tolerance en la propuesta
      console.log(`[-] DEVICE disconnected: ${ws.deviceId} | devices=${devices.size}`);
    } else if (ws.role === 'webclient') {
      webClients.delete(ws);
      console.log(`[-] WEBCLIENT disconnected uid=${ws.uid} | webclients=${webClients.size}`);
    }
  });

  ws.on('error', (err) => {
    console.error(`[ERR] role=${ws.role ?? 'no-auth'} | ${err.message}`);
  });
});

// Status log every 30s
setInterval(() => {
  console.log(`[STATUS] devices=${devices.size} | webclients=${webClients.size}`);
  for (const [id, s] of devices) {
    const secsAgo = Math.round((Date.now() - s.lastSeen) / 1000);
    const chunkProgress = chunkBuffers.get(id)?.packetCount ?? 0;
    console.log(`  · ${id} — last seen ${secsAgo}s ago | packets=${s.packetCount} | chunk progress=${chunkProgress}/${PACKETS_PER_CHUNK}`);
  }
}, 30_000);
