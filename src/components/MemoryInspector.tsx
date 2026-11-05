import React, { useState } from 'react';
import { MemoryNode } from '../types';
import { Sparkles, Clock, Radio, CheckCircle2, ChevronDown, ChevronUp, Trash2, ArrowUpRight, Zap, Target } from 'lucide-react';

interface MemoryInspectorProps {
  memory: MemoryNode | null;
  onToggleTask: (taskId: string) => void;
  onDeleteMemory: (id: string) => void;
  onAskTwinAboutThis: (memoryTitle: string) => void;
}

export const MemoryInspector: React.FC<MemoryInspectorProps> = ({
  memory,
  onToggleTask,
  onDeleteMemory,
  onAskTwinAboutThis,
}) => {
  const [showRawTranscript, setShowRawTranscript] = useState(false);

  if (!memory) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl p-8 flex flex-col items-center justify-center text-center h-full min-h-[300px]">
        <Zap className="w-8 h-8 text-slate-600 mb-2 stroke-[1.5]" />
        <p className="text-sm font-medium text-slate-300">Select a Synaptic Node</p>
        <p className="text-xs text-slate-500 max-w-xs mt-1">
          Click any point in the Brain Cortex visualizer to inspect curated memories, decisions, and proactive tasks.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl p-5 flex flex-col h-full overflow-hidden">
      {/* Header with zero-pill inline metadata */}
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
            <span className="capitalize text-indigo-400 font-semibold">{memory.lobe} Lobe</span>
            <span>·</span>
            <span>{memory.displayTime}</span>
            <span>·</span>
            <span>{memory.durationMinutes} min</span>
            <span>·</span>
            <span className="text-slate-300">{memory.sourceDevice}</span>
          </div>
          <h3 className="text-base font-semibold text-slate-100 mt-1">{memory.title}</h3>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onAskTwinAboutThis(memory.title)}
            className="p-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 text-xs flex items-center gap-1 border border-indigo-500/30 transition-colors cursor-pointer"
            title="Ask Digital Twin about this memory"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ask Twin</span>
          </button>
          <button
            onClick={() => onDeleteMemory(memory.id)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
            title="Purge Synaptic Record"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Synaptic Weight Bar */}
      <div className="py-2.5 flex items-center justify-between text-xs border-b border-slate-800/80">
        <span className="text-slate-400">Synaptic Encoding Weight:</span>
        <div className="flex items-center gap-2">
          <div className="w-28 h-1.5 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full"
              style={{ width: `${memory.synapticWeight}%` }}
            />
          </div>
          <span className="font-mono tabular-nums text-slate-200 font-semibold">
            {memory.synapticWeight}%
          </span>
        </div>
      </div>

      {/* Scrollable Content Body */}
      <div className="flex-1 overflow-y-auto space-y-4 py-3 pr-1 text-xs">
        {/* Executive Summary */}
        <div>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Cortex Executive Synthesis
          </span>
          <p className="text-slate-200 mt-1 leading-relaxed bg-slate-950/40 p-3 rounded-xl border border-slate-800/60">
            {memory.summary}
          </p>
        </div>

        {/* Core Philosophical Insight / Mental Model */}
        {memory.coreInsight && (
          <div className="bg-indigo-950/20 border border-indigo-800/40 p-3 rounded-xl">
            <div className="flex items-center gap-1.5 text-indigo-300 font-medium">
              <Zap className="w-3.5 h-3.5 text-indigo-400" />
              <span>Core Insight & Value Alignment</span>
            </div>
            <p className="text-slate-200 italic mt-1 font-serif text-sm">
              "{memory.coreInsight}"
            </p>
          </div>
        )}

        {/* Key Points */}
        {memory.keyPoints && memory.keyPoints.length > 0 && (
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Extracted Key Points
            </span>
            <ul className="mt-1.5 space-y-1.5 text-slate-300">
              {memory.keyPoints.map((pt, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-indigo-400 mt-0.5">•</span>
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Decisions Made */}
        {memory.decisions && memory.decisions.length > 0 && (
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400">
              Explicit Agreements & Decisions
            </span>
            <ul className="mt-1.5 space-y-1 text-slate-300">
              {memory.decisions.map((dec, idx) => (
                <li key={idx} className="flex items-start gap-2 bg-emerald-950/20 border border-emerald-900/30 p-2 rounded-lg text-emerald-200">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{dec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Commitments & Tasks */}
        {memory.commitments && memory.commitments.length > 0 && (
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Automated Commitments ({memory.commitments.length})
            </span>
            <div className="mt-1.5 space-y-2">
              {memory.commitments.map((c) => (
                <div
                  key={c.id}
                  onClick={() => onToggleTask(c.id)}
                  className={`flex items-start justify-between gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                    c.completed
                      ? 'bg-slate-950/60 border-slate-800 text-slate-500 line-through'
                      : 'bg-slate-900 border-slate-700/80 text-slate-200 hover:border-slate-600'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        c.completed ? 'text-slate-600' : 'text-indigo-400'
                      }`}
                    />
                    <div>
                      <p className="font-medium">{c.title}</p>
                      {c.timeReference && (
                        <p className="text-[11px] text-amber-400 font-mono mt-0.5 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          <span>{c.timeReference}</span>
                        </p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded ${
                      c.priority === 'urgent'
                        ? 'bg-rose-950 text-rose-300 border border-rose-800'
                        : c.priority === 'high'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {c.priority}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Raw Transcript Accordion */}
        <div className="pt-2 border-t border-slate-800">
          <button
            onClick={() => setShowRawTranscript(!showRawTranscript)}
            className="flex items-center justify-between w-full text-slate-400 hover:text-slate-200 transition-colors py-1 cursor-pointer font-medium"
          >
            <span>Raw Verbatim Voice Transcript</span>
            {showRawTranscript ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showRawTranscript && (
            <div className="mt-2 p-3 bg-slate-950 rounded-xl border border-slate-800 text-slate-300 font-mono text-[11px] leading-relaxed max-h-48 overflow-y-auto">
              {memory.rawTranscript}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
