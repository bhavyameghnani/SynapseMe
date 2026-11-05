import React from 'react';
import { Brain, Sparkles, Clock, FileCode, Shield, CheckCircle2 } from 'lucide-react';
import { CortexStats } from '../types';

interface HeaderProps {
  stats: CortexStats | null;
  onOpenDebrief: () => void;
  onOpenPromptModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  stats,
  onOpenDebrief,
  onOpenPromptModal,
}) => {
  return (
    <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-xl sticky top-0 z-30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Identity */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-md shadow-indigo-500/20 text-white">
            <Brain className="w-5 h-5" />
            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-slate-950" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold text-slate-100 tracking-tight">
                Synapse Me
              </h1>
              <span className="text-xs text-indigo-400 font-mono">
                / Neural Digital Twin
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Sovereign Context Active
              </span>
              <span>·</span>
              <span className="text-slate-500 font-mono">Plaud AI Wearable Sync</span>
            </div>
          </div>
        </div>

        {/* Central Core Philosophy Motto (Clean typography, zero-pill) */}
        <div className="hidden lg:flex items-center text-xs text-slate-400 italic max-w-md text-center">
          "What we see is what we think, what we think is what we become, and what we become is what we do."
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenPromptModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 text-xs font-medium transition-all cursor-pointer"
            title="View & copy the Google build prompt"
          >
            <FileCode className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden sm:inline">Google Build Prompt</span>
          </button>

          <button
            onClick={onOpenDebrief}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-medium shadow-md shadow-indigo-600/25 transition-all cursor-pointer"
          >
            <Clock className="w-3.5 h-3.5" />
            <span>5-Min Debrief</span>
          </button>
        </div>
      </div>
    </header>
  );
};
