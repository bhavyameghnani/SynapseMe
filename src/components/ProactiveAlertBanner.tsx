import React, { useState } from 'react';
import { TaskCommitment, MemoryNode } from '../types';
import { Bell, Clock, ArrowRight, X, Sparkles, CheckCircle2, Volume2 } from 'lucide-react';
import { playAlertChime } from '../utils/audio';

interface ProactiveAlertBannerProps {
  commitments: TaskCommitment[];
  memories: MemoryNode[];
  onSelectMemory: (id: string) => void;
  onToggleTask: (taskId: string) => void;
}

export const ProactiveAlertBanner: React.FC<ProactiveAlertBannerProps> = ({
  commitments,
  memories,
  onSelectMemory,
  onToggleTask,
}) => {
  const [dismissed, setDismissed] = useState(false);

  // Find urgent or time-sensitive task (like the 4:00 PM Judge presentation)
  const urgentTask = commitments.find((c) => c.priority === 'urgent' && !c.completed) ||
    commitments.find((c) => c.dueTime && !c.completed);

  // Find parent memory
  const parentMemory = urgentTask
    ? memories.find((m) => m.commitments.some((c) => c.id === urgentTask.id))
    : null;

  const handleSimulateAlert = () => {
    setDismissed(false);
    playAlertChime();
  };

  if (!urgentTask || dismissed) {
    return (
      <div className="flex items-center justify-between px-4 py-2 bg-slate-900/50 border border-slate-800/80 rounded-xl text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Ambient Neural Proactor: Active & listening on wearable channel</span>
        </div>
        <button
          onClick={handleSimulateAlert}
          className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 transition-colors font-medium cursor-pointer"
        >
          <Volume2 className="w-3.5 h-3.5" />
          <span>Test 4:00 PM Proactive Trigger</span>
        </button>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-950/40 via-slate-900/90 to-indigo-950/40 p-3.5 shadow-lg shadow-amber-950/20 backdrop-blur-md">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
            <Bell className="w-4 h-4 animate-bounce" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                Proactive Cortex Notification
              </span>
              <span className="text-xs text-slate-400">·</span>
              <span className="text-xs text-slate-300 flex items-center gap-1 font-mono">
                <Clock className="w-3 h-3 text-amber-400" />
                {urgentTask.timeReference || urgentTask.dueTime || 'Upcoming'}
              </span>
            </div>
            <p className="text-sm font-medium text-slate-100 mt-0.5">
              "{urgentTask.title}"
            </p>
            <p className="text-xs text-slate-400 line-clamp-1">
              Context: {urgentTask.context} {urgentTask.targetPerson ? `with ${urgentTask.targetPerson}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {parentMemory && (
            <button
              onClick={() => onSelectMemory(parentMemory.id)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700/80 transition-all cursor-pointer"
            >
              <span>Recall Context</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={() => onToggleTask(urgentTask.id)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 text-xs font-medium border border-amber-500/40 transition-all cursor-pointer"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Mark Attended</span>
          </button>

          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            title="Snooze / Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
