import { createFileRoute } from "@tanstack/react-router";
import { ChatList } from "@/components/chill/ChatList";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Activity — ChillSnap" },
      { name: "description", content: "Your ChillSnap conversations and latest messages." },
      { property: "og:title", content: "Activity — ChillSnap" },
      { property: "og:description", content: "Your conversations and latest messages." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <ChatList title="Activity" />,
});
