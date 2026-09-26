import { createFileRoute } from "@tanstack/react-router";
import { ChatList } from "@/components/chill/ChatList";

export const Route = createFileRoute("/_authenticated/chat/")({
  head: () => ({
    meta: [
      { title: "Chats — ChillSnap" },
      { name: "description", content: "Your private one-to-one ChillSnap conversations." },
      { property: "og:title", content: "Chats — ChillSnap" },
      { property: "og:description", content: "Private one-to-one conversations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <ChatList />,
});
