export type LobeType = 'frontal' | 'temporal' | 'parietal' | 'occipital';
export type MemoryCategory = 'episodic' | 'semantic' | 'working' | 'procedural';
export type SourceDevice = 'Plaud NotePin' | 'Mobile Voice' | 'Cloud Stream' | 'Ambient Mic' | 'Direct Input';
export type EmotionalTone = 'focused' | 'reflective' | 'energized' | 'strategic' | 'cautious';

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
  category: MemoryCategory;
  lobe: LobeType;
  sourceDevice: SourceDevice;
  durationMinutes: number;
  rawTranscript: string;
  summary: string;
  keyPoints: string[];
  coreInsight: string;
  decisions: string[];
  commitments: TaskCommitment[];
  synapticWeight: number; // 1 - 100
  connections: string[]; // Connected memory IDs
  emotionalTone: EmotionalTone;
}

export interface CortexStats {
  memories: MemoryNode[];
  totalMinutesRecorded: number;
  synapticCount: number;
  lobesSummary: {
    frontal: number;
    temporal: number;
    parietal: number;
    occipital: number;
  };
  pendingTasksCount: number;
  totalTasksCount: number;
}
