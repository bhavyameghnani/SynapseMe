import React, { useState, useMemo } from 'react';
import { MemoryNode, LobeType } from '../types';
import { Sparkles, Brain, Cpu, Eye, MessageSquare, Zap, Clock, Radio, ChevronRight } from 'lucide-react';

interface BrainVisualizerProps {
  memories: MemoryNode[];
  selectedMemoryId: string | null;
  onSelectMemory: (id: string) => void;
  activeLobeFilter: LobeType | 'all';
  onFilterLobe: (lobe: LobeType | 'all') => void;
}

// Preset anchor coordinates for brain lobes on a 600x420 canvas
const LOBE_AREAS: Record<LobeType, { name: string; icon: any; color: string; bgGlow: string; desc: string; center: [number, number] }> = {
  frontal: {
    name: 'Frontal Cortex',
    icon: Zap,
    color: '#6366f1', // Indigo
    bgGlow: 'rgba(99, 102, 241, 0.14)',
    desc: 'Executive Decisions, Commitments & Proactive Action Items',
    center: [210, 160],
  },
  temporal: {
    name: 'Temporal Cortex',
    icon: MessageSquare,
    color: '#06b6d4', // Cyan
    bgGlow: 'rgba(6, 182, 212, 0.14)',
    desc: 'Auditory Stream, Spoken Dialogues, Wearable Voice Transcripts',
    center: [250, 290],
  },
  parietal: {
    name: 'Parietal Cortex',
    icon: Cpu,
    color: '#a855f7', // Purple
    bgGlow: 'rgba(168, 85, 247, 0.14)',
    desc: 'Context Engineering, Associative Models & Plaud SDK Data',
    center: [390, 165],
  },
  occipital: {
    name: 'Occipital Cortex',
    icon: Eye,
    color: '#10b981', // Emerald
    bgGlow: 'rgba(16, 185, 129, 0.14)',
    desc: 'Visual Perceptions, Video Syntheses & Spatial Observations',
    center: [465, 270],
  },
};

export const BrainVisualizer: React.FC<BrainVisualizerProps> = ({
  memories,
  selectedMemoryId,
  onSelectMemory,
  activeLobeFilter,
  onFilterLobe,
}) => {
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [timeFilter, setTimeFilter] = useState<'all' | 'morning' | 'afternoon' | 'evening'>('all');

  // Chronologically sorted memories across the day
  const chronologicalMemories = useMemo(() => {
    return [...memories].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [memories]);

  // Filter memories by time of day if selected
  const timeFilteredMemories = useMemo(() => {
    if (timeFilter === 'all') return chronologicalMemories;
    return chronologicalMemories.filter((m) => {
      const hour = parseInt(m.displayTime.split(':')[0], 10);
      const isPM = m.displayTime.includes('PM');
      const hour24 = isPM && hour !== 12 ? hour + 12 : !isPM && hour === 12 ? 0 : hour;
      if (timeFilter === 'morning') return hour24 < 12;
      if (timeFilter === 'afternoon') return hour24 >= 12 && hour24 < 17;
      if (timeFilter === 'evening') return hour24 >= 17;
      return true;
    });
  }, [chronologicalMemories, timeFilter]);

  // Position nodes stably within their assigned lobe area
  const nodePositions = useMemo(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    const lobeCounters: Record<LobeType, number> = {
      frontal: 0,
      temporal: 0,
      parietal: 0,
      occipital: 0,
    };

    memories.forEach((mem) => {
      const lobe = mem.lobe || 'temporal';
      const base = LOBE_AREAS[lobe]?.center || [300, 210];
      const count = lobeCounters[lobe];
      lobeCounters[lobe] += 1;

      // Distribute nodes in pleasant arc within the lobe
      const angle = count * 1.55 + (lobe === 'frontal' ? 0.3 : lobe === 'parietal' ? 0.7 : 0.4);
      const radius = 22 + (count * 15);
      const x = Math.max(140, Math.min(525, Math.round(base[0] + Math.cos(angle) * radius)));
      const y = Math.max(110, Math.min(365, Math.round(base[1] + Math.sin(angle) * (radius * 0.72))));

      positions[mem.id] = { x, y };
    });

    return positions;
  }, [memories]);

  // Compute connections between nodes
  const connectionPaths = useMemo(() => {
    const paths: Array<{ id: string; from: [number, number]; to: [number, number]; active: boolean }> = [];
    
    memories.forEach((mem) => {
      const fromPos = nodePositions[mem.id];
      if (!fromPos) return;

      (mem.connections || []).forEach((targetId) => {
        const toPos = nodePositions[targetId];
        if (toPos && mem.id < targetId) {
          const isConnectedToSelected = selectedMemoryId === mem.id || selectedMemoryId === targetId;
          const isConnectedToHovered = hoveredNodeId === mem.id || hoveredNodeId === targetId;
          paths.push({
            id: `${mem.id}-${targetId}`,
            from: [fromPos.x, fromPos.y],
            to: [toPos.x, toPos.y],
            active: isConnectedToSelected || isConnectedToHovered,
          });
        }
      });
    });

    return paths;
  }, [memories, nodePositions, selectedMemoryId, hoveredNodeId]);

  return (
    <div className="relative rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl p-5 overflow-hidden flex flex-col">
      {/* Visualizer Top Bar with Zero-Pill Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-semibold text-slate-100">Cognitive Neural Cortex</h2>
            <span className="text-xs text-slate-400 font-mono tabular-nums">
              {memories.length} sessions recorded today · 4 lobes active
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Continuous wearable & mobile voice recordings mapped to cortical lobes
          </p>
        </div>

        {/* Lobe Filter Segmented Buttons (Interactive functional buttons) */}
        <div className="flex items-center gap-1 p-1 bg-slate-950/80 border border-slate-800/80 rounded-xl text-xs">
          <button
            onClick={() => onFilterLobe('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeLobeFilter === 'all'
                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            All Lobes
          </button>
          {(Object.keys(LOBE_AREAS) as LobeType[]).map((lobe) => {
            const area = LOBE_AREAS[lobe];
            const isActive = activeLobeFilter === lobe;
            const count = memories.filter((m) => m.lobe === lobe).length;
            return (
              <button
                key={lobe}
                onClick={() => onFilterLobe(lobe)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-medium transition-all capitalize ${
                  isActive
                    ? 'bg-slate-800 text-slate-100 border border-slate-700/60'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: area.color }}
                />
                <span>{lobe}</span>
                <span className="text-[10px] text-slate-500 font-mono tabular-nums">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main SVG Cortex Graphic Canvas */}
      <div className="relative w-full h-[360px] sm:h-[400px] flex items-center justify-center my-1 select-none">
        {/* Subtle Ambient Glow Behind Brain Lobes */}
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
          <div className="w-80 h-64 bg-indigo-500/10 rounded-full blur-3xl" />
          <div className="w-72 h-56 bg-cyan-500/10 rounded-full blur-3xl ml-20 mt-12" />
        </div>

        <svg
          viewBox="0 0 600 420"
          className="w-full h-full max-h-[400px] overflow-visible"
        >
          <defs>
            <radialGradient id="frontalGrad" cx="35%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.02" />
            </radialGradient>
            <radialGradient id="temporalGrad" cx="40%" cy="50%" r="60%">
              <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.02" />
            </radialGradient>
            <radialGradient id="parietalGrad" cx="60%" cy="35%" r="65%">
              <stop offset="0%" stopColor="#a855f7" stopOpacity="0.22" />
              <stop offset="100%" stopColor="#a855f7" stopOpacity="0.02" />
            </radialGradient>
            <radialGradient id="occipitalGrad" cx="70%" cy="60%" r="60%">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.02" />
            </radialGradient>
            
            {/* Filter for glowing nodes */}
            <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3.5" result="coloredBlur" />
              <feMerge>
                <feMergeNode in="coloredBlur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Holographic Cybernetic Brain Silhouette Contour */}
          <g className="opacity-70 transition-opacity duration-300">
            {/* Frontal Lobe Outline & Region */}
            <path
              d="M 170 120 C 140 160 130 220 160 270 C 180 290 220 300 250 280 C 270 230 270 170 240 130 C 210 110 185 110 170 120 Z"
              fill="url(#frontalGrad)"
              stroke="#6366f1"
              strokeWidth={activeLobeFilter === 'frontal' ? '2' : '1'}
              strokeDasharray="4 3"
              className="transition-all duration-300"
            />
            {/* Parietal Lobe Region */}
            <path
              d="M 240 130 C 280 100 360 95 420 130 C 450 160 450 210 410 240 C 360 240 280 230 240 170 Z"
              fill="url(#parietalGrad)"
              stroke="#a855f7"
              strokeWidth={activeLobeFilter === 'parietal' ? '2' : '1'}
              strokeDasharray="4 3"
              className="transition-all duration-300"
            />
            {/* Temporal Lobe Region */}
            <path
              d="M 160 270 C 180 320 230 350 290 340 C 330 320 340 270 310 240 C 260 230 200 240 160 270 Z"
              fill="url(#temporalGrad)"
              stroke="#06b6d4"
              strokeWidth={activeLobeFilter === 'temporal' ? '2' : '1'}
              strokeDasharray="4 3"
              className="transition-all duration-300"
            />
            {/* Occipital Lobe Region */}
            <path
              d="M 410 240 C 460 220 500 240 505 290 C 495 330 440 345 390 330 C 380 290 380 260 410 240 Z"
              fill="url(#occipitalGrad)"
              stroke="#10b981"
              strokeWidth={activeLobeFilter === 'occipital' ? '2' : '1'}
              strokeDasharray="4 3"
              className="transition-all duration-300"
            />

            {/* Brain Sulci & Gyri (Inner organic folds) */}
            <path
              d="M 200 160 Q 230 190 260 160 T 320 170 T 380 150"
              fill="none"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="1.5"
            />
            <path
              d="M 180 220 Q 230 230 270 210 T 350 220 T 430 200"
              fill="none"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="1.5"
            />
            <path
              d="M 230 280 Q 280 290 320 270 T 410 280"
              fill="none"
              stroke="rgba(255, 255, 255, 0.12)"
              strokeWidth="1.5"
            />
          </g>

          {/* Synaptic Connection Paths with Animated Current Flow */}
          <g>
            {connectionPaths.map((cp) => {
              const dx = cp.to[0] - cp.from[0];
              const dy = cp.to[1] - cp.from[1];
              const cx = (cp.from[0] + cp.to[0]) / 2 - dy * 0.18;
              const cy = (cp.from[1] + cp.to[1]) / 2 + dx * 0.18;
              const pathD = `M ${cp.from[0]} ${cp.from[1]} Q ${cx} ${cy} ${cp.to[0]} ${cp.to[1]}`;

              return (
                <g key={cp.id}>
                  <path
                    d={pathD}
                    fill="none"
                    stroke={cp.active ? '#818cf8' : 'rgba(148, 163, 184, 0.2)'}
                    strokeWidth={cp.active ? '2' : '1'}
                    strokeDasharray={cp.active ? 'none' : '3 3'}
                    className="transition-all duration-300"
                  />
                  {cp.active && (
                    <circle r="2.5" fill="#c7d2fe">
                      <animateMotion path={pathD} dur="2.4s" repeatCount="indefinite" />
                    </circle>
                  )}
                </g>
              );
            })}
          </g>

          {/* Interactive Memory Nodes */}
          {memories.map((mem) => {
            const pos = nodePositions[mem.id];
            if (!pos) return null;
            const isSelected = selectedMemoryId === mem.id;
            const isHovered = hoveredNodeId === mem.id;
            const lobeInfo = LOBE_AREAS[mem.lobe] || LOBE_AREAS.temporal;
            const isLobeFiltered = activeLobeFilter !== 'all' && mem.lobe !== activeLobeFilter;

            return (
              <g
                key={mem.id}
                transform={`translate(${pos.x}, ${pos.y})`}
                onClick={() => onSelectMemory(mem.id)}
                onMouseEnter={() => setHoveredNodeId(mem.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
                className={`cursor-pointer transition-all duration-300 ${
                  isLobeFiltered ? 'opacity-25' : 'opacity-100'
                }`}
              >
                {/* Outer Ring Pulse */}
                <circle
                  r={isSelected ? '22' : isHovered ? '18' : '13'}
                  fill={lobeInfo.bgGlow}
                  stroke={lobeInfo.color}
                  strokeWidth={isSelected ? '2' : '1'}
                  strokeDasharray={isSelected ? 'none' : '2 2'}
                  className={isSelected ? 'animate-pulse-slow' : ''}
                />

                {/* Inner Synaptic Core */}
                <circle
                  r={isSelected ? '7' : isHovered ? '6' : '4.5'}
                  fill={lobeInfo.color}
                  filter="url(#nodeGlow)"
                />

                {/* Direct Label */}
                <text
                  x={12}
                  y={4}
                  fill={isSelected ? '#ffffff' : '#cbd5e1'}
                  fontSize={isSelected ? '12' : '10'}
                  fontWeight={isSelected ? '600' : '500'}
                  className="pointer-events-none drop-shadow-md select-none font-medium"
                >
                  {mem.title.length > 22 ? mem.title.slice(0, 22) + '...' : mem.title}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hovered / Focused Synapse Tooltip */}
        {hoveredNodeId && (
          <div className="absolute bottom-3 left-4 right-4 pointer-events-none sm:left-auto sm:right-4 sm:w-80 p-3 bg-slate-950/95 border border-slate-700/80 rounded-xl shadow-2xl backdrop-blur-md text-xs">
            {(() => {
              const mem = memories.find((m) => m.id === hoveredNodeId);
              if (!mem) return null;
              const lobeInfo = LOBE_AREAS[mem.lobe];
              return (
                <div>
                  <div className="flex items-center justify-between text-slate-400 pb-1 border-b border-slate-800">
                    <span className="font-semibold text-slate-200 capitalize">
                      {lobeInfo.name}
                    </span>
                    <span className="font-mono tabular-nums">{mem.displayTime}</span>
                  </div>
                  <p className="font-medium text-slate-100 mt-1 line-clamp-1">{mem.title}</p>
                  <p className="text-slate-400 mt-0.5 line-clamp-2">{mem.summary}</p>
                  <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-800/80 text-[11px] text-slate-400">
                    <span>Device: {mem.sourceDevice}</span>
                    <span className="text-indigo-400 font-mono tabular-nums">
                      {mem.synapticWeight}% Synaptic Weight
                    </span>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Lobe Legend Footnote - Zero-Pill inline typography */}
      <div className="pt-3 pb-3 border-t border-slate-800/70 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-400">
        {(Object.keys(LOBE_AREAS) as LobeType[]).map((lobe) => {
          const area = LOBE_AREAS[lobe];
          return (
            <div key={lobe} className="flex items-start gap-2">
              <span
                className="w-2 h-2 rounded-full mt-1 shrink-0"
                style={{ backgroundColor: area.color }}
              />
              <div>
                <p className="font-medium text-slate-200 leading-none">{area.name}</p>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-tight line-clamp-1">
                  {area.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Horizontal Day-Long Conversation Timeline Ribbon */}
      <div className="pt-3 border-t border-slate-800/80">
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-2 text-xs text-slate-300 font-medium">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span>Today's Ambient Sessions Timeline ({timeFilteredMemories.length} sessions)</span>
          </div>

          {/* Time Phase Filter Segmented Buttons */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px]">
            {(['all', 'morning', 'afternoon', 'evening'] as const).map((phase) => (
              <button
                key={phase}
                onClick={() => setTimeFilter(phase)}
                className={`px-2 py-0.5 rounded capitalize font-medium transition-all ${
                  timeFilter === phase
                    ? 'bg-slate-800 text-slate-100 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {phase}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Horizontal Session Cards */}
        <div className="flex items-stretch gap-2.5 overflow-x-auto pb-1 pt-1 scrollbar-thin">
          {timeFilteredMemories.map((mem) => {
            const isSelected = selectedMemoryId === mem.id;
            const lobeInfo = LOBE_AREAS[mem.lobe] || LOBE_AREAS.temporal;

            return (
              <button
                key={mem.id}
                onClick={() => onSelectMemory(mem.id)}
                className={`shrink-0 w-64 p-2.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                  isSelected
                    ? 'bg-indigo-950/40 border-indigo-500/80 shadow-md shadow-indigo-950/30 ring-1 ring-indigo-500/30'
                    : 'bg-slate-950/70 border-slate-800/80 hover:border-slate-700 hover:bg-slate-950'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono pb-1 border-b border-slate-800/60">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: lobeInfo.color }}
                      />
                      <span className="font-semibold text-slate-300">{mem.displayTime}</span>
                    </span>
                    <span className="text-[10px] text-slate-500">{mem.sourceDevice}</span>
                  </div>

                  <p className="text-xs font-semibold text-slate-100 mt-1.5 line-clamp-1">
                    {mem.title}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                    {mem.summary}
                  </p>
                </div>

                <div className="mt-2.5 pt-1.5 border-t border-slate-800/60 flex items-center justify-between text-[10px] text-slate-400">
                  <span className="capitalize">{mem.lobe} Lobe</span>
                  <span className="text-indigo-400 font-mono tabular-nums font-semibold">
                    {mem.synapticWeight}% Synaptic
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
