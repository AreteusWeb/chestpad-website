import { useEffect, useRef, useState, useCallback } from 'react';
import useStore from '../store/useStore';
import { PhysiologicalSimulator } from '../services/PhysiologicalSimulator';
import { PhysiologicalPacket, SimulationMode } from '../types';

const BUFFER_SIZE = 2000;
const VIEW_SIZE = 400;

// ─── Helpers para extraer vitales del paquete real ───────────────────────────

function estimateHR(ecgHistory: number[]): number {
  if (ecgHistory.length < 50) return 0;
  const buf = ecgHistory.slice(-750);
  const max = Math.max(...buf);
  const threshold = max * 0.55;
  let peaks = 0;
  for (let i = 1; i < buf.length - 1; i++) {
    if (buf[i] > threshold && buf[i] >= buf[i - 1] && buf[i] >= buf[i + 1]) {
      peaks++;
      i += 5;
    }
  }
  return Math.round(peaks * 20);
}

function estimateSpO2(ppgHistory: number[]): number {
  const buf = ppgHistory.slice(-250);
  if (buf.length < 10) return 98;
  const max = Math.max(...buf);
  const min = Math.min(...buf);
  const amplitude = (max - min) / 8_388_607;
  const spo2 = 88 + Math.min(10, amplitude * 25);
  return Math.round(spo2 * 10) / 10;
}

function extractTemp(tempSamples: number[]): number {
  const avg = tempSamples.reduce((a, b) => a + b, 0) / tempSamples.length;
  return Math.round((avg / 100_000) * 10) / 10;
}

function estimateRespRate(respHistory: number[]): number {
  const buf = respHistory.slice(-1500);
  if (buf.length < 100) return 0;
  let crossings = 0;
  for (let i = 1; i < buf.length; i++) {
    if ((buf[i - 1] < 0) !== (buf[i] < 0)) crossings++;
  }
  const durationSec = buf.length / 250;
  return Math.round((crossings / 2) * (60 / durationSec));
}

// ─── Hook principal ──────────────────────────────────────────────────────────

export const usePhysiologicalData = () => {
  const isLive = useStore(state => state.isLive);
  const historyOffset = useStore(state => state.historyOffset);
  const setConnected = useStore(state => state.setConnected);
  const setConnectionStatus = useStore(state => state.setConnectionStatus);
  const simulationMode = useStore(state => state.simulationMode);
  const updateVitals = useStore(state => state.updateVitals);
  const addAlert = useStore(state => state.addAlert);

  const [waveforms, setWaveforms] = useState<number[][]>(
    Array(8).fill([]).map(() => Array(VIEW_SIZE).fill(0))
  );

  const waveformRefs = useRef<number[][]>(
    Array(8).fill([]).map(() => Array(BUFFER_SIZE).fill(0))
  );

  const ecgHistoryRef = useRef<number[]>([]);
  const ppgHistoryRef = useRef<number[]>([]);
  const respHistoryRef = useRef<number[]>([]);
  const packetCountRef = useRef(0);

  const simulatorRef = useRef<PhysiologicalSimulator | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const handlePacket = useCallback((packet: PhysiologicalPacket) => {
    packetCountRef.current++;

    packet.channels.forEach((channelData, i) => {
      if (i >= 8) return;
      // server.js manda 25 samples por canal; simulador interno manda 1
      const samples = Array.isArray(channelData) ? channelData : [channelData];

      const buf = waveformRefs.current[i];
      for (const v of samples) {
        buf.shift();
        buf.push(v);
      }

      if (i === 0) {
        ecgHistoryRef.current.push(...samples);
        if (ecgHistoryRef.current.length > 3000) ecgHistoryRef.current.splice(0, samples.length);
      }
      if (i === 4) {
        respHistoryRef.current.push(...samples);
        if (respHistoryRef.current.length > 3000) respHistoryRef.current.splice(0, samples.length);
      }
      if (i === 5) {
        ppgHistoryRef.current.push(...samples);
        if (ppgHistoryRef.current.length > 3000) ppgHistoryRef.current.splice(0, samples.length);
      }
    });

    // Actualizar vitales cada 10 packets (~1s)
    if (packetCountRef.current % 10 === 0) {
      const hr = estimateHR(ecgHistoryRef.current);
      const spo2 = estimateSpO2(ppgHistoryRef.current);
      const resp = estimateRespRate(respHistoryRef.current);
      const tempSamples = packet.channels[6] ?? [3_660_000];
      const temp = extractTemp(Array.isArray(tempSamples) ? tempSamples : [tempSamples]);

      if (hr > 0) {
        updateVitals({
          heartRate: {
            value: hr,
            trend: hr > 100 ? 'up' : hr < 55 ? 'down' : 'stable',
            severity: hr > 120 || hr < 45 ? 'critical' : hr > 100 || hr < 55 ? 'moderate' : 'normal',
          },
        });
      }

      updateVitals({
        spo2: {
          value: spo2,
          trend: spo2 < 94 ? 'down' : 'stable',
          severity: spo2 < 90 ? 'critical' : spo2 < 94 ? 'moderate' : 'normal',
        },
        temperature: {
          value: temp,
          trend: temp > 37.5 ? 'up' : 'stable',
          severity: temp > 39 ? 'critical' : temp > 37.5 ? 'moderate' : 'normal',
        },
        respirationRate: {
          value: resp > 0 ? resp : 16,
          trend: resp > 20 ? 'up' : resp < 12 ? 'down' : 'stable',
          severity: resp > 25 || resp < 10 ? 'critical' : resp > 20 || resp < 12 ? 'moderate' : 'normal',
        },
      });

      if (hr > 120) addAlert({ timestamp: new Date().toLocaleTimeString(), message: `Elevated HR: ${hr} BPM`, severity: 'high' });
      if (hr > 0 && hr < 45) addAlert({ timestamp: new Date().toLocaleTimeString(), message: `Low HR: ${hr} BPM`, severity: 'high' });
      if (spo2 < 90) addAlert({ timestamp: new Date().toLocaleTimeString(), message: `SpO2 Drop: ${spo2}%`, severity: 'high' });
      if (temp > 38.5) addAlert({ timestamp: new Date().toLocaleTimeString(), message: `Fever: ${temp}C`, severity: 'medium' });
    }
  }, [updateVitals, addAlert]);

  // Render loop @ 30fps
  useEffect(() => {
    let lastTime = 0;
    let frameId: number;

    const update = (time: number) => {
      if (time - lastTime < 33) {
        frameId = requestAnimationFrame(update);
        return;
      }
      lastTime = time;

      const dataPointsPerSecond = 50;
      const offsetPoints = historyOffset * dataPointsPerSecond;

      const newWaveforms = waveformRefs.current.map(fullBuffer => {
        if (isLive) {
          return fullBuffer.slice(-VIEW_SIZE);
        } else {
          const end = Math.max(VIEW_SIZE, BUFFER_SIZE - offsetPoints);
          const start = end - VIEW_SIZE;
          return fullBuffer.slice(start, end);
        }
      });

      setWaveforms(newWaveforms);
      frameId = requestAnimationFrame(update);
    };

    frameId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frameId);
  }, [isLive, historyOffset]);

  // WebSocket + fallback al simulador
  useEffect(() => {
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connect = () => {
      try {
        setConnectionStatus('Connecting');
        const ws = new WebSocket('ws://localhost:8080/ws');
        ws.binaryType = 'arraybuffer';
        socketRef.current = ws;

        ws.onopen = () => {
          simulatorRef.current?.stop();
          simulatorRef.current = null;
          setConnected(true);
          setConnectionStatus('Stable');
          ws.send(JSON.stringify({ type: 'auth', mac: 'A1:B2:C3:D4:E5:F6' }));
        };

        ws.onmessage = (event) => {
          if (event.data instanceof ArrayBuffer) {
            // Binary frame: audio auscultacion ch7 @ 8kHz, int16 LE, 800 samples
            const view = new DataView(event.data);
            const count = event.data.byteLength / 2;
            const buf = waveformRefs.current[7];
            for (let i = 0; i < count; i++) {
              buf.shift();
              buf.push(view.getInt16(i * 2, true));
            }
          } else if (typeof event.data === 'string') {
            try {
              const data = JSON.parse(event.data);
              if (data.channels) handlePacket(data);
            } catch {
              // mensajes de control como auth_ok, mode_changed
            }
          }
        };

        ws.onclose = () => {
          setConnected(false);
          setConnectionStatus('Disconnected');
          startSimulator();
          reconnectTimeout = setTimeout(connect, 5000);
        };

        ws.onerror = () => ws.close();
      } catch {
        startSimulator();
      }
    };

    const startSimulator = () => {
      if (!simulatorRef.current) {
        simulatorRef.current = new PhysiologicalSimulator(handlePacket);
        simulatorRef.current.start();
        setConnected(true);
        setConnectionStatus('Stable');
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      socketRef.current?.close();
      simulatorRef.current?.stop();
    };
  }, [handlePacket, setConnected, setConnectionStatus]);

  // Sincronizar modo con servidor o simulador
  useEffect(() => {
    if (simulatorRef.current) {
      simulatorRef.current.setMode(simulationMode);
    }
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'set_mode', mode: simulationMode }));
    }
  }, [simulationMode]);

  return { waveforms };
};