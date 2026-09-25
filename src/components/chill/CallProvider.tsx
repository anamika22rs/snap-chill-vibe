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
  | {
      kind: "offer";
      callId: string;
      from: string;
      username: string;
      avatar: string | null;
      sdp: RTCSessionDescriptionInit;
    }
  | { kind: "ringing"; callId: string }
  | { kind: "answer"; callId: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; callId: string; candidate: RTCIceCandidateInit }
  | { kind: "decline"; callId: string }
  | { kind: "end"; callId: string };

type Status = "calling" | "ringing" | "incoming" | "connecting" | "connected" | "declined" | "ended";

type CallState = {
  callId: string;
  peerId: string;
  peerName: string;
  peerAvatar: string | null;
  role: "caller" | "callee";
  status: Status;
  offer?: RTCSessionDescriptionInit;
};

const ICE = {
  iceServers: [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }],
};

type Peer = Pick<Profile, "id" | "username"> & { avatar_url?: string | null };
type Ctx = { startCall: (peer: Peer) => Promise<void>; busy: boolean };
const CallCtx = createContext<Ctx>({ startCall: async () => {}, busy: false });
export const useCall = () => useContext(CallCtx);

function micError(err: unknown) {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "Microphone is blocked. Tap the lock/site icon next to the address bar, allow Microphone, then reload and try again.";
  if (name === "NotFoundError") return "No microphone found on this device.";
  if (name === "NotReadableError") return "Your microphone is being used by another app.";
  return null;
}

export function CallProvider({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  const meId = me?.user.id;
  const myName = me?.profile?.username ?? "someone";
  const myAvatar = me?.profile?.avatar_url ?? null;

  const [call, setCallState] = useState<CallState | null>(null);
  const callRef = useRef<CallState | null>(null);
  const setCall = useCallback((next: CallState | null | ((c: CallState | null) => CallState | null)) => {
    const v = typeof next === "function" ? next(callRef.current) : next;
    callRef.current = v;
    setCallState(v);
  }, []);

  const [muted, setMuted] = useState(false);
  const [seconds, setSeconds] = useState(0);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peerChannels = useRef(new Map<string, RealtimeChannel>());
  const pendingIce = useRef<RTCIceCandidateInit[]>([]);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    pcRef.current?.close();
    pcRef.current = null;
    localRef.current?.getTracks().forEach((t) => t.stop());
    localRef.current = null;
    pendingIce.current = [];
    if (audioRef.current) audioRef.current.srcObject = null;
    setMuted(false);
    setSeconds(0);
  }, []);

  // Show a final state (Declined / Ended) briefly, then close the call screen.
  const finish = useCallback(
    (status: "declined" | "ended") => {
      cleanup();
      setCall((c) => (c ? { ...c, status } : c));
      if (closeTimer.current) clearTimeout(closeTimer.current);
      closeTimer.current = setTimeout(() => setCall(null), 1800);
    },
    [cleanup, setCall],
  );

  const send = useCallback(async (peerId: string, payload: Signal) => {
    let ch = peerChannels.current.get(peerId);
    if (!ch) {
      ch = supabase.channel(`call-user-${peerId}`, { config: { broadcast: { ack: true } } });
      await new Promise<void>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("signal timeout")), 8000);
        ch!.subscribe((s) => {
          if (s === "SUBSCRIBED") {
            clearTimeout(t);
            resolve();
          }
        });
      });
      peerChannels.current.set(peerId, ch);
    }
    await ch.send({ type: "broadcast", event: "signal", payload });
  }, []);

  const flushIce = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc?.remoteDescription) return;
    for (const c of pendingIce.current.splice(0)) {
      try {
        await pc.addIceCandidate(c);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const makePc = useCallback(
    (peerId: string, callId: string) => {
      const pc = new RTCPeerConnection(ICE);
      pc.onicecandidate = (e) => {
        if (e.candidate) void send(peerId, { kind: "ice", callId, candidate: e.candidate.toJSON() });
      };
      pc.ontrack = (e) => {
        if (audioRef.current) {
          audioRef.current.srcObject = e.streams[0] ?? new MediaStream([e.track]);
          void audioRef.current.play().catch(() => {});
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc !== pcRef.current) return;
        if (pc.connectionState === "connected") setCall((c) => (c ? { ...c, status: "connected" } : c));
        if (pc.connectionState === "failed") {
          toast.error("Call connection failed — the network may be blocking audio.");
          void supabase.from("calls").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", callId);
          void send(peerId, { kind: "end", callId });
          finish("ended");
        }
      };
      pcRef.current = pc;
      return pc;
    },
    [send, finish, setCall],
  );

  async function mic() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new DOMException("unsupported", "NotFoundError");
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    localRef.current = stream;
    return stream;
  }

  const hangUp = useCallback(async () => {
    const current = callRef.current;
    if (!current) return;
    if (current.status === "declined" || current.status === "ended") {
      setCall(null);
      return;
    }
    const declining = current.role === "callee" && current.status === "incoming";
    finish(declining ? "declined" : "ended");
    try {
      await send(current.peerId, { kind: declining ? "decline" : "end", callId: current.callId });
    } catch {
      /* peer offline */
    }
    await supabase
      .from("calls")
      .update({
        status: declining ? "declined" : current.status === "connected" ? "ended" : "missed",
        ended_at: new Date().toISOString(),
      })
      .eq("id", current.callId);
  }, [send, finish, setCall]);

  const startCall = useCallback(
    async (peer: Peer) => {
      if (!meId) return;
      if (peer.id === meId) return;
      if (callRef.current && callRef.current.status !== "declined" && callRef.current.status !== "ended") {
        toast.error("You're already on a call");
        return;
      }
      let stream: MediaStream;
      try {
        stream = await mic();
      } catch (err) {
        toast.error(micError(err) ?? "Couldn't access the microphone", { duration: 8000 });
        return;
      }
      try {
        const { data: row, error } = await supabase
          .from("calls")
          .insert({ caller_id: meId, callee_id: peer.id, status: "ringing" })
          .select()
          .single();
        if (error) throw error;
        setCall({
          callId: row.id,
          peerId: peer.id,
          peerName: peer.username,
          peerAvatar: peer.avatar_url ?? null,
          role: "caller",
          status: "calling",
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
          avatar: myAvatar,
          sdp: offer,
        });
        // No answer within 45s → missed.
        setTimeout(() => {
          const c = callRef.current;
          if (c?.callId === row.id && (c.status === "calling" || c.status === "ringing")) {
            toast("No answer");
            void hangUp();
          }
        }, 45000);
      } catch {
        cleanup();
        setCall(null);
        toast.error("Couldn't start the call. You may be blocked, or you're offline.");
      }
    },
    [meId, myName, myAvatar, makePc, send, cleanup, setCall, hangUp],
  );

  async function accept() {
    const c = callRef.current;
    if (!c?.offer) return;
    let stream: MediaStream;
    try {
      stream = await mic();
    } catch (err) {
      toast.error(micError(err) ?? "Couldn't access the microphone", { duration: 8000 });
      void hangUp();
      return;
    }
    try {
      setCall((x) => (x ? { ...x, status: "connecting" } : x));
      const pc = makePc(c.peerId, c.callId);
      stream.getTracks().forEach((t) => pc.addTrack(t, stream));
      await pc.setRemoteDescription(c.offer);
      await flushIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await send(c.peerId, { kind: "answer", callId: c.callId, sdp: answer });
      await supabase
        .from("calls")
        .update({ status: "answered", started_at: new Date().toISOString() })
        .eq("id", c.callId);
    } catch {
      toast.error("Couldn't connect the call");
      void hangUp();
    }
  }

  // Listen for signals addressed to me.
  useEffect(() => {
    if (!meId) return;
    const channel = supabase
      .channel(`call-user-${meId}`)
      .on("broadcast", { event: "signal" }, async ({ payload }) => {
        const sig = payload as Signal;
        const cur = callRef.current;
        if (sig.kind === "offer") {
          const active = cur && cur.status !== "declined" && cur.status !== "ended";
          if (active) {
            await send(sig.from, { kind: "decline", callId: sig.callId }).catch(() => {});
            return;
          }
          if (closeTimer.current) clearTimeout(closeTimer.current);
          pendingIce.current = [];
          setCall({
            callId: sig.callId,
            peerId: sig.from,
            peerName: sig.username,
            peerAvatar: sig.avatar,
            role: "callee",
            status: "incoming",
            offer: sig.sdp,
          });
          void send(sig.from, { kind: "ringing", callId: sig.callId }).catch(() => {});
          return;
        }
        if (!cur || cur.callId !== sig.callId) return;
        if (sig.kind === "ringing") {
          setCall((c) => (c && c.status === "calling" ? { ...c, status: "ringing" } : c));
        }
        if (sig.kind === "answer" && pcRef.current) {
          setCall((c) => (c ? { ...c, status: "connecting" } : c));
          await pcRef.current.setRemoteDescription(sig.sdp);
          await flushIce();
        }
        if (sig.kind === "ice") {
          if (pcRef.current?.remoteDescription) {
            try {
              await pcRef.current.addIceCandidate(sig.candidate);
            } catch {
              /* ignore */
            }
          } else pendingIce.current.push(sig.candidate);
        }
        if (sig.kind === "decline") finish("declined");
        if (sig.kind === "end") finish("ended");
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [meId, send, finish, flushIce, setCall]);

  useEffect(() => {
    if (call?.status !== "connected") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [call?.status]);

  useEffect(
    () => () => {
      peerChannels.current.forEach((ch) => supabase.removeChannel(ch));
      peerChannels.current.clear();
    },
    [],
  );

  function toggleMute() {
    const track = localRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMuted(!track.enabled);
  }

  const label: Record<Status, string> = {
    calling: "Calling…",
    ringing: "Ringing…",
    incoming: "Incoming voice call…",
    connecting: "Accepted — connecting audio…",
    connected: `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`,
    declined: "Call declined",
    ended: "Call ended",
  };
  const done = call?.status === "declined" || call?.status === "ended";

  return (
    <CallCtx.Provider value={{ startCall, busy: !!call && !done }}>
      {children}
      <audio ref={audioRef} autoPlay playsInline className="hidden" />
      {call && (
        <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 bg-background/95 px-8 backdrop-blur">
          <Ava
            profile={{ username: call.peerName, avatar_url: call.peerAvatar, display_name: null }}
            size={120}
            ring
          />
          <div className="text-center">
            <p className="font-display text-2xl font-bold">@{call.peerName}</p>
            <p className="mt-1 text-sm text-muted-foreground">{label[call.status]}</p>
          </div>
          {!done && (
            <div className="flex items-center gap-6">
              {call.status === "incoming" && (
                <button
                  onClick={accept}
                  aria-label="Accept call"
                  className="gradient-chill glow flex h-16 w-16 items-center justify-center rounded-full text-primary-foreground"
                >
                  <Phone className="h-7 w-7" />
                </button>
              )}
              {(call.status === "connected" || call.status === "connecting") && (
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
                aria-label={call.status === "incoming" ? "Decline call" : "End call"}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive text-destructive-foreground"
              >
                <PhoneOff className="h-7 w-7" />
              </button>
            </div>
          )}
        </div>
      )}
    </CallCtx.Provider>
  );
}
