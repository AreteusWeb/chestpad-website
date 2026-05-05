import React from 'react';
import { ChevronDown } from 'lucide-react';

const FallAlert: React.FC = () => {
  return (
    <div className="flex items-center justify-between px-5 py-1.5 bg-rose-950/20 border border-rose-900/30 rounded-full w-fit gap-4 mx-auto mt-2 mb-1">
      <span className="text-[8px] font-bold text-rose-500/90 tracking-[0.1em] uppercase whitespace-nowrap">Fall detected - No movement</span>
      <ChevronDown size={12} className="text-rose-900/60" />
    </div>
  );
};

export default FallAlert;
