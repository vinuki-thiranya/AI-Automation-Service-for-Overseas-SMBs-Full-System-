import type { ReactNode } from "react";

// The @drawer slot shows a conversation over the list when it's opened from the list (soft navigation);
// direct visits and reloads render conversations/[threadId] as a full page instead.
export default function ConversationsLayout({ children, drawer }: { children: ReactNode; drawer: ReactNode }) {
  return (
    <>
      {children}
      {drawer}
    </>
  );
}
