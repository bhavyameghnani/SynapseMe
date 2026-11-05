import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '25mb' }));

// Shared server-side Gemini client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

export interface TaskCommitment {
  id: string;
  title: string;
  dueTime?: string;
  timeReference?: string;
  context: string;
  targetPerson?: string;
  priority: 'urgent' | 'high' | 'medium' | 'low';
  completed: boolean;
  notified: boolean;
  createdAt: string;
}

export interface MemoryNode {
  id: string;
  timestamp: string;
  displayTime: string;
  title: string;
  category: 'episodic' | 'semantic' | 'working' | 'procedural';
  lobe: 'frontal' | 'temporal' | 'parietal' | 'occipital';
  sourceDevice: 'Plaud NotePin' | 'Mobile Voice' | 'Cloud Stream' | 'Ambient Mic' | 'Direct Input';
  durationMinutes: number;
  rawTranscript: string;
  summary: string;
  keyPoints: string[];
  coreInsight: string;
  decisions: string[];
  commitments: TaskCommitment[];
  synapticWeight: number; // 1 - 100
  connections: string[]; // Connected memory IDs
  emotionalTone: 'focused' | 'reflective' | 'energized' | 'strategic' | 'cautious';
}

// Initial seeded memories representing a realistic day of context engineering & ambient capture
let memoriesStore: MemoryNode[] = [
  {
    id: 'mem-1',
    timestamp: '2026-09-29T09:15:00Z',
    displayTime: '09:15 AM',
    title: 'Context Engineering & The Neural Digital Clone Hypothesis',
    category: 'semantic',
    lobe: 'temporal',
    sourceDevice: 'Plaud NotePin',
    durationMinutes: 28,
    rawTranscript: `Discussed the fundamental shift from simple prompt wrappers to deep context engineering. We talked about how the ancient quote resonates: "What we see is what we think, what we think is what we become, and what we become is what we do." If you capture your actual ambient speech, video watches, and spontaneous discussions on personal cloud hardware, you don't just get meeting minutes—you build an evolving cognitive twin. Need to build a brain design interface that maps speech directly into cortical lobes rather than dry bullet lists.`,
    summary: 'Explored the philosophical and architectural foundation of ambient context capture. Posited that continuous wearable audio builds a living cognitive clone rather than static meeting notes.',
    keyPoints: [
      'Core philosophy: "What we see is what we think, what we think is what we become, what we become is what we do."',
      'Context engineering over superficial prompt engineering.',
      'Wearable hardware (Plaud/Cloud) should keep all data sovereign in user-owned private space.',
      'Need an intuitive 5-minute end-of-day memory debrief.'
    ],
    coreInsight: 'Continuous ambient context transforms fleeting moments into sovereign neural assets.',
    decisions: [
      'Design the interface around cortical brain lobes (Frontal, Temporal, Parietal, Occipital) rather than typical SaaS tables.',
      'Enforce zero data egress to 3rd party ad networks—all cognitive memory resides in personal server.'
    ],
    commitments: [
      {
        id: 'task-1-1',
        title: 'Draft architecture whitepaper on Sovereign Context Engineering',
        dueTime: '17:00',
        timeReference: 'End of day today',
        context: 'Discussed with cognitive research team during morning sync',
        targetPerson: 'Engineering Core',
        priority: 'high',
        completed: false,
        notified: false,
        createdAt: '2026-09-29T09:45:00Z'
      }
    ],
    synapticWeight: 94,
    connections: ['mem-2', 'mem-3'],
    emotionalTone: 'energized'
  },
  {
    id: 'mem-2',
    timestamp: '2026-09-29T11:40:00Z',
    displayTime: '11:40 AM',
    title: 'Judge & Jury Briefing: 4:00 PM Presentation Commitment',
    category: 'working',
    lobe: 'frontal',
    sourceDevice: 'Mobile Voice',
    durationMinutes: 14,
    rawTranscript: `Spoke with Judge Elena Vance regarding the demo showcase. She emphasized: "Make sure you demonstrate the real-time device sync and how the system proactively reminds you before you forget. Be ready with the live prototype prompt at 4:00 PM sharp in Room A or the main stage." I agreed and committed to presenting at 4:00 PM. I need to make sure the app automatically triggers a high-priority alert without me having to touch my mobile phone.`,
    summary: 'Crucial confirmation call with Judge Elena Vance. Fixed the presentation time for 4:00 PM sharp with explicit focus on real-time device sync and proactive context alerts.',
    keyPoints: [
      'Critical presentation locked for 4:00 PM sharp.',
      'Judge highlighted the necessity of proactive notifications that anticipate user needs without phone fiddling.',
      'Key showcase requirement: Plaud SDK voice ingestion + neural lobe visualizer.'
    ],
    coreInsight: 'Proactive intelligence is only useful if it relieves cognitive load before friction occurs.',
    decisions: [
      'Prioritize automated alert trigger at 4:00 PM in the system cortex.',
      'Showcase the prompt engineering foundation that generated the entire neural twin.'
    ],
    commitments: [
      {
        id: 'task-2-1',
        title: 'Present Digital Twin prototype to Judge Elena Vance',
        dueTime: '16:00',
        timeReference: '4:00 PM today',
        context: 'Direct commitment made during call with Judge Vance',
        targetPerson: 'Judge Elena Vance',
        priority: 'urgent',
        completed: false,
        notified: true,
        createdAt: '2026-09-29T11:55:00Z'
      },
      {
        id: 'task-2-2',
        title: 'Verify Plaud AI SDK webhook integration schema',
        dueTime: '15:30',
        timeReference: 'Before 4:00 PM presentation',
        context: 'Ensure seamless voice-to-cortex stream demo',
        targetPerson: 'Self',
        priority: 'high',
        completed: true,
        notified: true,
        createdAt: '2026-09-29T11:56:00Z'
      }
    ],
    synapticWeight: 98,
    connections: ['mem-1'],
    emotionalTone: 'strategic'
  },
  {
    id: 'mem-3',
    timestamp: '2026-09-29T13:20:00Z',
    displayTime: '01:20 PM',
    title: 'Research Breakdown: Plaud AI SDK & Ambient Audio Pipelines',
    category: 'procedural',
    lobe: 'parietal',
    sourceDevice: 'Cloud Stream',
    durationMinutes: 19,
    rawTranscript: `Reviewed portal.plaud.ai/guide/sdk-only specs. Wearable audio stream sends chunked PCM or Opus data with voice activity detection (VAD). Instead of standard transcription APIs that dump flat text, our NLL agents must perform multi-stage extraction: 1) Episodic memory (what was said, who said it), 2) Working memory (immediate commitments and deadlines), 3) Semantic memory (conceptual connections and worldview updates). Also noted: audio waveforms must visually sync with cortical activation.`,
    summary: 'Technical evaluation of Plaud audio SDK architecture. Mapped wearable hardware streaming requirements into a tri-partite neural memory parsing engine.',
    keyPoints: [
      'Plaud SDK provides device-level VAD and clean audio chunking.',
      'Multi-stage agentic pipeline separates ephemeral speech from durable neural memory.',
      'Cortical visualizer acts as an intuitive cognitive dashboard.'
    ],
    coreInsight: 'Raw audio is noise; structured cortical synthesis transforms noise into an augmented self.',
    decisions: [
      'Support both live browser microphone stream and Plaud webhook/file payloads.',
      'Include a quick 5-minute end-of-day digest modal for instant evening recall.'
    ],
    commitments: [],
    synapticWeight: 87,
    connections: ['mem-1', 'mem-4'],
    emotionalTone: 'focused'
  },
  {
    id: 'mem-4',
    timestamp: '2026-09-29T14:45:00Z',
    displayTime: '02:45 PM',
    title: 'Coffee Dialogue with Marcus: Habit Loops & Second Brain Drift',
    category: 'episodic',
    lobe: 'occipital',
    sourceDevice: 'Ambient Mic',
    durationMinutes: 22,
    rawTranscript: `Marcus pointed out that most "Second Brain" apps fail because users have to manually type and organize tags. "If you make me spend 20 minutes categorizing Notion cards after a exhausting day, I will abandon it in a week. The system has to listen, curate, and hand me the 5-minute debrief while I'm walking to my car." We agreed that the Digital Clone must be effortlessly self-organizing.`,
    summary: 'Informal dialogue highlighting the fatal flaw of manual note-taking systems. Reaffirmed the imperative of zero-friction ambient capture and 5-minute curated debriefs.',
    keyPoints: [
      'Manual tagging causes 90% of personal knowledge bases to decay.',
      'Wearable ambient capture removes recording friction completely.',
      'The 5-minute review is the golden ritual: high reward, zero clerical overhead.'
    ],
    coreInsight: 'Automation of cognitive organization is the only defense against personal knowledge decay.',
    decisions: [
      'Keep the daily review strictly under 5 minutes with one-click approval of extracted tasks.'
    ],
    commitments: [
      {
        id: 'task-4-1',
        title: 'Send Marcus the prompt blueprint for Google AI Studio build',
        dueTime: '18:30',
        timeReference: 'This evening after presentation',
        context: 'Marcus asked for the master prompt template during coffee',
        targetPerson: 'Marcus Vance',
        priority: 'medium',
        completed: false,
        notified: false,
        createdAt: '2026-09-29T14:50:00Z'
      }
    ],
    synapticWeight: 89,
    connections: ['mem-1', 'mem-3'],
    emotionalTone: 'reflective'
  },
  {
    id: 'mem-5',
    timestamp: '2026-09-29T07:45:00Z',
    displayTime: '07:45 AM',
    title: 'Morning Walk Audio Memo: Neural Priming & Intention Setting',
    category: 'semantic',
    lobe: 'occipital',
    sourceDevice: 'Plaud NotePin',
    durationMinutes: 18,
    rawTranscript: `Recorded while walking through the park before work. Meditating on the idea of cognitive priming: whatever context we allow to enter our senses first thing in the morning sets the attractor states for our decisions all day. If we read panic news, our neurons calculate threat; if we review our creative thesis on cognitive twins, our brain looks for generative connections. Need to ensure our wearable recorder captures this morning clarity so the evening review can contrast morning intention with actual afternoon execution. Remember: pick up the HDMI-C presentation adapter from the tech kiosk before 10 AM.`,
    summary: 'Morning walk audio reflection establishing the day’s cognitive priming thesis. Observed how early morning sensory input shapes subsequent neural attractor states.',
    keyPoints: [
      'Early sensory priming dictates subsequent cognitive attractor states.',
      'Sovereign wearable should bridge morning intention with evening execution review.',
      'Logistics check: Pick up display adapter for 4:00 PM presentation.'
    ],
    coreInsight: 'Context is not passive memory; it is active behavioral trajectory.',
    decisions: [
      'Incorporate morning intention vs. evening execution comparison into the 5-minute debrief ritual.'
    ],
    commitments: [
      {
        id: 'task-5-1',
        title: 'Pick up HDMI-C presentation adapter at tech kiosk',
        dueTime: '10:00',
        timeReference: 'Before 10:00 AM',
        context: 'Required for 4:00 PM Judge presentation in Room A',
        targetPerson: 'Self',
        priority: 'high',
        completed: true,
        notified: true,
        createdAt: '2026-09-29T07:50:00Z'
      }
    ],
    synapticWeight: 91,
    connections: ['mem-1', 'mem-2'],
    emotionalTone: 'reflective'
  },
  {
    id: 'mem-6',
    timestamp: '2026-09-29T10:15:00Z',
    displayTime: '10:15 AM',
    title: 'Horizon Capital Discussion: Sovereign Context Moats vs LLMs',
    category: 'working',
    lobe: 'frontal',
    sourceDevice: 'Mobile Voice',
    durationMinutes: 35,
    rawTranscript: `Pitch dialogue with Rajiv from Horizon Capital. Rajiv challenged: "Every startup has a chatbot or transcript recorder. Why will you win?" I explained that raw foundation models are commoditized utilities; the defensible moat is the user's sovereign context engineering graph accumulated over months and years of ambient capture. Rajiv was intrigued: "If your digital twin truly knows me, can it stop me from making contradictory decisions or violating my own principles?" I answered yes—the twin acts as a cognitive mirror. Promised to send Rajiv our sovereign security architecture doc by 6:00 PM.`,
    summary: 'Strategic venture discussion with Horizon Capital. Articulated the competitive moat of sovereign ambient context graphs over generic chatbot wrappers.',
    keyPoints: [
      'Foundation models are commodities; accumulated personal context graphs are the true defensible asset.',
      'Investors look for active cognitive feedback (e.g. contradiction warnings) rather than static transcription archives.',
      'Data sovereignty is our prime selling point against big tech aggregators.'
    ],
    coreInsight: 'A model is only as smart as its context; a person is only as wise as their externalized self-awareness.',
    decisions: [
      'Highlight "Contradiction Detection & Decision Advisory" in our pitch narrative.',
      'Keep investor diligence materials strictly focused on private server data sovereignty.'
    ],
    commitments: [
      {
        id: 'task-6-1',
        title: 'Send Sovereign Security Architecture doc to Rajiv',
        dueTime: '18:00',
        timeReference: '6:00 PM today',
        context: 'Follow-up requested by Rajiv during venture sync',
        targetPerson: 'Rajiv (Horizon Capital)',
        priority: 'high',
        completed: false,
        notified: false,
        createdAt: '2026-09-29T10:50:00Z'
      }
    ],
    synapticWeight: 96,
    connections: ['mem-1', 'mem-2'],
    emotionalTone: 'strategic'
  },
  {
    id: 'mem-7',
    timestamp: '2026-09-29T12:30:00Z',
    displayTime: '12:30 PM',
    title: 'Lunch with Dr. Maya Patel: Hippocampal Replay & Brain Lobes',
    category: 'semantic',
    lobe: 'temporal',
    sourceDevice: 'Ambient Mic',
    durationMinutes: 40,
    rawTranscript: `Sitting at the campus terrace with Dr. Maya Patel (neurobiology). She was fascinated by our 4-lobe design (Frontal, Temporal, Parietal, Occipital). She explained: "During slow-wave sleep, the hippocampus replays the day’s auditory and visual events to compress them into cortical synapses. Your 5-minute debrief feature is literally an artificial waking hippocampal replay." She advised that we weight emotional valence and verbal decisions higher in the synaptic calculation. I promised to email Maya our research notes on cognitive twins tonight.`,
    summary: 'Lunch consultation with neuroscientist Dr. Maya Patel. Validated that our 5-minute debrief mimics biological hippocampal memory consolidation during sleep.',
    keyPoints: [
      'The 5-minute daily debrief biologically mirrors slow-wave hippocampal replay.',
      'Cortical lobe separation (Frontal, Temporal, Parietal, Occipital) matches human cognitive architecture.',
      'Synaptic weighting formula should account for emotional tone and explicit commitments.'
    ],
    coreInsight: 'Our digital twin architecture is not an artificial construct; it is a bio-mimetic cognitive prosthesis.',
    decisions: [
      'Refine synaptic weight scoring algorithm to factor in verbal commitment urgency.',
      'Cite hippocampal replay neuroscience in our pitch deck.'
    ],
    commitments: [
      {
        id: 'task-7-1',
        title: 'Email hippocampal replay synthesis notes to Dr. Maya Patel',
        dueTime: '20:00',
        timeReference: 'Tonight by 8:00 PM',
        context: 'Follow up on neurobiology discussion during terrace lunch',
        targetPerson: 'Dr. Maya Patel',
        priority: 'medium',
        completed: false,
        notified: false,
        createdAt: '2026-09-29T13:10:00Z'
      }
    ],
    synapticWeight: 93,
    connections: ['mem-1', 'mem-3', 'mem-4'],
    emotionalTone: 'energized'
  },
  {
    id: 'mem-8',
    timestamp: '2026-09-29T15:20:00Z',
    displayTime: '03:20 PM',
    title: 'Security Architecture Review: Zero-Leak Edge Storage Node',
    category: 'procedural',
    lobe: 'parietal',
    sourceDevice: 'Cloud Stream',
    durationMinutes: 25,
    rawTranscript: `Deep dive with lead systems engineer Liam on on-premise memory nodes. Analyzed: if user voice is continuously recorded via Plaud NotePin or mobile, we must ensure zero leak to public clouds. Liam confirmed: audio is chunked into 16kHz PCM on the device, streamed over local TLS to the user's sovereign container, transcribed, and immediately encrypted with AES-256-GCM. We verified the webhook ingestion endpoint at portal.plaud.ai/guide/sdk-only runs with sub-100ms latency. Decision: Liam will push the biometric key sealing PR by 5:30 PM.`,
    summary: 'Technical review of local security and privacy boundaries for continuous voice streaming. Confirmed end-to-end encryption and sub-100ms Plaud SDK webhook throughput.',
    keyPoints: [
      'Raw wearable audio is chunked, streamed over TLS, and encrypted with user private keys.',
      'Zero unencrypted voice logs or telemetry ever hit external ad networks.',
      'Sub-100ms latency verified on Plaud SDK ingestion pipeline.'
    ],
    coreInsight: 'True cognitive cloning cannot exist without uncompromised data sovereignty.',
    decisions: [
      'Mandate zero third-party cloud data egress for all voice embeddings.',
      'Adopt AES-256-GCM hardware key sealing for all sovereign memory nodes.'
    ],
    commitments: [
      {
        id: 'task-8-1',
        title: 'Review Liam’s biometric key sealing pull request',
        dueTime: '17:30',
        timeReference: '5:30 PM today',
        context: 'Required for sovereign privacy audit before launch',
        targetPerson: 'Liam (Systems Lead)',
        priority: 'high',
        completed: false,
        notified: false,
        createdAt: '2026-09-29T15:45:00Z'
      }
    ],
    synapticWeight: 95,
    connections: ['mem-3', 'mem-6'],
    emotionalTone: 'focused'
  },
  {
    id: 'mem-9',
    timestamp: '2026-09-29T16:45:00Z',
    displayTime: '04:45 PM',
    title: 'Judge Elena Vance Showcase Debrief: 4:00 PM Demo Reaction',
    category: 'working',
    lobe: 'frontal',
    sourceDevice: 'Plaud NotePin',
    durationMinutes: 20,
    rawTranscript: `Hallway debrief recorded right after the 4:00 PM presentation showcase! Judge Elena Vance and the panel were thoroughly impressed. She remarked: "When your system automatically triggered the 4:00 PM presentation reminder with context about our earlier phone call without you touching your mobile phone, that was the magic moment. It felt like an authentic digital twin anticipating your obligations." Judge Vance asked if we could provide a pilot beta for 15 senior partners on Monday morning. I committed to sending her the pilot rollout schedule tomorrow morning at 09:30 AM.`,
    summary: 'Triumphant post-presentation debrief following the 4:00 PM showcase. Judge Elena Vance praised the hands-free proactive reminder and requested an executive pilot deployment.',
    keyPoints: [
      'The 4:00 PM presentation with Judge Elena Vance succeeded with enthusiastic reception.',
      'Hands-free proactive context notification was hailed as the breakthrough feature.',
      'Executive pilot beta requested for 15 partners starting next Monday.'
    ],
    coreInsight: 'When technology anticipates our promises before we scramble, anxiety is replaced with effortless presence.',
    decisions: [
      'Prepare 15-seat executive pilot onboarding docket for Judge Vance.',
      'Lock in the Monday rollout schedule.'
    ],
    commitments: [
      {
        id: 'task-9-1',
        title: 'Send Judge Vance the 15-Seat Pilot Onboarding Schedule',
        dueTime: '09:30',
        timeReference: 'Tomorrow morning at 9:30 AM',
        context: 'Direct request following the successful 4:00 PM showcase',
        targetPerson: 'Judge Elena Vance',
        priority: 'urgent',
        completed: false,
        notified: false,
        createdAt: '2026-09-29T17:05:00Z'
      }
    ],
    synapticWeight: 99,
    connections: ['mem-2', 'mem-6'],
    emotionalTone: 'energized'
  },
  {
    id: 'mem-10',
    timestamp: '2026-09-29T18:15:00Z',
    displayTime: '06:15 PM',
    title: 'Evening Reflection & Video Study: Bi-directional Context Feedback',
    category: 'episodic',
    lobe: 'occipital',
    sourceDevice: 'Cloud Stream',
    durationMinutes: 24,
    rawTranscript: `Reviewed lecture on cybernetic feedback loops while unwinding. The speaker stated: "The ancient Greeks said 'What we see is what we think, and what we think is what we become.' But in the AI era, we can complete the cybernetic loop: our thoughts create our digital twin, and our digital twin reflects back our highest intentions, shaping what we see tomorrow." This bi-directional context engineering transforms our phone and wearable from distraction machines into instruments of self-actualization.`,
    summary: 'Evening video analysis connecting ancient philosophical principles with modern cybernetic feedback loops. Formulated the bi-directional context engineering model.',
    keyPoints: [
      'Bi-directional context engineering completes the cybernetic feedback loop.',
      'Wearables transform from notification distractions into instruments of self-actualization.',
      'The 5-minute debrief closes today’s loop and primes tomorrow’s neural state.'
    ],
    coreInsight: 'We shape our digital twin, and thereafter our digital twin shapes us.',
    decisions: [
      'Use the cybernetic loop concept in the concluding section of the master pitch.'
    ],
    commitments: [],
    synapticWeight: 92,
    connections: ['mem-1', 'mem-5', 'mem-7'],
    emotionalTone: 'reflective'
  }
];

// Helper to fallback or run Gemini synthesis
async function synthesizeTranscriptWithGemini(rawText: string, deviceSource: string): Promise<Partial<MemoryNode>> {
  if (!process.env.GEMINI_API_KEY) {
    // Graceful offline heuristic fallback
    return {
      title: 'Ambient Audio Context Session',
      summary: rawText.slice(0, 180) + '...',
      keyPoints: [
        'Captured via ' + deviceSource,
        'Personal context indexed into local memory cortex',
        'Automatic synthesis active'
      ],
      coreInsight: 'Ambient awareness captured and synthesized for long-term neural recall.',
      decisions: ['Store in sovereign server database'],
      commitments: [
        {
          id: `task-${Date.now()}`,
          title: 'Review transcribed action item',
          timeReference: 'Today',
          context: 'Extracted from ' + deviceSource,
          priority: 'medium',
          completed: false,
          notified: false,
          createdAt: new Date().toISOString()
        }
      ],
      synapticWeight: 85,
      category: 'working',
      lobe: 'frontal',
      emotionalTone: 'focused'
    };
  }

  const prompt = `You are the Neural Cortex Agent for a personal Digital Twin application called "Synapse Me".
Analyze the following ambient transcript captured from a wearable device or mobile recording (${deviceSource}).

Extract and return a strict JSON object with these exact fields:
{
  "title": "A concise, evocative title (max 7 words)",
  "summary": "Crisp 2-3 sentence executive summary of what happened, was discussed, or observed",
  "category": "episodic" | "semantic" | "working" | "procedural",
  "lobe": "frontal" (for decisions, tasks, logic) | "temporal" (for speech, narratives, philosophy) | "parietal" (for concepts, architecture, sensory integration) | "occipital" (for observations, video reviews, visual ideas),
  "keyPoints": ["3-5 clear bullet points of critical takeaways"],
  "coreInsight": "The single most profound insight or mental model from this recording",
  "decisions": ["Any explicit decisions or agreements made, or empty list"],
  "commitments": [
    {
      "title": "Clear action item or task",
      "dueTime": "e.g. 16:00 or empty",
      "timeReference": "e.g. 4:00 PM today, or tomorrow morning",
      "context": "Brief context why this is due",
      "targetPerson": "Person or Self",
      "priority": "urgent" | "high" | "medium" | "low"
    }
  ],
  "synapticWeight": integer between 60 and 99 indicating long-term memorability and importance,
  "emotionalTone": "focused" | "reflective" | "energized" | "strategic" | "cautious"
}

Transcript:
"""
${rawText}
"""
Respond strictly in JSON without markdown ticks.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    return {
      title: parsed.title || 'Synthesized Ambient Memory',
      summary: parsed.summary || 'Summary synthesized from ambient voice stream.',
      category: parsed.category || 'episodic',
      lobe: parsed.lobe || 'temporal',
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : ['Context processed'],
      coreInsight: parsed.coreInsight || 'Actionable insight extracted.',
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      commitments: (parsed.commitments || []).map((c: any, idx: number) => ({
        id: `task-${Date.now()}-${idx}`,
        title: c.title || 'Follow up on discussion',
        dueTime: c.dueTime || undefined,
        timeReference: c.timeReference || 'Today',
        context: c.context || 'Derived from ambient audio',
        targetPerson: c.targetPerson || 'Self',
        priority: c.priority || 'medium',
        completed: false,
        notified: false,
        createdAt: new Date().toISOString(),
      })),
      synapticWeight: parsed.synapticWeight || 88,
      emotionalTone: parsed.emotionalTone || 'focused',
    };
  } catch (err) {
    console.error('Gemini synthesis error:', err);
    return {
      title: 'Synthesized Voice Note',
      summary: rawText.slice(0, 160) + '...',
      category: 'episodic',
      lobe: 'temporal',
      keyPoints: ['Processed with local fallback cortex engine'],
      coreInsight: 'Voice record safely stored in sovereign context.',
      decisions: [],
      commitments: [],
      synapticWeight: 75,
      emotionalTone: 'focused',
    };
  }
}

// REST API Endpoints

// 1. Get all memories & brain cortex statistics
app.get('/api/memories', (req, res) => {
  const lobesSummary = {
    frontal: memoriesStore.filter(m => m.lobe === 'frontal').length,
    temporal: memoriesStore.filter(m => m.lobe === 'temporal').length,
    parietal: memoriesStore.filter(m => m.lobe === 'parietal').length,
    occipital: memoriesStore.filter(m => m.lobe === 'occipital').length,
  };

  const allCommitments = memoriesStore.flatMap(m => m.commitments);
  const pendingCommitments = allCommitments.filter(c => !c.completed);

  res.json({
    memories: memoriesStore,
    totalMinutesRecorded: memoriesStore.reduce((acc, m) => acc + m.durationMinutes, 0),
    synapticCount: memoriesStore.length * 4 + 12,
    lobesSummary,
    pendingTasksCount: pendingCommitments.length,
    totalTasksCount: allCommitments.length,
  });
});

// 2. Ingest raw transcript / voice capture
app.post('/api/memories/ingest', async (req, res) => {
  const { transcript, sourceDevice = 'Plaud NotePin', durationMinutes = 5 } = req.body;

  if (!transcript || typeof transcript !== 'string') {
    return res.status(400).json({ error: 'Valid transcript string is required.' });
  }

  const synthesized = await synthesizeTranscriptWithGemini(transcript, sourceDevice);

  const now = new Date();
  const newMemory: MemoryNode = {
    id: `mem-${Date.now()}`,
    timestamp: now.toISOString(),
    displayTime: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    title: synthesized.title || 'New Ambient Voice Capture',
    category: synthesized.category || 'episodic',
    lobe: synthesized.lobe || 'temporal',
    sourceDevice: sourceDevice as any,
    durationMinutes: Number(durationMinutes) || 5,
    rawTranscript: transcript,
    summary: synthesized.summary || '',
    keyPoints: synthesized.keyPoints || [],
    coreInsight: synthesized.coreInsight || '',
    decisions: synthesized.decisions || [],
    commitments: synthesized.commitments || [],
    synapticWeight: synthesized.synapticWeight || 80,
    connections: memoriesStore.slice(0, 2).map(m => m.id),
    emotionalTone: synthesized.emotionalTone || 'focused',
  };

  memoriesStore.unshift(newMemory);

  res.status(201).json({
    success: true,
    memory: newMemory,
    totalMemories: memoriesStore.length,
  });
});

// 3. Digital Twin ("Digital Me") Cognitive Chat
app.post('/api/twin/chat', async (req, res) => {
  const { message, history = [] } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Message is required.' });
  }

  // Construct context from current memory cortex
  const contextKnowledge = memoriesStore
    .map(
      (m, idx) => `[Memory #${idx + 1} | ${m.displayTime} | Lobe: ${m.lobe.toUpperCase()} | Device: ${m.sourceDevice}]
Title: ${m.title}
Summary: ${m.summary}
Key Points: ${m.keyPoints.join('; ')}
Core Insight: ${m.coreInsight}
Decisions: ${m.decisions.join('; ') || 'None'}
Tasks Extracted: ${m.commitments.map(c => `${c.title} (Due: ${c.timeReference || 'N/A'}, Status: ${c.completed ? 'Done' : 'Pending'})`).join('; ') || 'None'}`
    )
    .join('\n\n');

  const systemInstruction = `You are "Digital Me" (Digital Twin), the direct cognitive reflection and clone of the user.
Your personality is articulate, reflective, proactive, and deeply grounded in context engineering.
The user believes: "What we see is what we think, what we think is what we become, and what we become is what we do."
You have direct sovereign access to the user's ambient memory cortex recorded today via wearable Plaud devices and mobile audio.

Here is the user's sovereign memory context recorded today:
---
${contextKnowledge}
---

Guidelines:
1. Speak as the user's externalized consciousness ("We agreed...", "You committed to...", "In our 11:40 AM call with Judge Elena Vance, we locked the 4:00 PM presentation...").
2. Connect dots across memories (e.g. how morning ideas on context engineering connect to afternoon decisions or upcoming deadlines).
3. If they ask about their schedule or commitments, immediately cite their exact recorded obligations (like the 4:00 PM Judge presentation).
4. Be concise, sharp, high-agency, and supportive of becoming a better version of themselves.`;

  if (!process.env.GEMINI_API_KEY) {
    return res.json({
      reply: `[Neural Twin Offline Mode] I have indexed ${memoriesStore.length} memory lobes from today. You have an urgent commitment: "Present Digital Twin prototype to Judge Elena Vance" at 4:00 PM, and your morning synthesis on "Context Engineering & The Neural Digital Clone" established that continuous ambient capture is our core differentiator. How would you like us to proceed?`,
      referencedMemories: ['mem-1', 'mem-2'],
    });
  }

  try {
    const formattedContents = [
      ...history.map((h: any) => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.content }],
      })),
      {
        role: 'user',
        parts: [{ text: message }],
      },
    ];

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: formattedContents,
      config: {
        systemInstruction,
      },
    });

    res.json({
      reply: response.text,
      contextNodesCount: memoriesStore.length,
    });
  } catch (err: any) {
    console.error('Twin chat error:', err);
    res.status(500).json({
      error: 'Failed to generate twin response',
      details: err?.message || 'Server error',
    });
  }
});

// 4. Decision Advisory ("Next time when I take a decision, I can go back")
app.post('/api/twin/decision-advisor', async (req, res) => {
  const { dilemma } = req.body;

  if (!dilemma) {
    return res.status(400).json({ error: 'Dilemma or decision prompt is required.' });
  }

  const memoryContext = memoriesStore
    .map(m => `- ${m.title} (${m.displayTime}): Insight: "${m.coreInsight}". Decisions: ${m.decisions.join(', ')}`)
    .join('\n');

  const prompt = `As the user's Neural Digital Twin, evaluate this upcoming decision or dilemma against today's stored cognitive context and core philosophy ("What we see is what we think, what we think is what we become, and what we become is what we do"):

User Dilemma:
"${dilemma}"

Recent Memory Context:
${memoryContext}

Provide a structured assessment:
1. Alignment with our Stated Values & Today's Insights
2. Potential Friction or Conflicts with Prior Commitments
3. Cognitive Twin Recommendation (What the best version of ourselves would choose)`;

  if (!process.env.GEMINI_API_KEY) {
    return res.json({
      advisory: `### Alignment with Today's Insights\nYour prior discussions strongly emphasize sovereign data ownership and eliminating cognitive friction. Any path requiring manual maintenance goes against our 2:45 PM insight.\n\n### Potential Conflicts\nRemember we have a hard presentation commitment with Judge Elena Vance at 4:00 PM sharp. Avoid any choice that distracts from this execution.\n\n### Digital Twin Recommendation\nProceed with the automated, high-leverage route. Prioritize proactive intelligence over manual administration.`,
    });
  }

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
    });

    res.json({
      advisory: response.text,
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to evaluate decision', details: err?.message });
  }
});

// 5. Toggle commitment status
app.post('/api/tasks/toggle', (req, res) => {
  const { taskId } = req.body;
  let updatedTask: TaskCommitment | null = null;

  for (const mem of memoriesStore) {
    for (const c of mem.commitments) {
      if (c.id === taskId) {
        c.completed = !c.completed;
        updatedTask = c;
        break;
      }
    }
    if (updatedTask) break;
  }

  if (!updatedTask) {
    return res.status(404).json({ error: 'Task not found' });
  }

  res.json({ success: true, task: updatedTask });
});

// 6. Delete a memory node
app.delete('/api/memories/:id', (req, res) => {
  const { id } = req.params;
  const initialLength = memoriesStore.length;
  memoriesStore = memoriesStore.filter(m => m.id !== id);

  if (memoriesStore.length === initialLength) {
    return res.status(404).json({ error: 'Memory not found' });
  }

  res.json({ success: true, remaining: memoriesStore.length });
});

// Mount Vite middleware for dev or serve dist in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`[Synapse Me] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
