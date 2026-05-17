'use client';

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase';
import { MessageBubble } from '@/components/chat/MessageBubble';
import { TypingIndicator } from '@/components/chat/TypingIndicator';
import { PaywallModal } from '@/components/ui/PaywallModal';
import type { ChatSession, Message, StudentProfile, User } from '@/types';

// ── Types ──────────────────────────────────────────────────

interface TempMessage extends Message {
  /** Data-URL preview for images before they are stored */
  _imagePreview?: string;
}

// ── Skeleton ───────────────────────────────────────────────

function ChatSkeleton() {
  return (
    <div className="flex flex-col h-screen bg-[#0D0D0F] animate-pulse">
      <div className="h-14 border-b border-[#2A2A30] bg-[#0D0D0F]" />
      <div className="flex-1 p-4 space-y-4">
        {[80, 60, 90, 55].map((w, i) => (
          <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
            <div className="h-10 bg-[#1A1A1E] rounded-2xl" style={{ width: `${w}%` }} />
          </div>
        ))}
      </div>
      <div className="h-20 border-t border-[#2A2A30] bg-[#0D0D0F]" />
    </div>
  );
}

// ── Main component ─────────────────────────────────────────

export default function ChatClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();

  // Data state
  const [session, setSession] = useState<ChatSession | null>(null);
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [messages, setMessages] = useState<TempMessage[]>([]);
  const [messagesUsed, setMessagesUsed] = useState(0);

  // UI state
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallHard, setPaywallHard] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Load session + history ───────────────────────────────

  useEffect(() => {
    const supabase = createBrowserClient();

    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) { router.replace('/login'); return; }

      const today = new Date().toISOString().split('T')[0];

      const [
        { data: dbUser },
        { data: sess },
        { data: msgs },
        { data: usageRow },
      ] = await Promise.all([
        supabase.from('users').select('*').eq('id', authUser.id).single(),
        supabase.from('chat_sessions').select('*').eq('id', sessionId).single(),
        supabase.from('messages').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
        supabase.from('daily_usage').select('ai_messages_count').eq('user_id', authUser.id).eq('usage_date', today).single(),
      ]);

      if (!sess) { router.replace('/dashboard'); return; }

      setUser(dbUser as User);
      setSession(sess as ChatSession);
      setMessages((msgs ?? []) as TempMessage[]);
      setMessagesUsed(usageRow?.ai_messages_count ?? 0);

      // Fetch profile separately
      const { data: prof } = await supabase
        .from('student_profiles')
        .select('*')
        .eq('id', (sess as ChatSession).student_profile_id)
        .single();

      setProfile(prof as StudentProfile | null);
      setInitialLoading(false);
    }

    load();
  }, [sessionId, router]);

  // ── Auto-scroll ──────────────────────────────────────────

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // ── Auto-resize textarea ─────────────────────────────────

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, []);

  // ── Image picker ─────────────────────────────────────────

  const handleFileChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // 5 MB guard (Claude vision limit)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be under 5 MB.');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      setImageBase64(result);
      setImagePreview(result);
    };
    reader.readAsDataURL(file);
    // Reset so the same file can be re-selected
    e.target.value = '';
  }, []);

  const clearImage = useCallback(() => {
    setImageBase64(null);
    setImagePreview(null);
  }, []);

  // ── Send message ─────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if ((!text && !imageBase64) || isLoading || !profile) return;

    // Optimistic: show user message immediately
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: TempMessage = {
      id: tempId,
      session_id: sessionId,
      role: 'user',
      content: text || '(image)',
      has_image: !!imageBase64,
      image_url: null,
      tokens_used: null,
      created_at: new Date().toISOString(),
      _imagePreview: imagePreview ?? undefined,
    };

    setMessages(prev => [...prev, optimisticMsg]);
    setInput('');
    clearImage();
    setIsLoading(true);

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text || 'Please help me with this image.',
          sessionId,
          studentProfileId: profile.id,
          ...(imageBase64 ? { imageBase64 } : {}),
        }),
      });

      if (res.status === 429) {
        // Remove optimistic message, show hard paywall
        setMessages(prev => prev.filter(m => m.id !== tempId));
        setPaywallHard(true);
        setShowPaywall(true);
        return;
      }

      if (!res.ok) {
        setMessages(prev => prev.filter(m => m.id !== tempId));
        console.error('Send failed:', await res.text());
        return;
      }

      const json = await res.json();
      const { message: assistantMsg, messages_used, show_paywall_warning } = json.data as {
        message: Message;
        messages_used: number;
        show_paywall_warning: boolean;
      };

      setMessages(prev => [...prev, assistantMsg as TempMessage]);
      setMessagesUsed(messages_used);

      if (show_paywall_warning && !paywallHard) {
        setPaywallHard(false);
        setShowPaywall(true);
      }
    } catch (err) {
      console.error('[ChatClient] sendMessage error:', err);
      setMessages(prev => prev.filter(m => m.id !== tempId));
    } finally {
      setIsLoading(false);
      textareaRef.current?.focus();
    }
  }, [input, imageBase64, imagePreview, isLoading, profile, sessionId, paywallHard, clearImage]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage],
  );

  // ── Render ───────────────────────────────────────────────

  if (initialLoading) return <ChatSkeleton />;

  const isPaid = user?.plan !== 'free';
  const remaining = Math.max(0, 10 - messagesUsed);
  const canSend = (input.trim().length > 0 || !!imageBase64) && !isLoading;

  return (
    <div className="flex flex-col h-dvh bg-[#0D0D0F]">
      {/* ── Header ── */}
      <header className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-[#2A2A30] bg-[#0D0D0F] z-10">
        <button
          onClick={() => router.push('/dashboard')}
          className="p-1.5 -ml-1.5 rounded-lg text-[#888890] hover:text-[#F0EDE8] hover:bg-[#1A1A1E] transition-colors"
          aria-label="Back to dashboard"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex-1 min-w-0">
          <h1 className="text-sm font-semibold text-[#F0EDE8] truncate leading-tight">
            {session?.subject ?? 'Chat'}
          </h1>
          {profile && (
            <p className="text-xs text-[#888890] leading-tight truncate">
              {profile.name} · Grade {profile.grade}
            </p>
          )}
        </div>

        {/* Usage pill */}
        {!isPaid && (
          <button
            onClick={() => { setPaywallHard(false); setShowPaywall(true); }}
            className={`shrink-0 text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
              messagesUsed >= 8
                ? 'border-[#F43F5E]/40 text-[#F43F5E] bg-[#F43F5E]/10'
                : 'border-[#2A2A30] text-[#888890] bg-[#1A1A1E]'
            }`}
          >
            {messagesUsed}/10
          </button>
        )}
      </header>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto py-3">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full px-6 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#F5A623]/10 border border-[#F5A623]/20 flex items-center justify-center text-2xl mb-4">
              📚
            </div>
            <p className="text-[#F0EDE8] font-semibold mb-1">
              Ask me anything about {session?.subject}
            </p>
            <p className="text-[#888890] text-sm max-w-xs">
              I'll guide you step by step — no direct answers, just real understanding.
            </p>
          </div>
        )}

        <div className="space-y-0.5">
          {messages.map(msg => (
            <MessageBubble
              key={msg.id}
              message={msg}
              imagePreviewUrl={msg._imagePreview}
            />
          ))}
        </div>

        {isLoading && <TypingIndicator />}

        <div ref={bottomRef} className="h-2" />
      </div>

      {/* ── Image preview strip ── */}
      {imagePreview && (
        <div className="shrink-0 px-4 py-2 border-t border-[#2A2A30] bg-[#0D0D0F]">
          <div className="relative inline-block">
            <img
              src={imagePreview}
              alt="Selected"
              className="h-16 w-16 object-cover rounded-xl border border-[#2A2A30]"
            />
            <button
              onClick={clearImage}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-[#F43F5E] rounded-full flex items-center justify-center text-white text-xs leading-none font-bold shadow-md"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* ── Input ── */}
      <div className="shrink-0 px-4 py-3 border-t border-[#2A2A30] bg-[#0D0D0F]">
        <div className="flex items-end gap-2 bg-[#141416] border border-[#2A2A30] focus-within:border-[#F5A623]/40 rounded-2xl px-2 py-2 transition-colors">
          {/* Photo button */}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={isLoading}
            className="p-2 rounded-xl text-[#888890] hover:text-[#F5A623] hover:bg-[#1A1A1E] disabled:opacity-40 transition-colors shrink-0"
            title="Upload image"
            aria-label="Upload image"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>

          {/* Textarea */}
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => { setInput(e.target.value); resizeTextarea(); }}
            onKeyDown={handleKeyDown}
            placeholder={`Ask about ${session?.subject ?? 'anything'}…`}
            rows={1}
            disabled={isLoading}
            className="flex-1 bg-transparent text-[#F0EDE8] placeholder-[#888890] resize-none outline-none text-sm py-1.5 leading-5 max-h-32 disabled:opacity-60"
          />

          {/* Send button */}
          <button
            onClick={sendMessage}
            disabled={!canSend}
            className="p-2 rounded-xl bg-[#F5A623] text-black disabled:opacity-30 hover:bg-[#F5A623]/90 active:scale-95 transition-all shrink-0"
            aria-label="Send message"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
            </svg>
          </button>
        </div>

        <p className="text-center text-[10px] text-[#888890]/60 mt-2 select-none">
          Enter to send · Shift+Enter for new line
        </p>
      </div>

      {/* ── Paywall modal ── */}
      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        isHardBlock={paywallHard}
        messagesRemaining={remaining}
      />
    </div>
  );
}
