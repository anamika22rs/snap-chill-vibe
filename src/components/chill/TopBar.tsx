import { Link } from "@tanstack/react-router";
import { Camera, Clapperboard, MapPin, MessageCircle } from "lucide-react";

export function TopBar({ title = "ChillSnap" }: { title?: string }) {
  return (
    <header className="sticky top-0 z-30 glass mx-auto flex max-w-lg items-center justify-between px-4 py-3">
      <h1 className="font-display text-2xl font-bold text-gradient">{title}</h1>
      <div className="flex items-center gap-1">
        <Link to="/reels" aria-label="Reels" className="rounded-full p-2 text-foreground">
          <Clapperboard className="h-5 w-5" />
        </Link>
        <Link to="/snap" aria-label="Snaps" className="rounded-full p-2 text-foreground">
          <Camera className="h-5 w-5" />
        </Link>
        <Link to="/chat" aria-label="Chats" className="rounded-full p-2 text-foreground">
          <MessageCircle className="h-5 w-5" />
        </Link>
      </div>
    </header>
  );
}
