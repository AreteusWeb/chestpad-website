import React from 'react';
import useStore from '../store/useStore';
import WaveformCanvas from './WaveformCanvas';
import { cn } from '../utils/cn';
import { ChevronDown } from 'lucide-react';
import { usePhysiologicalData } from '../hooks/usePhysiologicalData';

import CustomDropdown from './ui/CustomDropdown';

const WaveformContainer: React.FC = () => {
  const viewMode = useStore(state => state.viewMode);
  const selectedLeadIndex = useStore(state => state.selectedLeadIndex);
  const setSelectedLeadIndex = useStore(state => state.setSelectedLeadIndex);
  const isEcgExpanded = useStore(state => state.isEcgExpanded);
  const setIsEcgExpanded = useStore(state => state.setIsEcgExpanded);
  const advancedEcgMode = useStore(state => state.advancedEcgMode);
  const setAdvancedEcgMode = useStore(state => state.setAdvancedEcgMode);

  const { waveforms } = usePhysiologicalData();
  const vitals = useStore(state => state.vitals);

  const leads = ['Lead I', 'Lead II', 'Lead III', 'V1', 'V2'];

  if (viewMode === 'Normal') {
    return (
      <div className="flex flex-col p-4 pt-0 bg-transparent flex-shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-white">ECG Monitoring</span>
            <CustomDropdown 
              options={leads} 
              current={selectedLeadIndex} 
              onSelect={setSelectedLeadIndex} 
            />
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Good</span>
            </div>
          </div>
          <button 
            onClick={() => setIsEcgExpanded(!isEcgExpanded)}
            className="text-[11px] font-bold text-slate-500 uppercase tracking-widest hover:text-white transition-colors"
          >
            {isEcgExpanded ? '< Collapse' : 'Expand >'}
          </button>
        </div>
        <div className={cn(
          "relative bg-slate-950/40 rounded-xl overflow-hidden border border-white/5 shadow-2xl transition-all duration-300",
          isEcgExpanded ? "h-[500px]" : "h-24"
        )}>
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
            style={{ backgroundImage: 'radial-gradient(circle, white 1px, transparent 1px)', backgroundSize: '15px 15px' }} 
          />
          <WaveformCanvas 
            data={waveforms[selectedLeadIndex % 4]} 
            height={isEcgExpanded ? 500 : 96} 
            color="#2dd4bf" 
            min={-1.5} 
            max={1.5}
            lineWidth={isEcgExpanded ? 2.5 : 1.5}
            gridLines={isEcgExpanded}
          />
        </div>
      </div>
    );
  }

  // Advanced Mode (More compact)
  return (
    <div className="flex flex-col p-3 pt-1 gap-1.5 bg-black flex-shrink-0">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-4 text-[9px] font-bold uppercase tracking-[0.2em]">
          <button 
            onClick={() => setAdvancedEcgMode('Single')}
            className={cn("transition-colors", advancedEcgMode === 'Single' ? "text-white border-b border-white pb-0.5" : "text-slate-500")}
          >
            Single lead
          </button>
          <button 
            onClick={() => setAdvancedEcgMode('All')}
            className={cn("transition-colors", advancedEcgMode === 'All' ? "text-white border-b border-white pb-0.5" : "text-slate-500")}
          >
            All leads
          </button>
        </div>
        {advancedEcgMode === 'Single' && (
          <CustomDropdown 
            options={leads} 
            current={selectedLeadIndex} 
            onSelect={setSelectedLeadIndex}
            align="right"
          />
        )}
      </div>

      {/* Multi-lead or Single-lead ECG */}
      <div className="flex flex-col gap-0.5 min-h-0">
        {advancedEcgMode === 'All' ? (
          leads.map((label, i) => (
            <div key={label} className="relative bg-slate-900/10 rounded-sm border-b border-slate-900/10">
              <div className="absolute left-1 top-0.5 z-10 text-[7px] font-bold text-slate-600 uppercase">{label}</div>
              <WaveformCanvas 
                data={waveforms[i % 4]} 
                height={28} 
                color="#2dd4bf" 
                min={-1.5} 
                max={1.5} 
                gridLines={false}
                lineWidth={1}
              />
            </div>
          ))
        ) : (
          <div className="relative bg-slate-950/60 rounded-lg border border-slate-800 h-32">
            <div className="absolute left-2 top-2 z-10 flex items-center gap-2">
              <span className="text-[10px] font-bold text-slate-300 uppercase">{leads[selectedLeadIndex]}</span>
              <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-tighter">Status: Optimal</span>
            </div>
            <WaveformCanvas 
              data={waveforms[selectedLeadIndex % 4]} 
              height={128} 
              color="#2dd4bf" 
              min={-1.5} 
              max={1.5} 
              gridLines={true}
              lineWidth={2}
            />
          </div>
        )}
      </div>

      {/* Respiration - Much Narrower */}
      <div className="flex flex-col mt-0.5">
        <div className="flex items-center justify-between px-1 mb-0.5">
          <h4 className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Resp Tracking</h4>
          <span className="text-[10px] font-bold text-teal-400 tabular-nums">{vitals.respirationRate.value}{vitals.respirationRate.unit}</span>
        </div>
        <div className="bg-slate-950/40 rounded border border-white/5 h-8">
          <WaveformCanvas 
            data={waveforms[4]} 
            height={32} 
            color="#5eead4" 
            min={-1} 
            max={1} 
            gridLines={false}
            lineWidth={1}
          />
        </div>
      </div>

      {/* SpO2 Graph - Refined */}
      <div className="flex flex-col mt-0.5">
        <div className="flex items-center justify-between px-1 mb-0.5">
          <h4 className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">SpO2 Tracking</h4>
          <span className="text-[10px] font-bold text-teal-400 tabular-nums">{vitals.spo2.value}{vitals.spo2.unit}</span>
        </div>
        <div className="flex items-end gap-[0.5px] h-10 px-1 pb-1 overflow-hidden bg-slate-950/40 rounded border border-white/5">
          {waveforms[5].slice(-180).map((val, i) => (
             <div 
               key={i} 
               className="bg-teal-500/20 w-[2px] rounded-t-[1px] flex-shrink-0" 
               style={{ height: `${Math.max(10, Math.min(100, val * 100))}%` }} 
             />
          ))}
        </div>
      </div>

      {/* Auscultation Section */}
      <div className="flex flex-col mt-2">
        <div className="flex items-center justify-between px-1 mb-1">
          <h4 className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Auscultation</h4>
          <button className="flex items-center gap-1.5 px-3 py-1 bg-slate-900 border border-slate-800 rounded-full text-[8px] font-bold text-slate-400 uppercase tracking-widest hover:text-white hover:border-teal-500/50 transition-all">
            <div className="w-1.5 h-1.5 rounded-full bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.5)]" />
            Start listening
          </button>
        </div>
      </div>

      {/* Alerts Section moved from Controls */}
      <div className="flex flex-col mt-3 px-1">
        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-[0.2em] mb-2">Recent Alerts</span>
        <div className="flex flex-col gap-2">
          <div className="flex justify-between items-center bg-slate-900/40 p-2 rounded border border-white/5">
            <div className="flex flex-col">
              <span className="text-[10px] font-medium text-slate-200">Elevated Heart Rate</span>
              <span className="text-[8px] text-slate-500 font-bold uppercase">10:11 AM</span>
            </div>
            <div className="text-[8px] font-bold text-rose-500 uppercase px-1.5 py-0.5 bg-rose-500/10 rounded">BPM 142</div>
          </div>
          <div className="flex justify-between items-center bg-slate-900/40 p-2 rounded border border-white/5">
            <div className="flex flex-col">
              <span className="text-[10px] font-medium text-slate-200">SpO2 Threshold Drop</span>
              <span className="text-[8px] text-slate-500 font-bold uppercase">10:35 AM</span>
            </div>
            <div className="text-[8px] font-bold text-yellow-500 uppercase px-1.5 py-0.5 bg-yellow-500/10 rounded">SpO2 89%</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WaveformContainer;
