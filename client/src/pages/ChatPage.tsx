import { useParams } from "react-router-dom";
import { PlaceholderPage } from "./PlaceholderPage.js";

export function ChatPage() {
  const { threadId } = useParams<{ threadId?: string }>();
  return (
    <PlaceholderPage
      title={threadId ? `Chat: ${threadId}` : "Chat"}
      description="Recipe assistant / ask-anything BLW chat. Locked without an AI key."
    />
  );
}
