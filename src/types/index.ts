export type SimulationMode = 'normal' | 'tachycardia' | 'bradycardia' | 'spo2drop' | 'fever';

export type SeverityLevel = 'normal' | 'moderate' | 'critical';

export interface VitalStatus {
  value: number | string;
  unit?: string;
  trend: 'up' | 'down' | 'stable';
  severity: SeverityLevel;
}

export interface Vitals {
  heartRate: VitalStatus;
  spo2: VitalStatus;
  temperature: VitalStatus;
  respirationRate: VitalStatus;
  bloodPressure: VitalStatus;
}

export interface Activity {
  steps: number;
  calories: number;
  activityType: string;
}

export interface Alert {
  id: string;
  timestamp: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
}

export interface PhysiologicalPacket {
  timestamp: number;
  channels: number[][]; // ch0-3: ECG, ch4: Resp, ch5: PPG, ch6: Temp, ch7: Audio
}

export interface AppState {
  isConnected: boolean;
  isLive: boolean;
  historyOffset: number; 
  viewMode: 'Normal' | 'Advanced';
  simulationMode: SimulationMode;
  vitals: Vitals;
  activity: Activity;
  alerts: Alert[];
  batteryLevel: number;
  connectionStatus: 'Stable' | 'Weak' | 'Disconnected' | 'Connecting';
  userName: string;
  deviceName: string;
  // New UI states
  selectedLeadIndex: number;
  isEcgExpanded: boolean;
  advancedEcgMode: 'Single' | 'All';
  isAdvancedMenuOpen: boolean;
}

export interface AppActions {
  setConnected: (connected: boolean) => void;
  setIsLive: (isLive: boolean) => void;
  setHistoryOffset: (offset: number) => void;
  setViewMode: (mode: 'Normal' | 'Advanced') => void;
  setSimulationMode: (mode: SimulationMode) => void;
  updateVitals: (vitals: Partial<Record<keyof Vitals, Partial<VitalStatus>>>) => void;
  addAlert: (alert: Omit<Alert, 'id'>) => void;
  setBatteryLevel: (level: number) => void;
  setConnectionStatus: (status: AppState['connectionStatus']) => void;
  // New actions
  setSelectedLeadIndex: (index: number) => void;
  setIsEcgExpanded: (isExpanded: boolean) => void;
  setAdvancedEcgMode: (mode: 'Single' | 'All') => void;
  setIsAdvancedMenuOpen: (isOpen: boolean) => void;
  setActivityType: (type: string) => void;
}
