import React, { useState, useEffect } from 'react';
import { MemoryNode, TaskCommitment, CortexStats, LobeType } from './types';
import { Header } from './components/Header';
import { BrainVisualizer } from './components/BrainVisualizer';
import { ProactiveAlertBanner } from './components/ProactiveAlertBanner';
import { VoiceSyncStudio } from './components/VoiceSyncStudio';
import { MemoryInspector } from './components/MemoryInspector';
import { TasksManager } from './components/TasksManager';
import { DigitalTwinChat } from './components/DigitalTwinChat';
import { FiveMinuteDebriefModal } from './components/FiveMinuteDebriefModal';
import { PromptBlueprintModal } from './components/PromptBlueprintModal';
import { Brain, CheckCircle2, UserCheck, Radio, Sparkles, Shield } from 'lucide-react';

export default function App() {
  const [memories, setMemories] = useState<MemoryNode[]>([]);
  const [selectedMemoryId, setSelectedMemoryId] = useState<string | null>(null);
  const [activeLobeFilter, setActiveLobeFilter] = useState<LobeType | 'all'>('all');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isDebriefOpen, setIsDebriefOpen] = useState<boolean>(false);
  const [isPromptModalOpen, setIsPromptModalOpen] = useState<boolean>(false);
  const [activeRightTab, setActiveRightTab] = useState<'inspector' | 'tasks' | 'twin'>('inspector');
  const [twinPrefillQuestion, setTwinPrefillQuestion] = useState<string>('');
  const [stats, setStats] = useState<CortexStats | null>(null);

  // Fetch initial memories from sovereign local server
  const fetchMemories = async () => {
    try {
      const res = await fetch('/api/memories');
      const data = await res.json();
      if (data.memories) {
        setMemories(data.memories);
        setStats(data);
        if (!selectedMemoryId && data.memories.length > 0) {
          setSelectedMemoryId(data.memories[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load memories:', err);
    }
  };

  useEffect(() => {
    fetchMemories();
  }, []);

  const handleMemoryCreated = (newMemory: MemoryNode) => {
    setMemories((prev) => [newMemory, ...prev]);
    setSelectedMemoryId(newMemory.id);
    setActiveRightTab('inspector');
    fetchMemories();
  };

  const handleToggleTask = async (taskId: string) => {
    // Optimistic update
    setMemories((prev) =>
      prev.map((m) => ({
        ...m,
        commitments: m.commitments.map((c) =>
          c.id === taskId ? { ...c, completed: !c.completed } : c
        ),
      }))
    );

    try {
      await fetch('/api/tasks/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId }),
      });
      fetchMemories();
    } catch (err) {
      console.error('Failed to toggle task:', err);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      await fetch(`/api/memories/${id}`, { method: 'DELETE' });
      setMemories((prev) => prev.filter((m) => m.id !== id));
      if (selectedMemoryId === id) {
        const remaining = memories.filter((m) => m.id !== id);
        setSelectedMemoryId(remaining.length > 0 ? remaining[0].id : null);
      }
      fetchMemories();
    } catch (err) {
      console.error('Failed to delete memory:', err);
    }
  };

  const handleAskTwinAboutThis = (memoryTitle: string) => {
    setTwinPrefillQuestion(`Recall our memory about "${memoryTitle}". What were our key learnings and how does it affect our upcoming decisions?`);
    setActiveRightTab('twin');
  };

  const selectedMemory = memories.find((m) => m.id === selectedMemoryId) || null;
  const allCommitments: TaskCommitment[] = memories.flatMap((m) => m.commitments);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <Header
        stats={stats}
        onOpenDebrief={() => setIsDebriefOpen(true)}
        onOpenPromptModal={() => setIsPromptModalOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-5 flex flex-col gap-5">
        {/* Proactive Context Notification Banner (e.g. 4:00 PM Judge Presentation) */}
        <ProactiveAlertBanner
          commitments={allCommitments}
          memories={memories}
          onSelectMemory={(id) => {
            setSelectedMemoryId(id);
            setActiveRightTab('inspector');
          }}
          onToggleTask={handleToggleTask}
        />

        {/* Core Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left Column (7 cols): The Brain Visualizer + Plaud Voice Sync Studio */}
          <div className="lg:col-span-7 flex flex-col gap-5">
            {/* Interactive Brain Digital Design Canvas */}
            <BrainVisualizer
              memories={memories}
              selectedMemoryId={selectedMemoryId}
              onSelectMemory={(id) => {
                setSelectedMemoryId(id);
                setActiveRightTab('inspector');
              }}
              activeLobeFilter={activeLobeFilter}
              onFilterLobe={setActiveLobeFilter}
            />

            {/* Plaud AI SDK & Voice Recording Studio */}
            <VoiceSyncStudio
              onMemoryCreated={handleMemoryCreated}
              isProcessing={isProcessing}
              setIsProcessing={setIsProcessing}
            />
          </div>

          {/* Right Column (5 cols): Inspector, Tasks & Digital Clone Console */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            {/* Right Pane Segmented Tabs */}
            <div className="flex items-center gap-1 p-1 bg-slate-900/80 border border-slate-800 rounded-xl text-xs">
              <button
                onClick={() => setActiveRightTab('inspector')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-medium transition-all ${
                  activeRightTab === 'inspector'
                    ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/60'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Brain className="w-3.5 h-3.5 text-indigo-400" />
                <span>Memory Dossier</span>
              </button>
              <button
                onClick={() => setActiveRightTab('tasks')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-medium transition-all ${
                  activeRightTab === 'tasks'
                    ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/60'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>Commitments ({allCommitments.filter((t) => !t.completed).length})</span>
              </button>
              <button
                onClick={() => setActiveRightTab('twin')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg font-medium transition-all ${
                  activeRightTab === 'twin'
                    ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/60'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
                <span>Digital Me</span>
              </button>
            </div>

            {/* Active Right Tab Content */}
            <div className="min-h-[520px]">
              {activeRightTab === 'inspector' && (
                <MemoryInspector
                  memory={selectedMemory}
                  onToggleTask={handleToggleTask}
                  onDeleteMemory={handleDeleteMemory}
                  onAskTwinAboutThis={handleAskTwinAboutThis}
                />
              )}

              {activeRightTab === 'tasks' && (
                <TasksManager
                  tasks={allCommitments}
                  memories={memories}
                  onToggleTask={handleToggleTask}
                  onSelectMemory={(id) => {
                    setSelectedMemoryId(id);
                    setActiveRightTab('inspector');
                  }}
                />
              )}

              {activeRightTab === 'twin' && (
                <DigitalTwinChat initialQuestion={twinPrefillQuestion} />
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer with Sovereign Status and Data Ownership Notice */}
      <footer className="mt-auto border-t border-slate-900 bg-slate-950/60 py-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-500" />
            <span>Sovereign Context Engine · Stored on personal server · Zero ad-broker egress</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-mono">portal.plaud.ai/guide/sdk-only compatible</span>
            <span>·</span>
            <span>Powered by Gemini 3.8 Flash</span>
          </div>
        </div>
      </footer>

      {/* 5-Minute Evening Debrief Modal */}
      <FiveMinuteDebriefModal
        isOpen={isDebriefOpen}
        onClose={() => setIsDebriefOpen(false)}
        memories={memories}
        onToggleTask={handleToggleTask}
      />

      {/* Google AI Studio Master Prompt & Spec Modal */}
      <PromptBlueprintModal
        isOpen={isPromptModalOpen}
        onClose={() => setIsPromptModalOpen(false)}
      />
    </div>
  );
}
