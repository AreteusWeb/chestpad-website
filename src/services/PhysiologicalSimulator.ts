import { SimulationMode, PhysiologicalPacket } from '../types';

export class PhysiologicalSimulator {
  private mode: SimulationMode = 'normal';
  private frameCount = 0;
  private interval: number | null = null;
  private onDataCallback: (packet: PhysiologicalPacket) => void;

  constructor(callback: (packet: PhysiologicalPacket) => void) {
    this.onDataCallback = callback;
  }

  public setMode(mode: SimulationMode) {
    this.mode = mode;
  }

  public start() {
    if (this.interval) return;
    this.interval = window.setInterval(() => this.generateFrame(), 20); // 50Hz updates
  }

  public stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private generateFrame() {
    this.frameCount++;
    const t = this.frameCount / 50; // seconds

    // Parameters based on mode
    let hr = 78;
    let rr = 17;
    let temp = 36.6;
    let spo2 = 98;

    switch (this.mode) {
      case 'tachycardia': hr = 120; break;
      case 'bradycardia': hr = 45; break;
      case 'spo2drop': spo2 = 88; hr = 95; break;
      case 'fever': temp = 38.5; hr = 100; break;
    }

    // Generate waveforms
    const channels: number[][] = [[], [], [], [], [], [], [], []];

    // ECG (Complex QRS simulation)
    const ecgBase = this.generateECG(t, hr / 60);
    channels[0] = [ecgBase]; // Lead I
    channels[1] = [ecgBase * 0.8 + Math.random() * 0.05]; // Lead II
    channels[2] = [ecgBase * 0.6 + Math.random() * 0.05]; // Lead III
    channels[3] = [ecgBase * 1.1 + Math.random() * 0.05]; // V1

    // Resp (Sine wave)
    channels[4] = [Math.sin(2 * Math.PI * (rr / 60) * t) * 0.5];

    // PPG (Similar to ECG but smoother)
    channels[5] = [Math.sin(2 * Math.PI * (hr / 60) * t) * 0.4 + 0.5];

    // Temp (Static with noise)
    channels[6] = [temp + Math.random() * 0.1];

    // Audio/Auscultation (Noise/Sine mix)
    channels[7] = [Math.sin(2 * Math.PI * 440 * t) * 0.1 + Math.random() * 0.05];

    this.onDataCallback({
      timestamp: Date.now(),
      channels
    });
  }

  private generateECG(t: number, freq: number): number {
    const cycle = (t * freq) % 1.0;
    let val = 0;

    // P wave
    if (cycle > 0.0 && cycle < 0.1) val += 0.1 * Math.sin(Math.PI * (cycle / 0.1));
    // QRS complex
    if (cycle > 0.12 && cycle < 0.14) val -= 0.2 * Math.sin(Math.PI * ((cycle - 0.12) / 0.02));
    if (cycle > 0.14 && cycle < 0.16) val += 1.0 * Math.sin(Math.PI * ((cycle - 0.14) / 0.02));
    if (cycle > 0.16 && cycle < 0.18) val -= 0.3 * Math.sin(Math.PI * ((cycle - 0.16) / 0.02));
    // T wave
    if (cycle > 0.3 && cycle < 0.5) val += 0.25 * Math.sin(Math.PI * ((cycle - 0.3) / 0.2));

    return val + Math.random() * 0.02;
  }
}
