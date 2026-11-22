import type { Metadata } from "next";
import { getSessionUser } from "@/lib/auth";
import ChatUI, { AiSignIn } from "./chat-ui";

export const metadata: Metadata = {
  title: "Chat — Nizafa.ai",
  description: "Chat with Nizafa.ai in Urdu, English, Roman Urdu or Pashto.",
};

export const dynamic = "force-dynamic";

export default async function AiChatPage() {
  const user = await getSessionUser();
  if (!user) return <AiSignIn />;
  return <ChatUI email={user.email} />;
}
