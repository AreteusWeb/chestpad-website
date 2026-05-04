import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import useStore from '../store/useStore';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../utils/cn';
import { SeverityLevel, VitalStatus } from '../types';

const SeverityArrows: React.FC<{ trend: 'up' | 'down' | 'stable'; severity: SeverityLevel; color: string; size: number }> = ({ trend, severity, color, size }) => {
  if (severity === 'normal') {
    return trend === 'up' ? <ChevronUp size={size} className={color} /> : <ChevronDown size={size} className={color} />;
  }
  
  const count = severity === 'moderate' ? 1 : 2;
  return (
    <div className="flex flex-col -gap-4">
      {Array.from({ length: count }).map((_, i) => (
        trend === 'up' ? 
          <ChevronUp key={i} size={size} className={cn(color, i > 0 && "-mt-4")} /> : 
          <ChevronDown key={i} size={size} className={cn(color, i > 0 && "-mt-4")} />
      ))}
    </div>
  );
};

const VitalCard: React.FC<{ 
  label: string; 
  status: VitalStatus;
  color?: string;
  size?: 'sm' | 'normal' | 'xl';
  showUnit?: boolean;
}> = ({ label, status, color = "text-white", size = 'normal', showUnit = true }) => (
  <div className="flex flex-col items-center">
    <div className="flex items-start gap-1">
      <motion.span 
        key={String(status.value)}
        initial={{ opacity: 0, y: status.trend === 'up' ? 5 : -5 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn(
          "font-medium tracking-tighter transition-all duration-300",
          size === 'xl' ? 'text-8xl' : size === 'normal' ? 'text-5xl' : 'text-3xl',
          color
        )}
      >
        {status.value}
      </motion.span>
      <div className={cn(
        "flex flex-col items-start transition-all duration-300",
        size === 'xl' ? 'mt-2' : size === 'normal' ? 'mt-1.5' : 'mt-1'
      )}>
        {showUnit && (
          <span className={cn(
            "font-medium transition-all duration-300",
            size === 'xl' ? 'text-2xl' : size === 'normal' ? 'text-lg' : 'text-xs',
            color
          )}>{status.unit}</span>
        )}
        <SeverityArrows 
          trend={status.trend} 
          severity={status.severity} 
          color={color} 
          size={size === 'xl' ? 32 : size === 'normal' ? 24 : 16} 
        />
      </div>
    </div>
    <span className={cn(
      "font-medium text-slate-500 uppercase tracking-widest mt-1 transition-all duration-300",
      size === 'sm' ? 'text-[8px]' : 'text-xs'
    )}>{label}</span>
  </div>
);

interface VitalsDisplayProps {
  compact?: boolean;
}

const VitalsDisplay: React.FC<VitalsDisplayProps> = ({ compact }) => {
  const vitals = useStore(state => state.vitals);

  return (
    <div className={cn(
      "relative flex flex-col items-center gap-1 flex-shrink-0 transition-all duration-300",
      compact ? "py-1" : "py-4"
    )}>
      {/* Top Row: SpO2 and Blood Pressure */}
      <div className={cn(
        "flex justify-between w-full mb-1 transition-all duration-300",
        compact ? "px-12" : "px-8"
      )}>
        <VitalCard 
          label="SpO2" 
          status={vitals.spo2} 
          color="text-white" 
          size={compact ? 'sm' : 'normal'} 
        />
        <VitalCard 
          label="Blood Pressure" 
          status={vitals.bloodPressure} 
          size={compact ? 'sm' : 'normal'}
        />
      </div>

      {/* Center: BPM */}
      <div className="relative flex items-center justify-center w-full px-4 mb-0.5">
        <VitalCard 
          label="BPM" 
          status={vitals.heartRate} 
          size={compact ? 'normal' : 'xl'} 
          showUnit={false}
        />
      </div>

      {/* Bottom Row: Temperature and Respiration Rate */}
      <div className={cn(
        "flex justify-between w-full transition-all duration-300",
        compact ? "px-12" : "px-8"
      )}>
        <VitalCard 
          label="Temperature" 
          status={vitals.temperature} 
          color={vitals.temperature.severity !== 'normal' ? "text-rose-400" : "text-white"} 
          size={compact ? 'sm' : 'normal'}
        />
        <VitalCard 
          label="Respiratory Rate" 
          status={vitals.respirationRate} 
          size={compact ? 'sm' : 'normal'}
        />
      </div>

      {/* Decorative Brackets pointing to center BPM (Mockup style) */}
      <div className={cn(
        "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full pointer-events-none z-0 transition-all duration-300",
        compact ? "h-[85%]" : "h-[70%]"
      )}>
        <svg className="w-full h-full" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet">
          {/* Top bracket (V shape) */}
          <path d={compact ? "M 150 60 L 200 85 L 250 60" : "M 120 40 L 200 80 L 280 40"} fill="none" stroke="#334155" strokeWidth={compact ? "1" : "1.5"} opacity="0.6" strokeLinecap="square" />
          {/* Bottom bracket (^ shape) */}
          <path d={compact ? "M 150 240 L 200 215 L 250 240" : "M 120 260 L 200 220 L 280 260"} fill="none" stroke="#334155" strokeWidth={compact ? "1" : "1.5"} opacity="0.6" strokeLinecap="square" />
          {/* Left bracket ( > shape) */}
          <path d={compact ? "M 110 120 L 140 150 L 110 180" : "M 90 110 L 130 150 L 90 190"} fill="none" stroke="#334155" strokeWidth={compact ? "1" : "1.5"} opacity="0.6" strokeLinecap="square" />
          {/* Right bracket ( < shape) */}
          <path d={compact ? "M 290 120 L 260 150 L 290 180" : "M 310 110 L 270 150 L 310 190"} fill="none" stroke="#334155" strokeWidth={compact ? "1" : "1.5"} opacity="0.6" strokeLinecap="square" />
        </svg>
      </div>
    </div>
  );
};

export default VitalsDisplay;
