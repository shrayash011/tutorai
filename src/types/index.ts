// ============================================================
// TutorAI — Shared TypeScript Types
// ============================================================

// ── Enums / Literals ──────────────────────────────────────

export type Plan = 'free' | 'student' | 'family' | 'school';

export type Curriculum = 'SEE' | 'NEB' | 'CBSE' | 'Cambridge' | 'ICSE' | 'Other';

export type Language = 'English' | 'Nepali' | 'Hindi' | 'Bengali';

export type MessageRole = 'user' | 'assistant';

export type Difficulty = 'easy' | 'medium' | 'hard';

// ── DB Row Types ───────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  plan: Plan;
  plan_expires_at: string | null;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentProfile {
  id: string;
  user_id: string;
  name: string;
  grade: number;
  curriculum: Curriculum;
  language: Language;
  subjects: string[];
  is_primary: boolean;
  created_at: string;
}

export interface ChatSession {
  id: string;
  student_profile_id: string;
  subject: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  session_id: string;
  role: MessageRole;
  content: string;
  has_image: boolean;
  image_url: string | null;
  tokens_used: number | null;
  created_at: string;
}

export interface PracticeQuestion {
  id: string;
  student_profile_id: string;
  subject: string;
  topic: string;
  question_text: string;
  student_answer: string | null;
  ai_feedback: string | null;
  score: number | null;
  is_correct: boolean | null;
  difficulty: Difficulty;
  created_at: string;
}

export interface TopicPerformance {
  id: string;
  student_profile_id: string;
  subject: string;
  topic: string;
  questions_attempted: number;
  questions_correct: number;
  last_practiced_at: string | null;
  updated_at: string;
}

export interface DailyUsage {
  id: string;
  user_id: string;
  usage_date: string;
  ai_messages_count: number;
  practice_questions_count: number;
}

export interface School {
  id: string;
  name: string;
  country: string;
  admin_user_id: string;
  plan: 'school';
  student_count_limit: number;
  created_at: string;
}

// ── Insert Types (omit server-generated fields) ────────────

export type UserInsert = Omit<User, 'plan' | 'plan_expires_at' | 'stripe_customer_id' | 'created_at' | 'updated_at'> & {
  plan?: Plan;
  plan_expires_at?: string | null;
  stripe_customer_id?: string | null;
};

export type StudentProfileInsert = Omit<StudentProfile, 'id' | 'is_primary' | 'created_at'> & {
  id?: string;
  is_primary?: boolean;
};

export type ChatSessionInsert = Omit<ChatSession, 'id' | 'title' | 'message_count' | 'created_at' | 'updated_at'> & {
  id?: string;
  title?: string;
};

export type MessageInsert = Omit<Message, 'id' | 'has_image' | 'image_url' | 'tokens_used' | 'created_at'> & {
  id?: string;
  has_image?: boolean;
  image_url?: string | null;
  tokens_used?: number | null;
};

export type PracticeQuestionInsert = Omit<PracticeQuestion, 'id' | 'student_answer' | 'ai_feedback' | 'score' | 'is_correct' | 'created_at'> & {
  id?: string;
  student_answer?: string | null;
  ai_feedback?: string | null;
  score?: number | null;
  is_correct?: boolean | null;
};

export type TopicPerformanceInsert = Omit<TopicPerformance, 'id' | 'questions_attempted' | 'questions_correct' | 'last_practiced_at' | 'updated_at'> & {
  id?: string;
  questions_attempted?: number;
  questions_correct?: number;
  last_practiced_at?: string | null;
};

// ── API Request / Response Shapes ─────────────────────────

export interface ApiResponse<T> {
  data: T | null;
  error: string | null;
}

export interface SendMessageRequest {
  session_id: string;
  content: string;
  image_url?: string;
}

export interface SendMessageResponse {
  message: Message;
  tokens_used: number;
}

export interface GeneratePracticeRequest {
  student_profile_id: string;
  subject: string;
  topic: string;
  difficulty?: Difficulty;
  count?: number;
}

export interface SubmitPracticeRequest {
  question_id: string;
  student_answer: string;
}

export interface SubmitPracticeResponse {
  feedback: string;
  score: number;
  is_correct: boolean;
}

export interface CreateSessionRequest {
  student_profile_id: string;
  subject: string;
  title?: string;
}

export interface UsageLimitStatus {
  ai_messages_used: number;
  ai_messages_limit: number;
  practice_used: number;
  practice_limit: number;
  is_limited: boolean;
}
