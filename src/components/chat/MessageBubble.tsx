'use client';

import type { ReactNode } from 'react';
import type { Message } from '@/types';

// ── Inline formatter ───────────────────────────────────────
// Handles **bold**, *italic*, `code` within a line of text.

interface InlineMatch {
  start: number;
  end: number;
  inner: string;
  kind: 'strong' | 'em' | 'code';
}

function InlineContent({ text }: { text: string }) {
  const PATTERNS: Array<{ re: RegExp; kind: InlineMatch['kind'] }> = [
    { re: /\*\*([^*\n]+)\*\*/g, kind: 'strong' },
    { re: /\*([^*\n]+)\*/g,     kind: 'em' },
    { re: /`([^`\n]+)`/g,       kind: 'code' },
  ];

  const matches: InlineMatch[] = [];
  for (const { re, kind } of PATTERNS) {
    const r = new RegExp(re.source, 'g');
    let m: RegExpExecArray | null;
    while ((m = r.exec(text)) !== null) {
      matches.push({ start: m.index, end: m.index + m[0].length, inner: m[1], kind });
    }
  }
  matches.sort((a, b) => a.start - b.start);

  const nodes: ReactNode[] = [];
  let cursor = 0;
  let ki = 0;

  for (const { start, end, inner, kind } of matches) {
    if (start < cursor) continue; // skip overlaps
    if (start > cursor) nodes.push(text.slice(cursor, start));
    if (kind === 'strong') nodes.push(<strong key={ki++} className="font-semibold text-[#F0EDE8]">{inner}</strong>);
    else if (kind === 'em')  nodes.push(<em key={ki++} className="italic text-[#D4D0CA]">{inner}</em>);
    else                     nodes.push(<code key={ki++} className="bg-[#0D0D0F] text-[#F5A623] px-1.5 py-0.5 rounded text-[11px] font-mono border border-[#2A2A30]">{inner}</code>);
    cursor = end;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));

  // eslint-disable-next-line react/jsx-no-useless-fragment
  return <>{nodes.length ? nodes : text}</>;
}

// ── Block renderer ─────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;

  while (i < lines.length) {
    const line = lines[i];

    // ── Fenced code block ────────────────────────────────
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim() || 'code';
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        body.push(lines[i]);
        i++;
      }
      i++; // consume closing fence
      blocks.push(
        <div key={k++} className="my-2.5 rounded-xl overflow-hidden border border-[#2A2A30]">
          <div className="flex items-center px-3 py-1.5 bg-[#0D0D0F] border-b border-[#2A2A30]">
            <span className="text-[10px] font-mono text-[#888890] uppercase tracking-wider">{lang}</span>
          </div>
          <pre className="p-3 overflow-x-auto bg-[#141416]">
            <code className="text-[11px] font-mono text-[#F0EDE8] whitespace-pre leading-5">
              {body.join('\n')}
            </code>
          </pre>
        </div>,
      );
      continue;
    }

    // ── Headers ──────────────────────────────────────────
    const h3 = line.match(/^### (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h1 = line.match(/^# (.+)/);
    if (h1) {
      blocks.push(<p key={k++} className="text-base font-bold text-[#F0EDE8] mt-3 mb-1"><InlineContent text={h1[1]} /></p>);
      i++; continue;
    }
    if (h2) {
      blocks.push(<p key={k++} className="text-sm font-bold text-[#F0EDE8] mt-3 mb-1"><InlineContent text={h2[1]} /></p>);
      i++; continue;
    }
    if (h3) {
      blocks.push(<p key={k++} className="text-sm font-semibold text-[#F0EDE8] mt-2 mb-0.5"><InlineContent text={h3[1]} /></p>);
      i++; continue;
    }

    // ── Horizontal rule ──────────────────────────────────
    if (/^[-*_]{3,}$/.test(line.trim())) {
      blocks.push(<hr key={k++} className="border-[#2A2A30] my-2.5" />);
      i++; continue;
    }

    // ── Blockquote ───────────────────────────────────────
    if (line.startsWith('> ')) {
      const qLines: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) {
        qLines.push(lines[i].slice(2));
        i++;
      }
      blocks.push(
        <blockquote key={k++} className="border-l-2 border-[#F5A623] pl-3 my-2">
          {qLines.map((l, j) => (
            <p key={j} className="text-xs text-[#888890] italic leading-relaxed">
              <InlineContent text={l} />
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // ── Unordered list ───────────────────────────────────
    if (/^[-*•+] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•+] /.test(lines[i])) {
        items.push(lines[i].replace(/^[-*•+] /, ''));
        i++;
      }
      blocks.push(
        <ul key={k++} className="my-1.5 space-y-1.5">
          {items.map((item, j) => (
            <li key={j} className="flex gap-2 text-sm leading-relaxed text-[#F0EDE8]">
              <span className="text-[#F5A623] shrink-0 mt-0.5 text-xs">•</span>
              <span><InlineContent text={item} /></span>
            </li>
          ))}
        </ul>,
      );
      continue;
    }

    // ── Ordered list ─────────────────────────────────────
    if (/^\d+[.)]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+[.)]\s+/, ''));
        i++;
      }
      blocks.push(
        <ol key={k++} className="my-1.5 space-y-1.5">
          {items.map((item, j) => (
            <li key={j} className="flex gap-2 text-sm leading-relaxed text-[#F0EDE8]">
              <span className="text-[#F5A623] shrink-0 font-mono text-xs mt-0.5 min-w-[1.1rem] text-right">{j + 1}.</span>
              <span><InlineContent text={item} /></span>
            </li>
          ))}
        </ol>,
      );
      continue;
    }

    // ── Blank line ───────────────────────────────────────
    if (line.trim() === '') { i++; continue; }

    // ── Paragraph ────────────────────────────────────────
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].startsWith('#') &&
      !lines[i].startsWith('```') &&
      !lines[i].startsWith('> ') &&
      !/^[-*•+] /.test(lines[i]) &&
      !/^\d+[.)]\s/.test(lines[i]) &&
      !/^[-*_]{3,}$/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push(
        <p key={k++} className="text-sm leading-relaxed text-[#F0EDE8]">
          <InlineContent text={paraLines.join(' ')} />
        </p>,
      );
    }
  }

  return <div className="space-y-1">{blocks}</div>;
}

// ── MessageBubble ──────────────────────────────────────────

interface MessageBubbleProps {
  message: Message;
  /** Optional data-URL preview for newly sent images (before persisted URL exists) */
  imagePreviewUrl?: string;
}

export function MessageBubble({ message, imagePreviewUrl }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end px-4 py-1">
        <div className="max-w-[80%]">
          {(message.has_image || imagePreviewUrl) && (
            <div className="flex justify-end mb-1.5">
              {imagePreviewUrl ? (
                <img
                  src={imagePreviewUrl}
                  alt="Uploaded"
                  className="h-32 max-w-[200px] object-cover rounded-xl border border-[#2A2A30]"
                />
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-[#888890] bg-[#1A1A1E] border border-[#2A2A30] px-3 py-2 rounded-xl">
                  <span>📷</span> Image attached
                </div>
              )}
            </div>
          )}
          {message.content && (
            <div className="bg-[#F5A623] text-black rounded-2xl rounded-br-sm px-4 py-2.5">
              <p className="text-sm leading-relaxed font-medium">{message.content}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Assistant bubble
  return (
    <div className="flex items-end gap-2.5 px-4 py-1">
      {/* Avatar */}
      <div className="w-7 h-7 rounded-full bg-[#F5A623] flex items-center justify-center text-[11px] font-bold text-black shrink-0 mb-0.5">
        T
      </div>
      <div className="max-w-[85%] bg-[#1A1A1E] border border-[#2A2A30] rounded-2xl rounded-bl-sm px-4 py-3">
        <MarkdownContent content={message.content} />
        {message.tokens_used != null && (
          <p className="text-[10px] text-[#888890]/60 mt-2 text-right">{message.tokens_used} tokens</p>
        )}
      </div>
    </div>
  );
}
