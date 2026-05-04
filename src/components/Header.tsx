import React from 'react';
import { User, Smartphone, ChevronRight, MoreVertical } from 'lucide-react';
import useStore from '../store/useStore';
import { cn } from '../utils/cn';

const Header: React.FC = () => {
  const { userName, deviceName, isConnected, connectionStatus, viewMode, setViewMode, isAdvancedMenuOpen, setIsAdvancedMenuOpen } = useStore();

  return (
    <header className="flex justify-between items-center px-4 py-3 bg-transparent whitespace-nowrap relative z-50">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
          <span>{userName} • </span>
          <span className={cn(
            !isConnected ? "text-rose-500" : (connectionStatus === 'Connecting' ? "text-yellow-500" : "text-emerald-500")
          )}>
            Device {connectionStatus === 'Connecting' ? 'Connecting...' : (isConnected ? 'Connected' : 'Disconnected')}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex bg-slate-900/60 backdrop-blur-md p-0.5 rounded-full border border-slate-800/50">
        <button
          onClick={() => setViewMode('Advanced')}
          className={cn(
            "px-2.5 py-1 rounded-full text-[9px] font-medium uppercase tracking-tight transition-all",
            viewMode === 'Advanced' ? "bg-slate-700 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
          )}
        >
          Advanced
        </button>
        <button
          onClick={() => setViewMode('Normal')}
          className={cn(
            "px-2.5 py-1 rounded-full text-[9px] font-medium uppercase tracking-tight transition-all",
            viewMode === 'Normal' ? "bg-slate-700 text-white shadow-sm" : "text-slate-500 hover:text-slate-300"
          )}
        >
          Normal
        </button>
        </div>
        {viewMode === 'Advanced' && !isAdvancedMenuOpen && (
          <button 
            onClick={() => setIsAdvancedMenuOpen(true)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800/60 text-slate-400 hover:bg-slate-700 hover:text-white transition-all shadow-lg border border-white/5"
          >
            <MoreVertical size={18} />
          </button>
        )}
      </div>
    </header>
  );
};

export default Header;
