import React from 'react';
import { ArrowUp, ArrowDown, TriangleAlert, X } from 'lucide-react';
import useStore from '../store/useStore';
import { cn } from '../utils/cn';
import { SeverityLevel, VitalStatus } from '../types';

const SeverityArrows: React.FC<{ trend: 'up' | 'down' | 'stable'; severity: SeverityLevel; color: string; size: number }> = ({ trend, severity, color, size }) => {
  if (severity === 'normal') return null;
  if (trend === 'up') return <ArrowUp size={size} className={color} strokeWidth={2} />;
  if (trend === 'down') return <ArrowDown size={size} className={color} strokeWidth={2} />;
  return null;
};

const getAlertInfo = (label: string, status: VitalStatus): { line1: string; line2: string } | null => {
  if (status.severity === 'normal') return null;
  switch (label) {
    case 'Temperature': return { line1: 'Fever detected', line2: 'Tap to review' };
    case 'BPM': return Number(status.value) > 100
      ? { line1: 'Tachycardia detected', line2: 'Tap to review' }
      : { line1: 'Bradycardia detected', line2: 'Tap to review' };
    case 'SpO2': return { line1: 'SpO2 Drop detected', line2: 'Tap to review' };
    case 'Blood Pressure': return { line1: 'Abnormal BP detected', line2: 'Tap to review' };
    case 'Respiratory Rate': return { line1: 'Abnormal Resp rate', line2: 'Tap to review' };
    default: return { line1: 'Alert detected', line2: 'Tap to review' };
  }
};

const VitalCard: React.FC<{
  label: string;
  status: VitalStatus;
  color?: string;
  size?: 'sm' | 'normal' | 'xl';
  showUnit?: boolean;
  onAlertTap?: () => void;
  goLiveSignal?: number;
}> = ({ label, status, color = "text-white", size = 'normal', showUnit = true, frozen, onAlertTap, goLiveSignal }) => {
  const [dismissed, setDismissed] = React.useState(false);
  const dismissTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Severity estabilizado — ignora cambios a 'normal' que duren menos de 5s
  // Esto evita que la alerta parpadee cuando el simulador oscila entre valores
  const stableSeverity = React.useRef<string>('normal');
  const stabilizeTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    const sev = status.severity;

    if (sev !== 'normal') {
      // Entró a alerta — cancelar cualquier timer de "volver a normal" y fijar severity
      if (stabilizeTimer.current) { clearTimeout(stabilizeTimer.current); stabilizeTimer.current = null; }
      if (stableSeverity.current === 'normal') {
        // Nueva alerta — mostrar tooltip y arrancar timer de 30s
        stableSeverity.current = sev;
        setDismissed(false);
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
        dismissTimer.current = setTimeout(() => setDismissed(true), 30_000);
      } else {
        stableSeverity.current = sev;
      }
    } else {
      // Volvió a normal — esperar 5s antes de realmente quitarlo
      // (el simulador oscila, no queremos parpadeo)
      if (stabilizeTimer.current) clearTimeout(stabilizeTimer.current);
      stabilizeTimer.current = setTimeout(() => {
        stableSeverity.current = 'normal';
        stabilizeTimer.current = null;
      }, 5_000);
    }

    return () => {
      if (stabilizeTimer.current) clearTimeout(stabilizeTimer.current);
    };
  }, [status.severity]);

  // Limpiar todo al congelarse
  React.useEffect(() => {
    if (frozen) {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
      if (stabilizeTimer.current) clearTimeout(stabilizeTimer.current);
    }
  }, [frozen]);

  // goLiveSignal: al volver a Live NO auto-dismiss — usuario cierra con X

  // Usar stableSeverity para que el tooltip no parpadee
  const stableStatus = { ...status, severity: stableSeverity.current as typeof status.severity };
  // Solo mostrar alerta si hay handler (Advanced mode) y no está dismissed
  const alertInfo = !frozen && !dismissed && !!onAlertTap ? getAlertInfo(label, stableStatus) : null;
  const isXL = size === 'xl';

  return (
    <div className="flex flex-col items-center">
      {/* Número + alertas */}
      <div className="flex items-center gap-1">
        <div className={cn(
          "flex items-baseline transition-opacity duration-300 relative",
          frozen && "opacity-70"
        )}>

          {/* Triángulo arriba-izquierda del número */}
          {alertInfo && (
            <div className={cn(
              "absolute animate-pulse",
              isXL ? "-top-5 -left-6" : "-top-3 -left-4"
            )}>
              <TriangleAlert
                size={isXL ? 18 : 13}
                className="text-rose-500"
                strokeWidth={2}
              />
            </div>
          )}

          {/* Mensaje arriba-derecha del número — más compacto para no salir de pantalla */}
          {alertInfo && (
            <div className={cn(
              "absolute z-20 pointer-events-auto",
              isXL ? "-top-10 left-full ml-1" : "-top-8 left-full ml-0.5"
            )}>
              <div className={cn(
                "relative flex flex-col bg-rose-950/95 border border-rose-500/30 rounded shadow-xl backdrop-blur-sm",
                isXL ? "p-1.5 w-[80px]" : "p-1 w-[60px]"
              )}>
                {/* Tachita */}
                <button
                  className="absolute top-0.5 right-0.5 w-4 h-4 flex items-center justify-center rounded-full text-rose-300 hover:text-white hover:bg-rose-500/30 transition-colors active:scale-95 z-30"
                  onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
                >
                  <X size={9} strokeWidth={2.5} />
                </button>
                {/* Texto clickeable */}
                <button
                  className="text-left whitespace-normal pr-3"
                  onClick={(e) => { e.stopPropagation(); onAlertTap?.(); }}
                >
                  <span className={cn(
                    "block font-bold text-rose-400 uppercase tracking-tight leading-[1.1]",
                    isXL ? "text-[8px]" : "text-[6px]"
                  )}>
                    {alertInfo.line1}
                  </span>
                  <span className={cn(
                    "block text-rose-500/70 uppercase tracking-widest mt-0.5 leading-[1.1]",
                    isXL ? "text-[7px]" : "text-[5px]"
                  )}>
                    {alertInfo.line2}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Número */}
          <span className={cn(
            "font-light tracking-tight transition-colors duration-300",
            isXL ? 'text-7xl' : size === 'normal' ? 'text-4xl' : 'text-2xl',
            frozen ? "text-slate-400" : color
          )}>
            {status.value}
          </span>

          {showUnit && status.unit && (
            <span className={cn(
              "font-light transition-all duration-300 ml-1",
              isXL ? 'text-2xl' : size === 'normal' ? 'text-lg' : 'text-xs',
              frozen ? "text-slate-500" : color
            )}>{status.unit}</span>
          )}
        </div>

        {!frozen && (
          <SeverityArrows
            trend={status.trend}
            severity={status.severity}
            color={color}
            size={isXL ? 36 : size === 'normal' ? 24 : 18}
          />
        )}
      </div>

      <span className={cn(
        "font-normal uppercase tracking-widest mt-1 transition-all duration-300",
        size === 'sm' ? 'text-[8px]' : 'text-xs',
        frozen ? "text-slate-600" : "text-slate-500"
      )}>{label}</span>
    </div>
  );
};

// ─── VitalsDisplay ────────────────────────────────────────────────────────────

interface VitalsDisplayProps {
  compact?: boolean;
}

const VitalsDisplay: React.FC<VitalsDisplayProps> = ({ compact }) => {
  const vitals = useStore(state => state.vitals);
  const historyOffset = useStore(state => state.historyOffset);
  const activeEvent = useStore(state => state.activeEventBanner);
  const jumpToEvent = useStore(state => state.jumpToEvent);
  const events = useStore(state => state.events);
  const viewMode = useStore(state => state.viewMode);
  const isAdvanced = viewMode === 'Advanced';

  // Congelamos snapshot al entrar en modo histórico
  const frozenVitals = React.useRef(vitals);
  const wasFrozen = React.useRef(false);
  const isFrozen = historyOffset > 0;

  if (isFrozen && !wasFrozen.current) {
    frozenVitals.current = vitals;
    wasFrozen.current = true;
  }
  if (!isFrozen && wasFrozen.current) {
    wasFrozen.current = false;
  }

  const displayVitals = isFrozen ? frozenVitals.current : vitals;

  // Al volver a Live — limpiar todos los tooltips de alerta
  const prevOffset = React.useRef(historyOffset);
  React.useEffect(() => {
    if (prevOffset.current > 0 && historyOffset === 0) {
      // Acaba de volver a live — disparar evento custom para que cada VitalCard limpie su tooltip
      setGoLiveSignal(s => s + 1);
    }
    prevOffset.current = historyOffset;
  }, [historyOffset]);
  const [goLiveSignal, setGoLiveSignal] = React.useState(0);

  // Al picar una alerta — salta al evento más reciente de ese tipo
  // Si el evento aún no está en el store (race condition), usar timestamp actual
  const handleAlertTap = (eventType: string[]) => {
    const latest = events.find(e => eventType.includes(e.type));
    if (latest) {
      jumpToEvent(latest);
    } else if (activeEvent && eventType.includes(activeEvent.type)) {
      jumpToEvent(activeEvent);
    } else {
      // Fallback: congelar en este momento (el evento acaba de ocurrir)
      // Ponemos 5s de offset para que el buffer tenga datos
      useStore.getState().setHistoryOffset(5);
    }
  };

  return (
    <div className={cn(
      "relative flex flex-col items-center gap-1 flex-shrink-0 transition-all duration-300",
      compact ? "py-1" : "py-4"
    )}>

      {/* Indicador Past */}
      {isFrozen && (
        <div className="absolute top-1 right-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-500/10 border border-teal-500/20">
          <span className="w-1 h-1 rounded-full bg-teal-500" />
          <span className="text-[7px] font-bold uppercase tracking-widest text-teal-500">Past</span>
        </div>
      )}

      {/* Top Row: SpO2 + Blood Pressure */}
      <div className={cn(
        "flex justify-between w-full mb-1 transition-all duration-300",
        compact ? "px-12" : "px-8"
      )}>
        <VitalCard
          label="SpO2"
          status={displayVitals.spo2}
          color="text-white"
          size={compact ? 'sm' : 'normal'}
          frozen={isFrozen}
          onAlertTap={isAdvanced ? () => handleAlertTap(['spo2drop']) : undefined}
          goLiveSignal={goLiveSignal}
        />
        <VitalCard
          label="Blood Pressure"
          status={displayVitals.bloodPressure}
          size={compact ? 'sm' : 'normal'}
          frozen={isFrozen}
          onAlertTap={isAdvanced ? () => handleAlertTap(['elevated_hr']) : undefined}
          goLiveSignal={goLiveSignal}
        />
      </div>

      {/* Centro: BPM */}
      <div className="relative flex items-center justify-center w-full px-4 mb-0.5">
        <VitalCard
          label="BPM"
          status={displayVitals.heartRate}
          size={compact ? 'normal' : 'xl'}
          showUnit={false}
          frozen={isFrozen}
          onAlertTap={isAdvanced ? () => handleAlertTap(['tachycardia', 'elevated_hr', 'bradycardia']) : undefined}
          goLiveSignal={goLiveSignal}
        />
      </div>

      {/* Bottom Row: Temp + Resp */}
      <div className={cn(
        "flex justify-between w-full transition-all duration-300",
        compact ? "px-12" : "px-8"
      )}>
        <VitalCard
          label="Temperature"
          status={displayVitals.temperature}
          color={!isFrozen && displayVitals.temperature.severity !== 'normal' ? "text-rose-400" : "text-white"}
          size={compact ? 'sm' : 'normal'}
          frozen={isFrozen}
          onAlertTap={isAdvanced ? () => handleAlertTap(['fever']) : undefined}
          goLiveSignal={goLiveSignal}
        />
        <VitalCard
          label="Respiratory Rate"
          status={displayVitals.respirationRate}
          size={compact ? 'sm' : 'normal'}
          frozen={isFrozen}
          onAlertTap={isAdvanced ? () => handleAlertTap(['spo2drop']) : undefined}
          goLiveSignal={goLiveSignal}
        />
      </div>

      {/* Brackets decorativos */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full pointer-events-none z-0 transition-all duration-300">
        <svg className="w-full h-full" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet">
          <path d={compact ? "M 170 85 L 200 115 L 230 85" : "M 160 55 L 200 95 L 240 55"} fill="none" stroke="#334155" strokeWidth="1" opacity="0.6" strokeLinecap="square" />
          <path d={compact ? "M 170 215 L 200 185 L 230 215" : "M 160 245 L 200 205 L 240 245"} fill="none" stroke="#334155" strokeWidth="1" opacity="0.6" strokeLinecap="square" />
          <path d={compact ? "M 115 120 L 145 150 L 115 180" : "M 75 110 L 115 150 L 75 190"} fill="none" stroke="#334155" strokeWidth="1" opacity="0.6" strokeLinecap="square" />
          <path d={compact ? "M 285 120 L 255 150 L 285 180" : "M 325 110 L 285 150 L 325 190"} fill="none" stroke="#334155" strokeWidth="1" opacity="0.6" strokeLinecap="square" />
        </svg>
      </div>
    </div>
  );
};

export default VitalsDisplay;
