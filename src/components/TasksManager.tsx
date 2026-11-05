import React, { useState } from 'react';
import { TaskCommitment, MemoryNode } from '../types';
import { CheckCircle2, Clock, AlertCircle, Sparkles, Filter, Plus, ArrowUpRight } from 'lucide-react';

interface TasksManagerProps {
  tasks: TaskCommitment[];
  memories: MemoryNode[];
  onToggleTask: (taskId: string) => void;
  onSelectMemory: (memoryId: string) => void;
}

export const TasksManager: React.FC<TasksManagerProps> = ({
  tasks,
  memories,
  onToggleTask,
  onSelectMemory,
}) => {
  const [filter, setFilter] = useState<'all' | 'pending' | 'urgent' | 'completed'>('pending');

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'pending') return !t.completed;
    if (filter === 'completed') return t.completed;
    if (filter === 'urgent') return (t.priority === 'urgent' || t.dueTime) && !t.completed;
    return true;
  });

  const getParentMemory = (taskId: string) => {
    return memories.find((m) => m.commitments.some((c) => c.id === taskId));
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl p-5 flex flex-col h-full">
      {/* Task Manager Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-100">
              Automated Task & Commitment Cortex
            </h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Auto-extracted by NLL agents from ambient conversations & wearable streams
          </p>
        </div>

        {/* Filter Buttons */}
        <div className="flex items-center gap-1 p-1 bg-slate-950/80 border border-slate-800/80 rounded-xl text-xs">
          {(['pending', 'urgent', 'completed', 'all'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFilter(tab)}
              className={`px-2.5 py-1 rounded-lg capitalize font-medium transition-all ${
                filter === tab
                  ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/60'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto space-y-2 py-3 pr-1 text-xs">
        {filteredTasks.length === 0 ? (
          <div className="py-12 text-center text-slate-500">
            <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-slate-700" />
            <p className="font-medium text-slate-400">No {filter} commitments found</p>
            <p className="text-[11px] mt-0.5">
              Speak or record a new voice note to auto-extract action items.
            </p>
          </div>
        ) : (
          filteredTasks.map((task) => {
            const parent = getParentMemory(task.id);
            return (
              <div
                key={task.id}
                className={`p-3 rounded-xl border transition-all ${
                  task.completed
                    ? 'bg-slate-950/40 border-slate-800/60 opacity-60'
                    : task.priority === 'urgent'
                    ? 'bg-amber-950/20 border-amber-600/40 hover:border-amber-500'
                    : 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <button
                      onClick={() => onToggleTask(task.id)}
                      className="mt-0.5 text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
                    >
                      <CheckCircle2
                        className={`w-4 h-4 ${
                          task.completed ? 'text-emerald-400 fill-emerald-950' : 'text-slate-600'
                        }`}
                      />
                    </button>
                    <div>
                      <p
                        className={`font-medium ${
                          task.completed ? 'line-through text-slate-500' : 'text-slate-100'
                        }`}
                      >
                        {task.title}
                      </p>
                      <p className="text-slate-400 text-[11px] mt-0.5">{task.context}</p>

                      <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-slate-400 font-mono">
                        {task.timeReference && (
                          <span className="flex items-center gap-1 text-amber-400">
                            <Clock className="w-3 h-3" />
                            {task.timeReference}
                          </span>
                        )}
                        {task.targetPerson && (
                          <>
                            <span>·</span>
                            <span>With: {task.targetPerson}</span>
                          </>
                        )}
                        {parent && (
                          <>
                            <span>·</span>
                            <button
                              onClick={() => onSelectMemory(parent.id)}
                              className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2 flex items-center gap-0.5 cursor-pointer"
                            >
                              <span>{parent.title.slice(0, 18)}...</span>
                              <ArrowUpRight className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded font-semibold ${
                      task.priority === 'urgent'
                        ? 'bg-rose-950 text-rose-300 border border-rose-800/80'
                        : task.priority === 'high'
                        ? 'bg-amber-950 text-amber-300 border border-amber-800/80'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {task.priority}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
