import React, { useState, useEffect } from 'react';
import { MemoryNode, TaskCommitment } from '../types';
import { Clock, CheckCircle2, Sparkles, X, Brain, Shield, ArrowRight, Play, Pause, Zap } from 'lucide-react';

interface FiveMinuteDebriefModalProps {
  isOpen: boolean;
  onClose: () => void;
  memories: MemoryNode[];
  onToggleTask: (taskId: string) => void;
}

export const FiveMinuteDebriefModal: React.FC<FiveMinuteDebriefModalProps> = ({
  isOpen,
  onClose,
  memories,
  onToggleTask,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState(300); // 5 minutes = 300 seconds
  const [isRunning, setIsRunning] = useState(false);
  const [activeStep, setActiveStep] = useState<number>(1);

  useEffect(() => {
    let interval: any = null;
    if (isRunning && secondsRemaining > 0) {
      interval = setInterval(() => {
        setSecondsRemaining((s) => s - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, secondsRemaining]);

  if (!isOpen) return null;

  const totalMinutes = memories.reduce((acc, m) => acc + m.durationMinutes, 0);
  const allTasks = memories.flatMap((m) => m.commitments);
  const completedTasks = allTasks.filter((t) => t.completed);

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border border-indigo-500/30 bg-slate-900 shadow-2xl flex flex-col">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-100">
                  5-Minute Sovereign Evening Debrief
                </h2>
                <span className="text-xs text-indigo-400 font-mono">
                  Curated by Cortex Agents
                </span>
              </div>
              <p className="text-xs text-slate-400">
                {memories.length} ambient captures · {totalMinutes} minutes synthesized · Private to your server
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Interactive 5-Minute Timer */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-200">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              <span className="tabular-nums font-semibold">{formatTimer(secondsRemaining)}</span>
              <button
                onClick={() => setIsRunning(!isRunning)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
                title={isRunning ? 'Pause Timer' : 'Start 5-Minute Timer'}
              >
                {isRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Step Navigation Tabs */}
        <div className="flex items-center px-6 pt-3 border-b border-slate-800/80 bg-slate-950/30 text-xs">
          {[
            { id: 1, title: '1. What I Remember (Synthesis)' },
            { id: 2, title: '2. Philosophy & Decisions' },
            { id: 3, title: '3. Commitments Checkoff' },
            { id: 4, title: '4. Tomorrow’s Trajectory' },
          ].map((step) => (
            <button
              key={step.id}
              onClick={() => setActiveStep(step.id)}
              className={`pb-2.5 px-3 font-medium transition-all border-b-2 cursor-pointer ${
                activeStep === step.id
                  ? 'border-indigo-500 text-indigo-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {step.title}
            </button>
          ))}
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs text-slate-300">
          {activeStep === 1 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-indigo-950/20 border border-indigo-800/40">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
                  Daily Cognitive Synthesis
                </span>
                <p className="text-sm text-slate-200 mt-2 leading-relaxed font-sans">
                  Today, your ambient capture centered around two major pillars: the philosophical
                  grounding of <strong>Context Engineering</strong> (moving beyond ephemeral meeting
                  transcripts into a living neural digital twin) and the high-stakes execution of your{' '}
                  <strong>4:00 PM presentation with Judge Elena Vance</strong>. Your conversations
                  validated that frictionless wearable listening prevents personal knowledge decay.
                </p>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-200 mb-2">
                  Key Memories Consolidated Today:
                </h4>
                <div className="space-y-2">
                  {memories.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-start justify-between gap-3"
                    >
                      <div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                          <span className="text-indigo-400 font-semibold capitalize">{m.lobe} Lobe</span>
                          <span>·</span>
                          <span>{m.displayTime}</span>
                          <span>·</span>
                          <span>{m.sourceDevice}</span>
                        </div>
                        <p className="font-semibold text-slate-100 mt-0.5">{m.title}</p>
                        <p className="text-slate-400 text-xs mt-1">{m.summary}</p>
                      </div>
                      <span className="text-indigo-400 font-mono text-xs tabular-nums shrink-0">
                        {m.synapticWeight}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeStep === 2 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800">
                <div className="flex items-center gap-2 text-indigo-400 font-medium">
                  <Zap className="w-4 h-4" />
                  <span>The Guiding Quotation</span>
                </div>
                <blockquote className="text-base text-slate-100 font-serif italic mt-2 border-l-2 border-indigo-500 pl-4 py-1">
                  "What we see is what we think, and what we think is what we become, and what we
                  become is what we do."
                </blockquote>
                <p className="text-slate-400 text-xs mt-2 leading-relaxed">
                  By deliberately engineering what we capture and review in 5 minutes every evening,
                  we consciously architect the neurons of tomorrow.
                </p>
              </div>

              <div>
                <h4 className="text-xs font-semibold text-slate-200 mb-2">
                  All Decisions & Strategic Alignments Recorded:
                </h4>
                <div className="space-y-2">
                  {memories.flatMap((m) => m.decisions).map((dec, idx) => (
                    <div
                      key={idx}
                      className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-slate-200"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{dec}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeStep === 3 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-400 pb-2 border-b border-slate-800">
                <span>
                  Commitments Completed: {completedTasks.length} / {allTasks.length}
                </span>
                <span className="font-mono text-emerald-400">
                  {Math.round((completedTasks.length / (allTasks.length || 1)) * 100)}% Execution
                </span>
              </div>

              <div className="space-y-2">
                {allTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => onToggleTask(task.id)}
                    className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all cursor-pointer ${
                      task.completed
                        ? 'bg-slate-950/40 border-slate-800 text-slate-500 line-through'
                        : 'bg-slate-950 border-slate-700 text-slate-100 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <CheckCircle2
                        className={`w-4 h-4 ${
                          task.completed ? 'text-emerald-400' : 'text-slate-600'
                        }`}
                      />
                      <div>
                        <p className="font-medium">{task.title}</p>
                        {task.timeReference && (
                          <p className="text-[11px] text-amber-400 font-mono mt-0.5">
                            {task.timeReference}
                          </p>
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                        task.priority === 'urgent'
                          ? 'bg-rose-950 text-rose-300'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {task.priority}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeStep === 4 && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-gradient-to-br from-indigo-950/40 to-slate-950 border border-indigo-800/40">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-300">
                  Neural Digital Twin Recommendation
                </span>
                <p className="text-sm text-slate-200 mt-2 leading-relaxed">
                  "Based on our conversations today, we have proven that the Plaud SDK integration
                  and 4-lobe cortex provides unprecedented cognitive clarity. Tomorrow, focus on
                  expanding proactive edge notifications so meeting reminders arrive with 0 phone
                  friction. We are building the sovereign clone to become our highest-agency self."
                </p>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex items-center gap-3">
                <Shield className="w-5 h-5 text-emerald-400 shrink-0" />
                <p className="text-xs text-slate-400">
                  All memory logs and transcripts remain 100% encrypted in your local context. Zero
                  third-party telemetry.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-950/80">
          <div className="text-xs text-slate-500 font-mono">
            Step {activeStep} of 4
          </div>
          <div className="flex items-center gap-2">
            {activeStep > 1 && (
              <button
                onClick={() => setActiveStep(activeStep - 1)}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium cursor-pointer"
              >
                Previous
              </button>
            )}
            {activeStep < 4 ? (
              <button
                onClick={() => setActiveStep(activeStep + 1)}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1 cursor-pointer"
              >
                <span>Next Step</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium cursor-pointer"
              >
                Seal & Archive Today's Cortex
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
