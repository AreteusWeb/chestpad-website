import React from 'react';
import useStore from '../store/useStore';
import { Battery, Wifi } from 'lucide-react';
import { cn } from '../utils/cn';

const Footer: React.FC = () => {
  const batteryLevel = useStore(state => state.batteryLevel);
  const connectionStatus = useStore(state => state.connectionStatus);

  const getConnectionColor = () => {
    switch (connectionStatus) {
      case 'Stable': return 'text-emerald-400';
      case 'Weak': return 'text-yellow-400';
      case 'Connecting': return 'text-blue-400';
      case 'Disconnected': return 'text-rose-400';
      default: return 'text-slate-400';
    }
  };

  const getBatteryColor = () => {
    if (batteryLevel > 70) return 'text-emerald-400';
    if (batteryLevel > 30) return 'text-yellow-400';
    return 'text-rose-400';
  };

  return (
    <div className="w-full px-4 py-2 flex justify-between items-center bg-black/40 backdrop-blur-sm border-t border-white/5 z-[40]">
      <div className="flex items-center gap-1.5">
        <Battery size={10} className={cn("opacity-60", getBatteryColor())} />
        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-[0.2em]">
          Battery: <abbr title={`${batteryLevel}%`} className="no-underline decoration-transparent">
            <span className={cn("text-slate-300", getBatteryColor())}>{batteryLevel}%</span>
          </abbr>
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-right">
        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-[0.2em]">
          Connection: <span className={cn("text-slate-300", getConnectionColor())}>{connectionStatus}</span>
        </span>
        <Wifi size={10} className={cn("opacity-60", getConnectionColor())} />
      </div>
    </div>
  );
};

export default Footer;
