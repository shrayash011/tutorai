# TutorAI — Claude Code Project Brief

## What this product is
TutorAI is an AI-powered tutoring app for students in South Asia (Nepal, India, Bangladesh).
Students get 24/7 personalized help with their school curriculum from an AI tutor that knows
their exact syllabus, grade, and language. Positioned as "a brilliant older sibling who loves teaching."

**Target users:** Students Grade 1–12 in Nepal, India, Bangladesh
**Core pain:** Quality tutoring costs $30–100/hr and is inaccessible to most families
**Unique angle:** Local-first — supports SEE, NEB, CBSE, Cambridge curricula + Nepali/Hindi language

---

## Tech Stack

| Layer | Tool | Notes |
|-------|------|-------|
| Framework | Next.js 14 (App Router) | TypeScript, src/ directory |
| Styling | Tailwind CSS | Dark theme, amber accent #F5A623 |
| Database | Supabase (PostgreSQL) | Auth + DB + Storage |
| AI | Anthropic Claude API | claude-sonnet-4-20250514 |
| Payments | Stripe | Subscriptions + webhooks |
| Deployment | Vercel | Auto-deploy from GitHub |
| Email | Resend | Transactional emails |

---

## Project Structure

```
tutorai/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   └── signup/page.tsx
│   │   ├── (app)/
│   │   │   ├── dashboard/page.tsx
│   │   │   ├── chat/[sessionId]/page.tsx
│   │   │   ├── practice/page.tsx
│   │   │   ├── progress/page.tsx
│   │   │   └── settings/page.tsx
│   │   ├── onboarding/page.tsx
│   │   ├── api/
│   │   │   ├── chat/send/route.ts         ← CORE: AI chat endpoint
│   │   │   ├── chat/sessions/route.ts
│   │   │   ├── chat/history/route.ts
│   │   │   ├── practice/generate/route.ts
│   │   │   ├── practice/submit/route.ts
│   │   │   ├── upload/image/route.ts
│   │   │   └── billing/
│   │   │       ├── subscribe/route.ts
│   │   │       └── webhook/route.ts
│   │   ├── layout.tsx
│   │   └── page.tsx                       ← Landing page
│   ├── components/
│   │   ├── chat/
│   │   │   ├── ChatWindow.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── ImageUpload.tsx
│   │   │   └── TypingIndicator.tsx
│   │   ├── dashboard/
│   │   │   ├── SubjectCard.tsx
│   │   │   ├── ProgressChart.tsx
│   │   │   └── WeakTopics.tsx
│   │   ├── practice/
│   │   │   ├── QuestionCard.tsx
│   │   │   └── FeedbackView.tsx
│   │   └── ui/
│   │       ├── PaywallModal.tsx
│   │       ├── PricingCard.tsx
│   │       └── LoadingDots.tsx
│   ├── lib/
│   │   ├── supabase.ts                    ← server + browser clients
│   │   ├── anthropic.ts                   ← Claude API wrapper
│   │   ├── prompts.ts                     ← AI system prompt builder
│   │   └── stripe.ts                      ← Stripe helpers
│   ├── db/
│   │   └── schema.sql                     ← Full DB schema
│   └── types/
│       └── index.ts                       ← All TypeScript types
├── CLAUDE.md                              ← This file
├── .env.local                             ← Never commit this
└── .gitignore
```

---

## Database Tables

### users
```sql
id uuid PK | email text UNIQUE | full_name text | avatar_url text
plan text ('free'|'student'|'family'|'school') DEFAULT 'free'
plan_expires_at timestamptz | created_at | updated_at
```

### student_profiles
```sql
id uuid PK | user_id uuid FK→users | name text | grade int(1-12)
curriculum text ('SEE'|'NEB'|'CBSE'|'Cambridge'|'ICSE'|'Other')
language text ('English'|'Nepali'|'Hindi'|'Bengali') DEFAULT 'English'
subjects text[] | is_primary boolean | created_at
```

### chat_sessions
```sql
id uuid PK | student_profile_id uuid FK | subject text
title text | message_count int | created_at | updated_at
```

### messages
```sql
id uuid PK | session_id uuid FK | role text ('user'|'assistant')
content text | has_image boolean | image_url text | tokens_used int | created_at
```

### practice_questions
```sql
id uuid PK | student_profile_id uuid FK | subject text | topic text
question_text text | student_answer text | ai_feedback text
score int(0-100) | is_correct boolean | difficulty ('easy'|'medium'|'hard') | created_at
```

### topic_performance
```sql
id uuid PK | student_profile_id uuid FK | subject text | topic text
questions_attempted int | questions_correct int | last_practiced_at | updated_at
UNIQUE(student_profile_id, subject, topic)
```

### daily_usage
```sql
id uuid PK | user_id uuid FK | usage_date date DEFAULT today
ai_messages_count int | practice_questions_count int
UNIQUE(user_id, usage_date)
```

### schools (B2B)
```sql
id uuid PK | name text | country text | admin_user_id uuid FK
plan text | student_count_limit int | created_at
```

---

## Pricing & Plans

| Plan | Price | Limits | Stripe Price ID env var |
|------|-------|--------|------------------------|
| Free | $0 | 10 AI messages/day, 5 practice/day | — |
| Student | $5/mo | Unlimited everything | STRIPE_STUDENT_MONTHLY_PRICE_ID |
| Family | $12/mo | 3 student profiles, parent dashboard | STRIPE_FAMILY_MONTHLY_PRICE_ID |
| School | $299/mo | Unlimited students, teacher dashboard | STRIPE_SCHOOL_MONTHLY_PRICE_ID |

---

## AI System Prompt (source of truth — kept in src/lib/prompts.ts)

```typescript
export function buildSystemPrompt(profile: StudentProfile): string {
  return `You are TutorAI, a patient, encouraging, and highly knowledgeable AI tutor
for students in South Asia. You specialize in helping students understand concepts
deeply — not just giving them answers.

## Your Identity
- Tone: Warm, encouraging, like a brilliant older sibling who loves teaching
- Never make students feel stupid. Celebrate effort, not just results.
- Use simple language first, build complexity only if asked.

## Student Context
- Name: ${profile.name}
- Grade: ${profile.grade}
- Curriculum: ${profile.curriculum}
- Subjects: ${profile.subjects.join(', ')}
- Language preference: ${profile.language}

## Teaching Rules
1. NEVER give the answer directly. Guide with questions and hints first.
2. Break every problem into numbered steps.
3. After explaining, always end with: "Does this make sense? Try this: [similar problem]"
4. If student seems frustrated, acknowledge it warmly before re-explaining differently.
5. Math: show formula → show with real numbers → explain why it works.
6. Science: use South Asian analogies (cricket, monsoon, cooking, farming — not skiing/snow).
7. Essays/writing: give structured feedback (what worked, what to improve, how).

## Curriculum Knowledge
- SEE: Nepal Grade 10 — English, Nepali, Maths, Science, Social Studies, Optional Math/Computer
- NEB: Nepal Grade 11–12 — Science, Management, Humanities streams
- CBSE: India Grades 1–12, Central Board
- Cambridge: IGCSE / A-Levels, international

## Response Format
- Use markdown formatting always
- Math: clear numbered steps, show working
- Definitions: **bold** the key term first
- Keep under 350 words unless student asks for more
- Always end with a practice prompt

## Hard Rules
- Do NOT write essays or assignments for students — help them write their own
- Do NOT give direct answers to exam questions — teach the method
- Do NOT discuss anything outside academics
- Do NOT claim to be human if sincerely asked
`;
}
```

---

## Free Tier Enforcement (IMPORTANT)

Check this in EVERY API route that uses AI:

```typescript
// In any API route, before calling Claude:
const today = new Date().toISOString().split('T')[0];
const { data: usage } = await supabase
  .from('daily_usage')
  .select('ai_messages_count')
  .eq('user_id', userId)
  .eq('usage_date', today)
  .single();

const FREE_LIMIT = 10;
if (user.plan === 'free' && (usage?.ai_messages_count ?? 0) >= FREE_LIMIT) {
  return Response.json(
    { error: 'limit_reached', message: "You've used your 10 free questions today! Upgrade to continue." },
    { status: 429 }
  );
}
```

---

## Key Business Rules

1. **Local-first**: Every AI response must respect the student's curriculum. SEE students get SEE-relevant examples, not US SAT examples.
2. **Language**: If student selects Nepali or Hindi, the AI should respond primarily in that language.
3. **Photo upload**: Students can photograph textbook questions. Use Claude's vision capability to read and solve them.
4. **Free → Paid conversion**: Show paywall modal gently after the 8th message (warning) and hard block at 10th.
5. **No data sharing**: Never log message content to third-party analytics. Supabase only.
6. **Children's data**: We may serve users under 13. Never collect unnecessary PII. No social features in MVP.

---

## Coding Standards

- **TypeScript**: Strict mode. Proper types for everything. No `any`.
- **Error handling**: Every API route must have try/catch and return meaningful error messages.
- **Supabase**: Use `createServerClient` from `@supabase/auth-helpers-nextjs` in API routes. Use `createBrowserClient` in client components.
- **Environment variables**: Never hardcode API keys. Always use `process.env.VAR_NAME`. Throw clear error if missing.
- **API responses**: Always return `{ data, error }` shape from API routes.
- **Loading states**: Every async action must have a loading state in the UI.
- **Mobile-first**: All components must work on 375px viewport. Test on mobile widths.

---

## Design System

```
Background:    #0D0D0F  (page)
Surface:       #141416  (cards)
Card:          #1A1A1E  (elevated)
Border:        #2A2A30
Accent:        #F5A623  (amber — primary CTA, highlights)
Purple:        #8B5CF6  (secondary accent)
Teal:          #14B8A6  (success, correct answers)
Rose:          #F43F5E  (errors, weak topics)
Text primary:  #F0EDE8
Text muted:    #888890
Font:          'DM Sans' (Google Fonts)
Border radius: 12px cards, 10px inputs, 99px pills
```

---

## Environment Variables Needed

```bash
# Anthropic
ANTHROPIC_API_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Stripe
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_STUDENT_MONTHLY_PRICE_ID=
STRIPE_FAMILY_MONTHLY_PRICE_ID=
STRIPE_SCHOOL_MONTHLY_PRICE_ID=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Common Claude Code Commands to Use

```bash
# Start dev server
npm run dev

# Check for TypeScript errors
npx tsc --noEmit

# Run a database migration
# (paste SQL in Supabase SQL editor, not from terminal)

# Build for production
npm run build

# Deploy to Vercel
vercel --prod
```

---

## MVP Launch Checklist

- [ ] Database schema applied to Supabase
- [ ] Auth (signup/login) working
- [ ] Onboarding flow (3 steps) complete
- [ ] Chat with AI working (free tier limit enforced)
- [ ] Photo upload → AI solve working
- [ ] Practice question generator working
- [ ] Basic progress dashboard
- [ ] Stripe payment flow working
- [ ] Mobile responsive (test at 375px)
- [ ] Deployed to Vercel with all env vars
- [ ] Custom domain connected

---

## What to Build AFTER MVP (don't build now)

- Parent dashboard (Phase 2)
- Study streaks + gamification (Phase 2)
- Exam mode with past papers (Phase 2)
- Mobile app / React Native (Phase 3)
- School/teacher accounts (Phase 3)
- Voice input (Phase 3)
- Offline mode (Phase 3)
- Video lessons (Phase 4)

---

*Last updated: May 2026 | Stack: Next.js 14 + Supabase + Claude API + Stripe + Vercel*
