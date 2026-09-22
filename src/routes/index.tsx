import { createFileRoute, Link } from "@tanstack/react-router";
import { Flame, Camera, MapPin, Clapperboard } from "lucide-react";
import heroGlow from "@/assets/hero-glow.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "ChillSnap — stories, reels & disappearing snaps" },
      {
        name: "description",
        content:
          "ChillSnap mixes an endless feed with 24-hour snaps, fire streaks, fun filters and a live snap map.",
      },
      { property: "og:title", content: "ChillSnap — stories, reels & disappearing snaps" },
      {
        property: "og:description",
        content: "An endless feed, 24-hour snaps, fire streaks, filters and a live snap map.",
      },
    ],
  }),
  component: Landing,
});

const features = [
  { icon: Camera, title: "24h Snaps", text: "Send a snap, it vanishes in a day." },
  { icon: Flame, title: "Streaks", text: "Keep the fire alive, day after day." },
  { icon: Clapperboard, title: "Reels", text: "Endless scroll of your crew's best." },
  { icon: MapPin, title: "Snap Map", text: "See where your friends are chilling." },
];

function Landing() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <img
        src={heroGlow}
        alt=""
        width={1280}
        height={1600}
        className="absolute inset-0 h-full w-full object-cover opacity-60"
      />
      <div className="relative mx-auto flex min-h-screen max-w-lg flex-col justify-between px-6 py-12">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">welcome to</p>
          <h1 className="mt-3 font-display text-6xl font-extrabold leading-[0.95] text-gradient">
            Chill
            <br />
            Snap
          </h1>
          <p className="mt-5 max-w-sm text-base text-foreground/80">
            The feed you scroll and the snaps that disappear — in one place. Stories, reels, streaks,
            filters and a map of your people.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {features.map(({ icon: Icon, title, text }) => (
            <div key={title} className="glass rounded-3xl p-4">
              <Icon className="h-5 w-5 text-primary" />
              <p className="mt-3 font-display text-sm font-bold">{title}</p>
              <p className="mt-1 text-xs text-muted-foreground">{text}</p>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <Link
            to="/auth"
            className="gradient-chill glow flex h-14 items-center justify-center rounded-full font-display text-lg font-bold text-primary-foreground"
          >
            Get started
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signin" }}
            className="flex h-12 items-center justify-center rounded-full border border-border bg-card/70 text-sm font-semibold"
          >
            I already have an account
          </Link>
        </div>
      </div>
    </main>
  );
}
