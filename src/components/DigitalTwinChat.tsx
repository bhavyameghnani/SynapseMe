import React, { useState } from 'react';
import { Send, Sparkles, Brain, Scale, RefreshCw, MessageSquare, ArrowRight, UserCheck } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'model';
  content: string;
}

interface DigitalTwinChatProps {
  initialQuestion?: string;
}

export const DigitalTwinChat: React.FC<DigitalTwinChatProps> = ({ initialQuestion }) => {
  const [activeTab, setActiveTab] = useState<'chat' | 'decision'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'model',
      content:
        'I am your Neural Digital Twin ("Digital Me"). Everything you’ve recorded today—from your morning sync on context engineering to your 4:00 PM commitment with Judge Elena Vance—is indexed in our shared cortex. What decision or context would you like us to explore?',
    },
  ]);
  const [inputMessage, setInputMessage] = useState(initialQuestion || '');
  const [isLoading, setIsLoading] = useState(false);

  // Decision Advisor state
  const [dilemmaInput, setDilemmaInput] = useState('');
  const [advisoryResult, setAdvisoryResult] = useState<string | null>(null);
  const [isEvaluatingDilemma, setIsEvaluatingDilemma] = useState(false);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || inputMessage;
    if (!text.trim() || isLoading) return;

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setInputMessage('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/twin/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: messages,
        }),
      });

      const data = await res.json();
      if (data.reply) {
        setMessages([...newMessages, { role: 'model', content: data.reply }]);
      } else {
        setMessages([
          ...newMessages,
          {
            role: 'model',
            content:
              'Our context engine has indexed your memories. Keep in mind your 4:00 PM presentation with Judge Elena Vance and your core belief: "What we see is what we think, what we think is what we become, and what we become is what we do."',
          },
        ]);
      }
    } catch (err) {
      console.error('Twin chat error:', err);
      setMessages([
        ...newMessages,
        {
          role: 'model',
          content: 'Apologies, synaptic latency detected. Please ensure server is running smoothly.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEvaluateDilemma = async () => {
    if (!dilemmaInput.trim() || isEvaluatingDilemma) return;
    setIsEvaluatingDilemma(true);

    try {
      const res = await fetch('/api/twin/decision-advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dilemma: dilemmaInput }),
      });

      const data = await res.json();
      setAdvisoryResult(data.advisory || 'Decision evaluated against current context.');
    } catch (err) {
      console.error('Decision advisor error:', err);
    } finally {
      setIsEvaluatingDilemma(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 backdrop-blur-xl p-5 flex flex-col h-full">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <UserCheck className="w-5 h-5 text-indigo-400" />
          <div>
            <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
              <span>Digital Me</span>
              <span className="text-xs text-indigo-400 font-mono">/ Neural Clone</span>
            </h3>
            <p className="text-xs text-slate-400">
              Cognitive twin reflecting your values, voice logs & decisions
            </p>
          </div>
        </div>

        {/* Mode Selector */}
        <div className="flex items-center gap-1 p-1 bg-slate-950/80 border border-slate-800/80 rounded-xl text-xs">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-all ${
              activeTab === 'chat'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Twin Dialogue</span>
          </button>
          <button
            onClick={() => setActiveTab('decision')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg font-medium transition-all ${
              activeTab === 'decision'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Decision Advisor</span>
          </button>
        </div>
      </div>

      {/* Mode A: Twin Dialogue */}
      {activeTab === 'chat' && (
        <div className="flex-1 flex flex-col justify-between overflow-hidden pt-3">
          {/* Messages Feed */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={`flex gap-2.5 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {m.role === 'model' && (
                  <div className="w-6 h-6 rounded-lg bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 flex items-center justify-center shrink-0 mt-0.5">
                    <Brain className="w-3.5 h-3.5" />
                  </div>
                )}
                <div
                  className={`p-3 rounded-xl max-w-[85%] leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-indigo-600 text-white rounded-tr-none'
                      : 'bg-slate-950/80 border border-slate-800 text-slate-200 rounded-tl-none font-sans'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex items-center gap-2 text-indigo-400 text-xs py-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Digital Twin recalling sovereign context...</span>
              </div>
            )}
          </div>

          {/* Quick context questions */}
          <div className="pt-3 pb-2 flex flex-wrap gap-1.5">
            {[
              'What did I commit to Judge Vance for 4:00 PM?',
              'What was the quotation about what we think and become?',
              'How can I become a better version of myself today?',
            ].map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleSendMessage(q)}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-950/70 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors text-left cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Input Box */}
          <div className="flex items-center gap-2 pt-1 border-t border-slate-800/80">
            <input
              type="text"
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Ask your Digital Twin anything about today..."
              className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 font-sans"
            />
            <button
              onClick={() => handleSendMessage()}
              disabled={isLoading || !inputMessage.trim()}
              className="p-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-all cursor-pointer"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Mode B: Decision Advisor */}
      {activeTab === 'decision' && (
        <div className="flex-1 flex flex-col overflow-y-auto space-y-4 pt-3 text-xs">
          <div className="bg-slate-950/60 border border-slate-800 p-3.5 rounded-xl">
            <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Scale className="w-4 h-4 text-indigo-400" />
              <span>Sovereign Decision Grounding</span>
            </h4>
            <p className="text-[11px] text-slate-400 mt-1">
              "So then next time when I take a decision, you know, I can go back." Test any
              impending choice against your recorded values and commitments.
            </p>

            <textarea
              value={dilemmaInput}
              onChange={(e) => setDilemmaInput(e.target.value)}
              placeholder="Describe your current dilemma or choice (e.g., 'Should I reschedule the 4:00 PM presentation to accommodate a quick client call, or stick firmly to my commitment with Judge Vance?')"
              rows={3}
              className="w-full mt-3 bg-slate-900 border border-slate-700/80 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 resize-none font-sans"
            />

            <div className="mt-2.5 flex justify-end">
              <button
                onClick={handleEvaluateDilemma}
                disabled={isEvaluatingDilemma || !dilemmaInput.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-medium transition-all cursor-pointer"
              >
                {isEvaluatingDilemma ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Sparkles className="w-3.5 h-3.5" />
                )}
                <span>Evaluate Against Neural Context</span>
              </button>
            </div>
          </div>

          {advisoryResult && (
            <div className="bg-indigo-950/30 border border-indigo-800/60 p-4 rounded-xl space-y-2 animate-fadeIn">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
                Cognitive Twin Counsel
              </span>
              <div className="text-slate-200 text-xs leading-relaxed whitespace-pre-wrap font-sans">
                {advisoryResult}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
