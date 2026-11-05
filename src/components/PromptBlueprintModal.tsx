import React, { useState } from 'react';
import { Copy, Check, FileText, X, Sparkles, Terminal, Code2 } from 'lucide-react';

interface PromptBlueprintModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MASTER_PROMPT_TEXT = `## SYSTEM SPECIFICATION & MASTER BUILD PROMPT: "SYNAPSE ME"
### The Autonomous Neural Digital Twin & Sovereign Context Engineering Platform

**Project Overview & Cognitive Thesis:**
Create a web application called **"Synapse Me"**—an ambient cognitive digital twin that continuously ingests daily voice streams, wearable recordings (e.g., Plaud NotePin, mobile microphones), and ambient conversations to build a sovereign, evolving digital clone of the user.

Rooted in the philosophical foundation:
*"What we see is what we think, what we think is what we become, and what we become is what we do."*

Rather than traditional meeting summarizers or flat notes, this system maps personal context directly into an interactive 4-Lobe Digital Brain Cortex, extracts proactive task intelligence, triggers hands-free context alerts (e.g., reminding the user of a critical 4:00 PM presentation with a judge without requiring phone interaction), and provides a curated 5-minute evening debrief.

---

### Core Functional Pillars:

1. **Sovereign Context Engineering Engine:**
   - Ingests raw audio transcripts from wearable hardware (Plaud AI SDK at portal.plaud.ai/guide/sdk-only), phone voice memos, and browser microphone streams.
   - All memory graphs, transcripts, and embeddings reside in the user's private sovereign cloud/server perimeter (zero data egress to advertising brokers).

2. **Cortical Brain Design Visualizer (4 Lobes):**
   - **Frontal Lobe:** Executive function, decisions, commitments, high-priority tasks (e.g., 4:00 PM Judge presentation).
   - **Temporal Lobe:** Auditory speech, conversations with friends, narrative dialogues, verbatim voice memory.
   - **Parietal Lobe:** Spatial & conceptual context, associative models, Plaud SDK streaming architectures.
   - **Occipital Lobe:** Visual context, video study syntheses, sensory perception observations.
   - Interactive SVG/Canvas neural topology with pulsing synaptic paths, dynamic node weights (0-100%), and interactive filtering.

3. **Automated Task Management & Proactive Reminders:**
   - NLL multi-agent pipeline extracts explicit commitments, deadlines, and target stakeholders.
   - Real-time proactive alert banner that monitors upcoming time obligations (e.g. "Presentation with Judge Elena Vance at 4:00 PM") with Web Audio acoustic cues.

4. **"Digital Me" Cognitive Clone Console:**
   - A conversational agent acting as the externalized digital twin.
   - Grounded in the user's stored sovereign memory cortex.
   - Includes a "Decision Advisor" mode: evaluates upcoming dilemmas or choices against historical decisions and the core guiding philosophy.

5. **The 5-Minute Evening Debrief Ritual:**
   - A dedicated 5-minute curated debrief mode.
   - Answers: "What happened today? What will I remember? What were the key decisions?"
   - Instant commitment check-off and neural trajectory alignment for tomorrow.

---

### Technical Architecture & Stack:
- **Frontend:** React 19, TypeScript, Tailwind CSS v4, Motion, Lucide icons.
- **Backend / API:** Full-stack Express server with Vite middleware.
- **AI Engine:** @google/genai SDK (model: 'gemini-3.8-flash') for real-time context extraction, JSON schema classification, and digital clone dialogue.
- **Audio & Ingestion:** Web Audio API analyzer with dynamic frequency waveforms + Plaud AI SDK webhook/file pipeline.
- **Data Sovereignty:** In-memory + persistent local storage with 100% user ownership.`;

export const PromptBlueprintModal: React.FC<PromptBlueprintModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(MASTER_PROMPT_TEXT);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border border-indigo-500/40 bg-slate-900 shadow-2xl flex flex-col">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/70">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-slate-100">
                  Google AI Studio Master Build Prompt & Pitch Spec
                </h3>
                <span className="text-xs text-indigo-400 font-mono">Ready to Export</span>
              </div>
              <p className="text-xs text-slate-400">
                Crafted specification answering your exact brief to build/pitch this Digital Twin
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied to Clipboard!' : 'Copy Master Prompt'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Box */}
        <div className="flex-1 overflow-y-auto p-6 font-mono text-xs leading-relaxed text-slate-300 bg-slate-950/50 space-y-4 select-text">
          <div className="p-3 bg-indigo-950/30 border border-indigo-800/40 rounded-xl text-indigo-300 font-sans text-xs">
            <p>
              💡 <strong>How to use this:</strong> You can copy this comprehensive prompt to pitch to
              stakeholders, or feed it into Google AI Studio / Gemini to generate or extend your
              digital twin modules.
            </p>
          </div>

          <pre className="whitespace-pre-wrap bg-slate-950 p-4 rounded-xl border border-slate-800 text-slate-200">
            {MASTER_PROMPT_TEXT}
          </pre>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 border-t border-slate-800 bg-slate-950/80 text-xs text-slate-400">
          <span>Standardized against Plaud SDK & Google Gemini API guidelines</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
