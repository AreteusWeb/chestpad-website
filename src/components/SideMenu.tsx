import React from 'react';
import { Home, Activity, Bell, UserCircle, LogOut } from 'lucide-react';
import useStore from '../store/useStore';
import { cn } from '../utils/cn';
import { motion } from 'motion/react';
import { logout } from '../hooks/useAuth';

const SideMenu: React.FC = () => {
  const { isAdvancedMenuOpen, setIsAdvancedMenuOpen } = useStore();

  const menuItems = [
    { icon: Home,        label: 'Home' },
    { icon: Activity,    label: 'ECG' },
    { icon: Bell,        label: 'Alerts' },
    { icon: UserCircle,  label: 'Mode' },
  ];

  const handleLogout = async () => {
    setIsAdvancedMenuOpen(false);
    await logout();
    // onAuthStateChanged en useAuth limpia el store → App.tsx vuelve al LoginScreen
  };

  if (!isAdvancedMenuOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60]"
        onClick={() => setIsAdvancedMenuOpen(false)}
      />

      {/* Vertical Menu Pillar */}
      <motion.div
        initial={{ opacity: 0, y: -20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        className="absolute right-4 top-3 z-[70] w-14"
      >
        <div className="flex flex-col items-center gap-6 py-6 px-1 bg-slate-800 backdrop-blur-xl rounded-full border border-white/10 shadow-2xl">
          {/* Nav items */}
          {menuItems.map((item, idx) => (
            <button
              key={item.label}
              onClick={() => setIsAdvancedMenuOpen(false)}
              className={cn(
                'flex flex-col items-center gap-1 group transition-all',
                idx === 0 ? 'text-white' : 'text-slate-400 hover:text-white'
              )}
            >
              <item.icon size={24} strokeWidth={2} className="group-hover:scale-110 transition-transform" />
              <span className="text-[8px] font-bold uppercase tracking-tight opacity-60 group-hover:opacity-100">
                {item.label}
              </span>
            </button>
          ))}

          {/* Separador */}
          <div className="w-6 h-[1px] bg-white/10" />

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="flex flex-col items-center gap-1 group transition-all text-slate-500 hover:text-rose-400"
          >
            <LogOut size={24} strokeWidth={2} className="group-hover:scale-110 transition-transform" />
            <span className="text-[8px] font-bold uppercase tracking-tight opacity-60 group-hover:opacity-100">
              Exit
            </span>
          </button>
        </div>
      </motion.div>
    </>
  );
};

export default SideMenu;
