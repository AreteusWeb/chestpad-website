import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ChevronDown } from 'lucide-react';
import { cn } from '../utils/cn';
import useStore from '../store/useStore';

import CustomDropdown from './ui/CustomDropdown';

const AdvancedControls: React.FC = () => {
  const { historyOffset, setHistoryOffset } = useStore();
  const ranges = ['10 Min', '1 Hr', '1 Day'];
  const [activeRange, setActiveRange] = React.useState('1 Hr');
  const [selectedEvent, setSelectedEvent] = React.useState(0);

  const eventOptions = ['All Events', 'Falls', 'HR Spikes', 'Arrhythmia', 'SpO2 Drop'];

  const handleSeek = (direction: 'back' | 'forward', amount: number) => {
    const newOffset = direction === 'back' ? historyOffset + amount : Math.max(0, historyOffset - amount);
    setHistoryOffset(newOffset);
  };

  const isInPast = historyOffset > 0;

  return (
    <div className="flex flex-col gap-1.5 px-3 py-1.5 bg-black">
      <div className="flex flex-col gap-1 mt-0.5">
        <div className="flex items-center justify-between gap-2">
          {/* Left Column: Navigation & Past Status */}
          <div className="flex flex-col items-center gap-1.5 min-w-[75px]">
            <div className="flex gap-1">
              <button 
                onClick={() => handleSeek('back', 60)}
                className="p-2.5 px-3 rounded-full border border-slate-800/80 hover:bg-slate-800/50 transition-colors"
              >
                <ChevronsLeft size={16} className="text-slate-400" />
              </button>
              <button 
                onClick={() => handleSeek('back', 10)}
                className="p-2.5 px-3 rounded-full border border-slate-800/80 hover:bg-slate-800/50 transition-colors"
              >
                <ChevronLeft size={16} className="text-slate-400" />
              </button>
            </div>
            <div className={cn(
              "w-full px-1.5 py-2 rounded border text-[8px] font-bold uppercase tracking-[0.05em] text-center transition-all duration-300 whitespace-nowrap",
              isInPast ? "border-teal-500/60 text-white bg-teal-500/5" : "border-slate-800 text-slate-700"
            )}>
              Past Status
            </div>
          </div>

          {/* Center Section: Time Selection Box */}
          <div className="flex-1 flex flex-col gap-1.5 p-1.5 bg-slate-900/30 border border-slate-800/50 rounded-xl min-w-[120px]">
            <div className="flex gap-1 justify-center">
              {ranges.map(range => (
                <button
                  key={range}
                  onClick={() => setActiveRange(range)}
                  className={cn(
                    "flex-1 px-1 py-2 rounded-full text-[8px] font-bold uppercase transition-all border border-slate-800 min-w-[30px]",
                    activeRange === range ? "bg-teal-500 text-white border-teal-400 shadow-lg shadow-teal-500/20" : "text-slate-500 hover:text-slate-300"
                  )}
                >
                  {range.replace(' Min', 'm').replace(' Hr', 'h').replace(' Day', 'd')}
                </button>
              ))}
            </div>
            <div className="flex gap-1">
              <button 
                className={cn(
                  "flex-1 px-1.5 py-2 rounded-full text-[8px] font-bold uppercase tracking-tight border transition-colors",
                  selectedEvent === 0 ? "bg-slate-800 text-white border-slate-700" : "text-slate-500 border-slate-800 hover:text-slate-200"
                )}
                onClick={() => setSelectedEvent(0)}
              >
                All
              </button>
              <CustomDropdown 
                options={['Evt', 'Fall', 'HR', 'SpO2']}
                current={selectedEvent}
                onSelect={setSelectedEvent}
                className="flex-1"
                align="center"
                position="top"
              />
            </div>
          </div>

          {/* Right Column: Navigation & Live Button */}
          <div className="flex flex-col items-center gap-1.5 min-w-[75px]">
            <div className="flex gap-1">
              <button 
                 onClick={() => handleSeek('forward', 10)}
                 className="p-2.5 px-3 rounded-full border border-slate-800/80 hover:bg-slate-800/50 transition-colors"
              >
                 <ChevronRight size={16} className="text-slate-400" />
              </button>
              <button 
                 onClick={() => handleSeek('forward', 60)}
                 className="p-2.5 px-3 rounded-full border border-slate-800/80 hover:bg-slate-800/50 transition-colors"
              >
                 <ChevronsRight size={16} className="text-slate-400" />
              </button>
            </div>
            <button 
              onClick={() => setHistoryOffset(0)}
              className={cn(
                "w-full px-2 py-2 rounded-full text-[8px] font-bold uppercase tracking-[0.05em] transition-all whitespace-nowrap",
                !isInPast ? "bg-teal-500 text-white shadow-lg shadow-teal-500/20" : "bg-slate-900 border border-slate-800 text-slate-500 hover:text-white"
              )}
            >
              Go Live
            </button>
          </div>
        </div>

        {/* Timeline Slider (Restored) */}
        <div className="px-2 py-0">
          <input
            type="range"
            min="0"
            max="3600"
            step="10"
            value={historyOffset}
            onChange={(e) => setHistoryOffset(parseInt(e.target.value))}
            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-teal-500"
          />
        </div>
      </div>

      {/* Footer Timestamp */}
      <div className="flex justify-center mt-0.5">
        <span className="text-base font-bold text-slate-500 tabular-nums tracking-wider bg-black px-4">
          04/23 <span className="mx-2 opacity-50">|</span> {isInPast ? `T-${historyOffset}s` : '10:32'}
        </span>
      </div>
    </div>
  );
};

export default AdvancedControls;
