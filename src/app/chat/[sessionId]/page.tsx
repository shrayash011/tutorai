import ChatClient from './ChatClient';

// Thin server component — awaits the dynamic params then hands off to the
// client component. Required in Next.js 15+ where params is a Promise.
export default async function ChatPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ChatClient sessionId={sessionId} />;
}
