import { create } from 'zustand';
import { AppState, AppActions, SimulationMode, Alert, Vitals } from '../types';

const useStore = create<AppState & AppActions>((set) => ({
  // Initial State
  isConnected: false,
  isLive: true,
  historyOffset: 0,
  viewMode: 'Normal',
  simulationMode: 'normal',
  vitals: {
    heartRate: { value: 78, unit: 'BPM', trend: 'up', severity: 'normal' },
    spo2: { value: 98, unit: '%', trend: 'down', severity: 'normal' },
    temperature: { value: 38.1, unit: '°C', trend: 'up', severity: 'moderate' },
    respirationRate: { value: 17, trend: 'stable', severity: 'normal' },
    bloodPressure: { value: '118/75', trend: 'down', severity: 'normal' },
  },
  activity: {
    steps: 3200,
    calories: 88,
    activityType: 'Walking',
  },
  alerts: [
    { id: '1', timestamp: '10:25 AM', message: 'Elevated Heart Rate', severity: 'medium' },
    { id: '2', timestamp: '11:23 PM', message: 'SpO2 Drop', severity: 'high' },
  ],
  batteryLevel: 80,
  connectionStatus: 'Stable',
  userName: 'Chris',
  deviceName: 'ChestPad v2',
  selectedLeadIndex: 0,
  isEcgExpanded: false,
  advancedEcgMode: 'All',
  isAdvancedMenuOpen: false,

  // Actions
  setConnected: (connected) => set({ isConnected: connected }),
  setIsLive: (isLive) => set({ isLive, ...(isLive ? { historyOffset: 0 } : {}) }),
  setHistoryOffset: (offset) => set({ historyOffset: offset, isLive: offset === 0 }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSimulationMode: (mode) => set({ simulationMode: mode }),
  updateVitals: (newVitals) => set((state) => {
    const updatedVitals = { ...state.vitals };
    (Object.keys(newVitals) as Array<keyof Vitals>).forEach((key) => {
      updatedVitals[key] = { ...updatedVitals[key], ...newVitals[key] };
    });
    return { vitals: updatedVitals };
  }),
  addAlert: (alert) => set((state) => ({
    alerts: [{ ...alert, id: Math.random().toString(36).substr(2, 9) }, ...state.alerts].slice(0, 50)
  })),
  setBatteryLevel: (level) => set({ batteryLevel: level }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setSelectedLeadIndex: (index) => set({ selectedLeadIndex: index }),
  setIsEcgExpanded: (isExpanded) => set({ isEcgExpanded: isExpanded }),
  setAdvancedEcgMode: (mode) => set({ advancedEcgMode: mode }),
  setIsAdvancedMenuOpen: (isOpen) => set({ isAdvancedMenuOpen: isOpen }),
  setActivityType: (type) => set((state) => ({ activity: { ...state.activity, activityType: type } })),
}));

export default useStore;
