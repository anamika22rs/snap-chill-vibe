import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { PhoneOff, Phone, Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useMe";
import { Ava } from "./Ava";
import type { Profile } from "@/lib/chill";

type Signal =
  | { kind: "offer"; callId: string; from: string; username: string; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; callId: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; callId: string; candidate: RTCIceCandidateInit }
  | { kind: "end"; callId: string };

type CallState = {
  callId: string;
  peerId: string;
  peerName: string;
  role: "caller" | "callee";
  status: "ringing" | "incoming" | "connected" | "ended";
  offer?: RTCSessionDescriptionInit;
};

const ICE = { iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }] };

type Ctx = { startCall: (peer: Pick<Profile, "id" | "username">) => Promise<void>; busy: boolean };
const CallCtx = createContext<Ctx>({ startCall: async () => {}, busy: false });
export const useCall = () => useContext(CallCtx);

export function CallProvider({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const meId = me?.user.id;
  const myName = me?.profile?.username ?? "someone";

  const [call, setCall] = useState<CallState | null>(null);
  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peerChannelRef = useRef<RealtimeChannel | null>(null);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    if (peerChannelRef.current) supabase.removeChannel(peerChannelRef.current);
    peerChannelRef.current = null;
    setMuted(false);
    setSeconds(0);
  }, []);

  const peerChannel = useCallback(async (peerId: string) => {
    if (peerChannelRef.current) return peerChannelRef.current;
    const ch = supabase.channel(`call-user-${peerId}`, { config: { broadcast: { ack: false } } });
    await new Promise<void>((resolve) => ch.subscribe((s) => s === "SUBSCRIBED" && resolve()));
    peerChannelRef.current = ch;
    return ch;
  }, []);

  const send = useCallback(
    async (peerId: string, payload: Signal) => {
      const ch = await peerChannel(peerId);
      await ch.send({ type: "broadcast", event: "signal", payload });
    },
    [peerChannel],
  );

  const makePc = useCallback(
    (peerId: string, callId: string) => {
      const pc = new RTCPeerConnection(ICE);
      pc.onicecandidate = (e) => {
        if (e.candidate) void send(peerId, { kind: "ice", callId, candidate: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        if (audioRef.current) {
          audioRef.current.srcObject = e.streams[0] ?? null;
          void audioRef.current.play().catch(() => {});
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") {
          setCall((c) => (c ? { ...c, status: "connected" } : c));
        }
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
          setCall(null);
          cleanup();
        }
      };
      pcRef.current = pc;
      return pc;
    },
    [send, cleanup],
  );

  async function mic() {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localRef.current = stream;
    return stream;
  }

  const hangUp = useCallback(
    async (notify = true) => {
      const current = call;
      setCall(null);
      if (current) {
        if (notify) await send(current.peerId, { kind: "end", callId: current.callId });
        await supabase
          .from("calls")
          .update({ status: "ended", ended_at: new Date().toISOString() })
          .eq("id", current.callId);
      }
      cleanup();
    },
    [call, send, cleanup],
  );

  const startCall = useCallback(
    async (peer: Pick<Profile, "id" | "username">) => {
      if (!meId) return;
      if (call) {
        toast.error("You're already on a call");
        return;
      }
      try {
        const { data: row, error } = await supabase
          .from("calls")
          .insert({ caller_id: meId, callee_id: peer.id, status: "ringing" })
          .select()
          .single();
        if (error) throw error;

        const stream = await mic();
        setCall({
          callId: row.id,
          peerId: peer.id,
          peerName: peer.username,
          role: "caller",
          status: "ringing",
        });
        const pc = makePc(peer.id, row.id);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await send(peer.id, {
          kind: "offer",
          callId: row.id,
          from: meId,
          username: myName,
          sdp: offer,
        });
      } catch (err) {
        setCall(null);
        cleanup();
        toast.error(
          err instanceof DOMException
            ? "Microphone access is needed for calls"
            : "Couldn't start the call",
        );
      }
    },
    [meId, myName, call, makePc, send, cleanup],
  );

  async function accept() {
    if (!call?.offer) return;
    try {
      const stream = await mic();
      const pc = makePc(call.peerId, call.callId);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await pc.setRemoteDescription(call.offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await send(call.peerId, { kind: "answer", callId: call.callId, sdp: answer });
      await supabase
        .from("calls")
        .update({ status: "answered", started_at: new Date().toISOString() })
        .eq("id", call.callId);
      setCall((c) => (c ? { ...c, status: "connected" } : c));
    } catch {
      toast.error("Microphone access is needed for calls");
      void hangUp();
    }
  }

  // Listen for incoming signals addressed to me.
  useEffect(() => {
    if (!meId) return;
    const channel = supabase
      .channel(`call-user-${meId}`)
      .on("broadcast", { event: "signal" }, async ({ payload }) => {
        const sig = payload as Signal;
        if (sig.kind === "offer") {
          if (pcRef.current) {
            await send(sig.from, { kind: "end", callId: sig.callId });
            return;
          }
          setCall({
            callId: sig.callId,
            peerId: sig.from,
            peerName: sig.username,
            role: "callee",
            status: "incoming",
            offer: sig.sdp,
          });
        }
        if (sig.kind === "answer" && pcRef.current) {
          await pcRef.current.setRemoteDescription(sig.sdp);
          await supabase
            .from("calls")
            .update({ status: "answered", started_at: new Date().toISOString() })
            .eq("id", sig.callId);
        }
        if (sig.kind === "ice" && pcRef.current) {
          try {
            await pcRef.current.addIceCandidate(sig.candidate);
          } catch {
            /* ignore late candidates */
          }
        }
        if (sig.kind === "end") {
          setCall(null);
          cleanup();
          toast("Call ended");
        }
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [meId, send, cleanup]);

  useEffect(() => {
    if (call?.status !== "connected") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [call?.status]);

  function toggleMute() {
    const track = localRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }

  return (
    <CallCtx.Provider value={{ startCall, busy: !!call }}>
      {children}
      <audio ref={audioRef} autoPlay className="hidden" />
      {call && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-background/95 px-8 backdrop-blur">
          <Ava profile={{ username: call.peerName, avatar_url: null, display_name: null }} size={120} ring />
          <div className="text-center">
            <p className="font-display text-2xl font-bold">@{call.peerName}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {call.status === "incoming"
                ? "Incoming voice call…"
                : call.status === "ringing"
                  ? "Ringing…"
                  : `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`}
            </p>
          </div>
          <div className="flex items-center gap-4">
            {call.status === "incoming" && (
              <button
                onClick={accept}
                aria-label="Accept call"
                className="gradient-chill glow flex h-16 w-16 items-center justify-center rounded-full text-primary-foreground"
              >
                <Phone className="h-7 w-7" />
              </button>
            )}
            {call.status === "connected" && (
              <button
                onClick={toggleMute}
                aria-label={muted ? "Unmute" : "Mute"}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-secondary"
              >
                {muted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              </button>
            )}
            <button
              onClick={() => void hangUp()}
              aria-label="End call"
              className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
            >
              <PhoneOff className="h-7 w-7" />
            </button>
          </div>
        </div>
      )}
    </CallCtx.Provider>
  );
}
