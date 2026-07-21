/**
 * useWebSocket.ts
 *
 * When the real device is ready:
 *   1. Delete the section marked "SIMULATOR"
 *   2. Change WS_URL to the real IP of the device
 *   3. Done — the rest remains the same
 *
 * CHANGE (2026-07-20): real hardware now sends channels as
 * [{ index, name, samples }, ...] instead of the old positional
 * number[][] format the simulator still uses. handlePacket now supports
 * BOTH shapes so the simulator keeps working unchanged while real-device
 * data is parsed correctly.
 *
 * CHANGE (2026-07-20): real hardware provides 8 genuinely independent ECG
 * leads (V6,V5,V4,V3,V2,V1,Lead II,Lead I) instead of the old placeholder
 * (one signal scaled 4 ways). Ring buffers now go 0-9, matching the real
 * device's channel indices exactly:
 *   0=V6 1=V5 2=V4 3=V3 4=V2 5=V1 6=Lead II 7=Lead I 8=Resp 9=PPG
 * There is no Temperature channel yet (still in development per Axel) and
 * no Blood Pressure channel at all (BP was only ever simulated — the ESP32
 * has no BP sensor). Because the simulator's OLD channel semantics
 * (indices 6/7 = Temp/BP) collide with the real device's NEW semantics
 * (indices 6/7 = Lead II/Lead I), vitals estimation now branches on
 * `usingSimulatorRef` to read the correct ring for each mode.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import useStore from '../store/useStore';
import type { EventType } from '../store/useStore';
import { auth } from '../lib/firebase';

// ─── Config ───────────────────────────────────────────────────────────────────

const WS_URL = `wss://chestpad-ws-server-1048900719191.us-central1.run.app/ws`;

// 1 hour @ 250Hz = 900,000 samples per channel
const BUFFER_SIZE = 900_000;

// CHANGE: real device channel names, in the exact index order confirmed by
// Axel. Used both for the dropdown and to map lead name -> ring index.
export const LEADS = ['Lead I', 'Lead II', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6'];

// Maps a lead's display name to the ring buffer index that holds its data
// (matches the real device's channel index exactly, so no translation is
// needed once a packet arrives).
export const LEAD_CHANNEL_INDEX: Record<string, number> = {
  V6: 0,
  V5: 1,
  V4: 2,
  V3: 3,
  V2: 4,
  V1: 5,
  'Lead II': 6,
  'Lead I': 7,
};

const RESP_CHANNEL_INDEX = 8;
const PPG_CHANNEL_INDEX = 9;
const NUM_DEVICE_CHANNELS = 10; // 0-7 ECG leads, 8 Resp, 9 PPG

// Visible samples per channel (indices 0-9, matching device channels above)
const VIEW_SIZES = [750, 750, 750, 750, 750, 750, 750, 750, 150, 150];
const DECIMATE = [1, 1, 1, 1, 1, 1, 1, 1, 5, 5];

// Min/max ranges per channel for WaveformCanvas (used only as a fallback —
// WaveformCanvas defaults to autoScale=true, so these mostly serve as
// documentation of the expected raw ADC range for each signal type).
export const CH_RANGES: [number, number][] = [
  [-2_500_000, 2_500_000],  // 0 V6  (ECG)
  [-2_500_000, 2_500_000],  // 1 V5
  [-2_500_000, 2_500_000],  // 2 V4
  [-2_500_000, 2_500_000],  // 3 V3
  [-2_500_000, 2_500_000],  // 4 V2
  [-2_500_000, 2_500_000],  // 5 V1
  [-2_500_000, 2_500_000],  // 6 Lead II
  [-2_500_000, 2_500_000],  // 7 Lead I
  [-8_388_607, 8_388_607],  // 8 Resp (pneumography)
  [0, 8_388_607],           // 9 PPG
];

// ─── Ring Buffer using Float32Array ───────────────────────────────────────────

/**
 * A simple ring buffer implementation using Float32Array
 * for high-performance sample storage.
 */
class RingBuffer {
  private buf: Float32Array;
  private ptr = 0;
  private _size = 0;

  constructor(private capacity: number) {
    this.buf = new Float32Array(capacity);
  }

  /**
   * Pushes a new value into the ring buffer.
   */
  push(value: number) {
    this.buf[this.ptr] = value;
    this.ptr = (this.ptr + 1) % this.capacity;
    if (this._size < this.capacity) this._size++;
  }

  /**
   * Returns a slice of the most recent `n` samples.
   */
  slice(n: number): Float32Array {
    const count = Math.min(n, this._size);
    const out = new Float32Array(count);
    const start = (this.ptr - count + this.capacity) % this.capacity;
    for (let i = 0; i < count; i++) {
      out[i] = this.buf[(start + i) % this.capacity];
    }
    return out;
  }

  /**
   * Returns a slice of `n` samples starting at a historical offset.
   */
  sliceAt(n: number, offsetSamples: number): Float32Array {
    if (this._size === 0) return new Float32Array(n);
    const maxOffset = Math.max(0, this._size - n);
    const clampedOffset = Math.min(offsetSamples, maxOffset);
    const count = Math.min(n, this._size);
    const out = new Float32Array(count);
    const endPtr = (this.ptr - clampedOffset + this.capacity) % this.capacity;
    const start = (endPtr - count + this.capacity) % this.capacity;
    for (let i = 0; i < count; i++) {
      out[i] = this.buf[(start + i) % this.capacity];
    }
    return out;
  }

  get size() { return this._size; }
}

// ─── Vitals Estimation Helpers ────────────────────────────────────────────────

/**
 * Estimates Heart Rate (HR) in BPM from ECG samples.
 */
function estimateHR(buf: Float32Array): number {
  if (buf.length < 100) return 0;
  let max = -Infinity;
  for (let i = 0; i < buf.length; i++) if (buf[i] > max) max = buf[i];
  const threshold = max * 0.55;
  const peaks: number[] = [];
  for (let i = 1; i < buf.length - 1; i++) {
    if (buf[i] > threshold && buf[i] >= buf[i - 1] && buf[i] >= buf[i + 1]) {
      peaks.push(i);
      i += 40;
    }
  }
  if (peaks.length < 2) return 0;
  let totalDist = 0;
  for (let i = 1; i < peaks.length; i++) totalDist += (peaks[i] - peaks[i - 1]);
  return Math.round(15000 / (totalDist / (peaks.length - 1)));
}

/**
 * Estimates SpO2 oxygen saturation percentage from PPG samples.
 */
function estimateSpO2(buf: Float32Array): number {
  if (buf.length < 10) return 98;
  let max = -Infinity, min = Infinity;
  for (let i = 0; i < buf.length; i++) {
    if (buf[i] > max) max = buf[i];
    if (buf[i] < min) min = buf[i];
  }
  if (max - min < 100_000) return 98;
  return Math.min(100, Math.round((88 + ((max - min) / 8_388_607) * 25) * 10) / 10);
}

/**
 * Extracts temperature in Celsius from samples.
 * NOTE: real hardware does not send a Temperature channel yet (Axel:
 * "in development"). This function is now only called in simulator mode.
 */
function extractTemp(buf: Float32Array): number {
  if (buf.length === 0) return 36.6;
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i];
  return Math.round((sum / buf.length / 100_000) * 10) / 10;
}

/**
 * Estimates Respiration Rate (RR) from pneumography samples.
 */
function estimateResp(buf: Float32Array): number {
  if (buf.length < 200) return 16;
  const crossings: number[] = [];
  for (let i = 1; i < buf.length; i++) {
    if (buf[i - 1] < 0 && buf[i] >= 0) crossings.push(i);
  }
  if (crossings.length < 2) return 16;
  let totalDist = 0;
  for (let i = 1; i < crossings.length; i++) totalDist += (crossings[i] - crossings[i - 1]);
  return Math.round(15000 / (totalDist / (crossings.length - 1)));
}

/**
 * Extracts Blood Pressure (BP) systolic/diastolic values from samples.
 * NOTE: the real ESP32 has no BP sensor — this is only ever meaningful in
 * simulator mode. In real-device mode this is never called; the UI shows
 * '--' instead (see updateVitals call below).
 */
function extractBp(buf: Float32Array): { sys: number, dia: number } | null {
  if (buf.length === 0) return null;
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i];
  const avg = Math.round(sum / buf.length);
  if (avg < 1000) return null;
  return { sys: Math.floor(avg / 1000), dia: avg % 1000 };
}

// ─── SIMULATOR ────────────────────────────────────────────────────────────────
// Delete this section when you connect the real device
// NOTE: the simulator still uses the OLD 8-channel array format
// (indices 0-3 = same ECG signal scaled 4 ways, 4=Resp, 5=PPG, 6=Temp,
// 7=BP). handlePacket() below detects this shape automatically and keeps
// supporting it, so nothing here needs to change for the real-device fix.

type SimMode =
  | 'normal'
  | 'tachycardia' | 'bradycardia'
  | 'spo2_drop'
  | 'hyperthermia' | 'hypothermia'
  | 'tachypnea' | 'bradypnea'
  | 'hypertension' | 'hypotension';

const SIM_EVENTS: Array<{ mode: SimMode; type: EventType; label: string; severity: 'high' | 'medium' }> = [
  { mode: 'tachycardia', type: 'tachycardia', label: 'Elevated HR', severity: 'high' },
  { mode: 'bradycardia', type: 'bradycardia', label: 'Low HR', severity: 'high' },
  { mode: 'spo2_drop', type: 'spo2_drop', label: 'Low SpO2', severity: 'high' },
  { mode: 'hyperthermia', type: 'hyperthermia', label: 'High Temp', severity: 'medium' },
  { mode: 'hypothermia', type: 'hypothermia', label: 'Low Temp', severity: 'high' },
  { mode: 'tachypnea', type: 'tachypnea', label: 'High Resp Rate', severity: 'medium' },
  { mode: 'bradypnea', type: 'bradypnea', label: 'Low Resp Rate', severity: 'high' },
  { mode: 'hypertension', type: 'hypertension', label: 'High BP', severity: 'high' },
  { mode: 'hypotension', type: 'hypotension', label: 'Low BP', severity: 'high' },
];

const SIM_PARAMS: Record<SimMode, { hr: number; resp: number; temp: number; spo2: number; sys: number; dia: number }> = {
  normal:       { hr: 75,  resp: 16, temp: 36.6, spo2: 98, sys: 118, dia: 75 },
  tachycardia:  { hr: 135, resp: 20, temp: 36.8, spo2: 96, sys: 132, dia: 84 },
  bradycardia:  { hr: 40,  resp: 14, temp: 36.5, spo2: 97, sys: 105, dia: 65 },
  spo2_drop:    { hr: 82,  resp: 24, temp: 36.6, spo2: 84, sys: 125, dia: 80 },
  hyperthermia: { hr: 98,  resp: 21, temp: 39.4, spo2: 97, sys: 128, dia: 82 },
  hypothermia:  { hr: 50,  resp: 10, temp: 34.2, spo2: 95, sys: 100, dia: 62 },
  tachypnea:    { hr: 90,  resp: 28, temp: 37.1, spo2: 94, sys: 120, dia: 78 },
  bradypnea:    { hr: 68,  resp: 8,  temp: 36.5, spo2: 96, sys: 115, dia: 74 },
  hypertension: { hr: 88,  resp: 18, temp: 36.8, spo2: 97, sys: 155, dia: 98 },
  hypotension:  { hr: 105, resp: 20, temp: 36.4, spo2: 96, sys: 82,  dia: 52 },
};

const simState = { hr: 75, resp: 16, temp: 36.6, spo2: 98, sys: 118, dia: 75 };

function simEcg(t: number, hr: number): number {
  const phase = (t * hr / 60) % 1;
  let v = 0;
  if (phase < 0.04)       v = 0.15 * Math.sin(phase / 0.04 * Math.PI);
  else if (phase < 0.10)  v = -0.10 * Math.sin((phase - 0.04) / 0.06 * Math.PI);
  else if (phase < 0.18)  v = 0.85 * Math.sin((phase - 0.10) / 0.08 * Math.PI);
  else if (phase < 0.22)  v = -0.25 * Math.sin((phase - 0.18) / 0.04 * Math.PI);
  else if (phase < 0.38)  v = 0.12 * Math.sin((phase - 0.22) / 0.16 * Math.PI);
  return Math.round((v + (Math.random() - 0.5) * 0.015) * 2_000_000);
}

function simPpg(t: number, hr: number, spo2: number): number {
  const phase = (t * hr / 60) % 1;
  const amplitude = Math.max(0.01, (spo2 - 88) / 25);
  return Math.round((Math.pow(Math.sin(phase * Math.PI), 2) * amplitude + Math.random() * 0.01) * 8_000_000);
}

function simResp(t: number, resp: number): number {
  return Math.round(Math.sin(t * 2 * Math.PI * resp / 60) * 7_000_000);
}

function buildSimPacket(t: number, mode: SimMode) {
  const p = SIM_PARAMS[mode];
  simState.hr   += (p.hr   - simState.hr)   * 0.02 + (Math.random() - 0.5) * 0.5;
  simState.resp += (p.resp - simState.resp) * 0.02 + (Math.random() - 0.5) * 0.2;
  simState.temp += (p.temp - simState.temp) * 0.02 + (Math.random() - 0.5) * 0.02;
  simState.spo2 += (p.spo2 - simState.spo2) * 0.02 + (Math.random() - 0.5) * 0.2;
  simState.sys  += (p.sys  - simState.sys)  * 0.02 + (Math.random() - 0.5) * 0.5;
  simState.dia  += (p.dia  - simState.dia)  * 0.02 + (Math.random() - 0.5) * 0.5;
  simState.spo2  = Math.min(100, Math.max(0, simState.spo2));

  const dt = 1 / 250;
  // OLD 8-channel array format (unchanged) — indices 0-3 ecg variants,
  // 4 resp, 5 ppg, 6 temp, 7 bp.
  const channels: number[][] = Array.from({ length: 8 }, () => []);
  for (let s = 0; s < 25; s++) {
    const ts = t + s * dt;
    channels[0].push(simEcg(ts, simState.hr));
    channels[1].push(Math.round(simEcg(ts, simState.hr) * 0.85));
    channels[2].push(Math.round(simEcg(ts, simState.hr) * 0.65));
    channels[3].push(Math.round(simEcg(ts, simState.hr) * -0.5));
    channels[4].push(simResp(ts, simState.resp));
    channels[5].push(simPpg(ts, simState.hr, simState.spo2));
    channels[6].push(Math.round(simState.temp * 100_000 + (Math.random() - 0.5) * 500));
    channels[7].push(Math.round(simState.sys * 1000 + simState.dia));
  }
  return { timestamp: Math.round(t * 1000), channels };
}

// ─── END SIMULATOR ────────────────────────────────────────────────────────────

// ─── WebSocket Hook ───────────────────────────────────────────────────────────

/**
 * Hook to manage real-time WebSocket connection to the device server (or simulator fallback),
 * processing incoming waveforms, estimating vitals, and updating the global store.
 */
export const useWebSocket = () => {
  const setConnected       = useStore(s => s.setConnected);
  const setConnectionStatus = useStore(s => s.setConnectionStatus);
  const simulationMode     = useStore(s => s.simulationMode);
  const updateVitals       = useStore(s => s.updateVitals);
  const addAlert           = useStore(s => s.addAlert);
  const addEvent           = useStore(s => s.addEvent);
  const historyOffset      = useStore(s => s.historyOffset);
  const deviceMac          = useStore(s => s.deviceMac);

  const [waveforms, setWaveforms] = useState<number[][]>(
    VIEW_SIZES.map(n => new Array(n).fill(0))
  );

  // CHANGE: 10 rings now (0-9), matching the real device's channel indices
  // exactly. See file header comment for what each index means in each mode.
  const rings    = useRef<RingBuffer[]>(Array.from({ length: NUM_DEVICE_CHANNELS }, () => new RingBuffer(BUFFER_SIZE)));

  // CHANGE: binary auscultation audio now goes to its own dedicated ring
  // instead of overwriting rings.current[7] (which used to be the
  // simulator's fake BP channel, and is now real "Lead I" ECG data on the
  // real device — pushing audio there would silently corrupt that lead).
  const audioRing = useRef<RingBuffer>(new RingBuffer(BUFFER_SIZE));

  const wsRef    = useRef<WebSocket | null>(null);
  const simRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const simTime  = useRef(0);

  // CHANGE: tracks whether the active data source is the simulator or a
  // real device connection. Needed because ring indices 6/7 mean different
  // things in each mode (Temp/BP in the simulator vs. Lead II/Lead I on
  // the real device) — vitals estimation below reads from the correct
  // source depending on this flag.
  const usingSimulatorRef = useRef(false);

  // ── Process Incoming Packet ─────────────────────────────────────────────────
  // CHANGE: now supports BOTH channel shapes:
  //   - old simulator shape: number[][] (positional array of arrays)
  //   - new real-device shape: [{ index, name, samples }, ...]
  const handlePacket = useCallback((packet: { timestamp: number; channels: any[] }) => {
    packet.channels.forEach((ch, i) => {
      if (Array.isArray(ch)) {
        // Old simulator format — position in the array IS the channel index.
        if (i >= rings.current.length) return;
        const ring = rings.current[i];
        for (const v of ch) ring.push(v);
      } else if (ch && typeof ch === 'object' && Array.isArray(ch.samples)) {
        // New real-device format — index is explicit, no guessing needed.
        const idx = ch.index;
        if (typeof idx !== 'number' || idx >= rings.current.length) return;
        const ring = rings.current[idx];
        for (const v of ch.samples) ring.push(v);
      }
      // Anything else (malformed channel entry) is silently skipped rather
      // than crashing the render loop.
    });
  }, []);

  const historyOffsetRef = useRef(historyOffset);
  useEffect(() => { historyOffsetRef.current = historyOffset; }, [historyOffset]);

  const prevVitals = useRef({ hr: 0, spo2: 0, resp: 0, temp: 0, sys: 0 });

  const getTrend = useCallback((curr: number, prev: number, margin: number): 'up' | 'down' | 'stable' => {
    if (prev === 0) return 'stable';
    if (curr > prev + margin) return 'up';
    if (curr < prev - margin) return 'down';
    return 'stable';
  }, []);

  // ── Render Loop + Vitals Estimation @ 30fps ─────────────────────────────────
  useEffect(() => {
    let last = 0;
    let vitalTick = 0;
    let frameId: number;

    const tick = (now: number) => {
      frameId = requestAnimationFrame(tick);
      if (now - last < 33) return;
      last = now;

      const offsetSamples = historyOffsetRef.current * 250;

      // Waveforms
      const next = rings.current.map((ring, ch) => {
        const viewSize = VIEW_SIZES[ch];
        const dec = DECIMATE[ch];
        const rawNeed = viewSize * dec;

        const raw = offsetSamples === 0
          ? ring.slice(rawNeed)
          : ring.sliceAt(rawNeed, offsetSamples);

        if (dec === 1) return Array.from(raw).slice(-viewSize);

        const out: number[] = [];
        for (let i = 0; i + dec <= raw.length; i += dec) {
          let sum = 0;
          for (let j = 0; j < dec; j++) sum += raw[i + j];
          out.push(sum / dec);
        }
        return out.slice(-viewSize);
      });

      setWaveforms(next);

      // Vitals calculation every ~1s
      vitalTick++;
      if (vitalTick < 30) return;
      vitalTick = 0;

      // CHANGE: pick the correct ring per mode. Simulator keeps its old
      // 8-channel semantics; the real device uses the new 10-channel
      // mapping (Lead II is the clinical standard for rhythm strips, so
      // it's used as the primary HR source on real hardware).
      const isSim = usingSimulatorRef.current;

      const ecgSourceIdx  = isSim ? 0 : LEAD_CHANNEL_INDEX['Lead II'];
      const respSourceIdx = isSim ? 4 : RESP_CHANNEL_INDEX;
      const ppgSourceIdx  = isSim ? 5 : PPG_CHANNEL_INDEX;

      const ecg  = offsetSamples === 0 ? rings.current[ecgSourceIdx].slice(750)  : rings.current[ecgSourceIdx].sliceAt(750,  offsetSamples);
      const ppg  = offsetSamples === 0 ? rings.current[ppgSourceIdx].slice(250)  : rings.current[ppgSourceIdx].sliceAt(250,  offsetSamples);
      const resp = offsetSamples === 0 ? rings.current[respSourceIdx].slice(1500) : rings.current[respSourceIdx].sliceAt(1500, offsetSamples);

      const hr   = estimateHR(ecg);
      const spo2 = estimateSpO2(ppg);
      const rr   = estimateResp(resp);

      // CHANGE: Temperature and Blood Pressure have no real channel on the
      // device yet (Temp is "in development" per Axel; BP never existed
      // as a sensor). Only compute them from ring data in simulator mode —
      // in real mode, use placeholders instead of misreading an ECG lead
      // as if it were Temp/BP data.
      let tmp: number;
      let bpData: { sys: number; dia: number } | null;

      if (isSim) {
        const temp = offsetSamples === 0 ? rings.current[6].slice(25) : rings.current[6].sliceAt(25, offsetSamples);
        const bp   = offsetSamples === 0 ? rings.current[7].slice(25) : rings.current[7].sliceAt(25, offsetSamples);
        tmp = extractTemp(temp);
        bpData = extractBp(bp);
      } else {
        // TODO: wire this up to a real Temperature channel once Axel adds
        // it to the device (currently "in development"). Placeholder
        // value kept numeric (36.6) rather than '--' because the store's
        // `temperature.value` type looks like it expects a number — check
        // useStore.ts if you'd rather show '--' here too, same as BP.
        tmp = 36.6;
        bpData = null; // No BP sensor exists on the real device — ever.
      }

      const hrTrend  = getTrend(hr,  prevVitals.current.hr,   1);
      const spo2Trend = getTrend(spo2, prevVitals.current.spo2, 0.5);
      const rrTrend  = getTrend(rr,  prevVitals.current.resp,  1);
      const tmpTrend = getTrend(tmp, prevVitals.current.temp,  0.2);
      const sysTrend = bpData ? getTrend(bpData.sys, prevVitals.current.sys, 2) : 'stable';

      prevVitals.current = { hr, spo2, resp: rr, temp: tmp, sys: bpData ? bpData.sys : prevVitals.current.sys };

      if (hr > 0) {
        updateVitals({
          heartRate: {
            value: hr,
            trend: hrTrend,
            severity: hr > 120 || hr < 45 ? 'critical' : hr > 100 || hr < 55 ? 'moderate' : 'normal',
          }
        });

        // First time real data arrives — activate the display
        if (!useStore.getState().hasRealData) {
          useStore.getState().setHasRealData(true);
        }
      }

      const updates: any = {
        spo2: {
          value: spo2,
          trend: spo2Trend,
          severity: spo2 < 90 ? 'critical' : spo2 < 94 ? 'moderate' : 'normal',
        },
        temperature: {
          value: tmp,
          trend: tmpTrend,
          severity: tmp > 39 ? 'critical' : tmp > 37.5 ? 'moderate' : 'normal',
        },
        respirationRate: {
          value: rr > 0 ? rr : 16,
          trend: rrTrend,
          severity: rr > 25 || rr < 10 ? 'critical' : 'normal',
        },
      };

      // CHANGE: always set bloodPressure (previously only set when
      // bpData existed). In real-device mode bpData is always null now,
      // so this shows '--' per what you confirmed — no BP sensor exists
      // on the hardware.
      updates.bloodPressure = bpData
        ? {
            value: `${bpData.sys}/${bpData.dia}`,
            trend: sysTrend,
            severity: (bpData.sys > 140 || bpData.dia > 90) ? 'critical'
                    : (bpData.sys < 90  || bpData.dia < 60) ? 'critical'
                    : 'normal',
          }
        : {
            value: '--',
            trend: 'stable',
            severity: 'normal',
          };

      updateVitals(updates);

      // Alerts only in Live mode
      if (historyOffsetRef.current === 0) {
        if (hr > 120)       addAlert({ timestamp: new Date().toLocaleTimeString(), message: `Elevated HR: ${hr} BPM`, severity: 'high' });
        if (hr > 0 && hr < 45) addAlert({ timestamp: new Date().toLocaleTimeString(), message: `Low HR: ${hr} BPM`, severity: 'high' });
        if (spo2 < 90)      addAlert({ timestamp: new Date().toLocaleTimeString(), message: `SpO2 Drop: ${spo2}%`, severity: 'high' });
        if (tmp > 38.5)     addAlert({ timestamp: new Date().toLocaleTimeString(), message: `Fever: ${tmp}C`, severity: 'medium' });
      }
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [updateVitals, addAlert]);

  // ── WebSocket + Simulator Fallback ─────────────────────────────────────────
  useEffect(() => {
    let reconnect: ReturnType<typeof setTimeout>;

    const stopSim = () => {
      if (simRef.current) { clearInterval(simRef.current); simRef.current = null; }
    };

    // SIMULATOR — delete startSim() and its call in onclose when connecting the real device
    const startSim = () => {
      if (simRef.current) return;
      usingSimulatorRef.current = true; // CHANGE: mark simulator as active
      setConnected(true);
      setConnectionStatus('Stable');

      let activeEvent: typeof SIM_EVENTS[0] | null = null;
      let ticksLeft = 0;
      let nextEventIn = 400 + Math.floor(Math.random() * 200);
      let ticksSinceEvent = 0;

      simRef.current = setInterval(() => {
        simTime.current += 0.1;
        ticksSinceEvent++;

        if (activeEvent && ticksLeft > 0) {
          ticksLeft--;
          if (ticksLeft === 0) {
            activeEvent = null;
            nextEventIn = 800 + Math.floor(Math.random() * 800);
            ticksSinceEvent = 0;
          }
        } else if (!activeEvent && ticksSinceEvent >= nextEventIn) {
          activeEvent = SIM_EVENTS[Math.floor(Math.random() * SIM_EVENTS.length)];
          ticksLeft = 300;
          ticksSinceEvent = 0;
          addEvent({
            type: activeEvent.type,
            label: activeEvent.label,
            severity: activeEvent.severity,
            timestampEpoch: Date.now(),
          });
        }

        const currentMode = activeEvent ? activeEvent.mode : (simulationMode as SimMode);
        handlePacket(buildSimPacket(simTime.current, currentMode));
      }, 100);
    };
    // END SIMULATOR

    const connect = () => {
      setConnectionStatus('Connecting');
      const ws = new WebSocket(WS_URL);
      ws.binaryType = 'arraybuffer';
      wsRef.current = ws;

      ws.onopen = async () => {
        stopSim();
        setConnectionStatus('Connecting');

        const user = await new Promise<import('firebase/auth').User | null>((resolve) => {
          if (auth.currentUser) { resolve(auth.currentUser); return; }
          const unsub = auth.onAuthStateChanged((u) => { unsub(); resolve(u); });
        });

        if (!user) {
          console.warn('[WS] onopen: no authenticated user, closing');
          ws.close();
          return;
        }

        try {
          const token = await user.getIdToken(true);
          ws.send(JSON.stringify({ type: 'auth', token, deviceMac: deviceMac ?? '' }));
        } catch (err) {
          console.error('[WS] Failed to get ID token:', err);
          ws.close();
        }
      };

      ws.onmessage = ({ data }) => {
        if (data instanceof ArrayBuffer) {
          // CHANGE: audio now goes to its own ring, not rings.current[7]
          // (which is real Lead I ECG data on the real device).
          const view = new DataView(data);
          for (let i = 0; i < data.byteLength / 2; i++) audioRing.current.push(view.getInt16(i * 2, true));
        } else {
          try {
            const msg = JSON.parse(data as string);
            if (msg.channels) handlePacket(msg);

            if (msg.type === 'auth_ok') {
              usingSimulatorRef.current = false; // CHANGE: real device confirmed, not simulator
              setConnected(true);
              setConnectionStatus('Stable');
            }

            if (msg.type === 'device_disconnected') {
              setConnected(false);
              setConnectionStatus('Disconnected');
            }
          } catch { /* ignore non-JSON messages */ }
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setConnectionStatus('Disconnected');
        //startSim(); // SIMULATOR — delete this line when connecting the real device
        reconnect = setTimeout(connect, 5000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
      };
    };

    connect();

    return () => {
      clearTimeout(reconnect);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      stopSim();
    };
  }, [handlePacket, setConnected, setConnectionStatus, simulationMode]);

  // ── Sync simulation mode with the server ───────────────────────────────────
  useEffect(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'set_mode', mode: simulationMode }));
    }
  }, [simulationMode]);

  return { waveforms, usingSimulator: usingSimulatorRef.current };
};