"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Phone, PhoneOff } from "lucide-react";

type CallRecord = {
  id: string;
  order_id: string;
  initiator_id: string;
  initiator_name: string;
  answered_by: string | null;
  status: "ringing" | "active" | "ended" | "declined" | "missed";
  offer_sdp: string;
  answer_sdp: string | null;
  created_at: number;
};

type CandidateRecord = {
  id: string;
  user_id: string;
  candidate: string;
};

type Phase = "idle" | "incoming" | "calling" | "connecting" | "connected";

export default function OrderCall({
  orderId,
  actorId,
  onNotice,
}: {
  orderId: string;
  actorId: string;
  onNotice: (message: string) => void;
}) {
  const [call, setCall] = useState<CallRecord | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState(false);
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const callIdRef = useRef("");
  const phaseRef = useRef<Phase>("idle");
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const seenCandidatesRef = useRef(new Set<string>());

  const updatePhase = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const request = useCallback(
    async (body: Record<string, unknown>) => {
      const response = await fetch("/api/calls", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = (await response.json()) as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(String(result.error ?? "The call could not be completed."));
      }
      return result;
    },
    [],
  );

  const releaseMedia = useCallback(() => {
    peerRef.current?.close();
    peerRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;
    callIdRef.current = "";
    pendingCandidatesRef.current = [];
    seenCandidatesRef.current.clear();
  }, []);

  const sendCandidate = useCallback(
    async (candidate: RTCIceCandidateInit) => {
      const callId = callIdRef.current;
      if (!callId) {
        pendingCandidatesRef.current.push(candidate);
        return;
      }
      try {
        await request({
          action: "candidate",
          callId,
          candidate: JSON.stringify(candidate),
        });
      } catch {
        // Candidates can arrive after the other participant has already ended.
      }
    },
    [request],
  );

  const createPeer = useCallback(
    async (stream: MediaStream) => {
      peerRef.current?.close();
      const peer = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      });
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      peer.onicecandidate = (event) => {
        if (event.candidate) void sendCandidate(event.candidate.toJSON());
      };
      peer.ontrack = (event) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = event.streams[0];
          void remoteAudioRef.current.play().catch(() => undefined);
        }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "connected") updatePhase("connected");
        if (peer.connectionState === "failed") {
          onNotice("The internet call disconnected.");
          releaseMedia();
          updatePhase("idle");
        }
      };
      peerRef.current = peer;
      return peer;
    },
    [onNotice, releaseMedia, sendCandidate, updatePhase],
  );

  const addRemoteCandidates = useCallback(
    async (candidates: CandidateRecord[]) => {
      const peer = peerRef.current;
      if (!peer?.remoteDescription) return;
      for (const item of candidates) {
        if (item.user_id === actorId || seenCandidatesRef.current.has(item.id)) {
          continue;
        }
        try {
          await peer.addIceCandidate(
            JSON.parse(item.candidate) as RTCIceCandidateInit,
          );
          seenCandidatesRef.current.add(item.id);
        } catch {
          // A superseded network candidate can safely be ignored.
        }
      }
    },
    [actorId],
  );

  const sync = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/calls?orderId=${encodeURIComponent(orderId)}`,
        { cache: "no-store" },
      );
      if (!response.ok) return;
      const result = (await response.json()) as {
        call: CallRecord | null;
        candidates: CandidateRecord[];
      };
      const latest = result.call;
      setCall(latest);
      if (!latest) return;

      if (["ended", "declined", "missed"].includes(latest.status)) {
        if (phaseRef.current !== "idle") {
          releaseMedia();
          updatePhase("idle");
        }
        return;
      }

      if (
        latest.status === "ringing" &&
        latest.initiator_id !== actorId &&
        phaseRef.current === "idle"
      ) {
        callIdRef.current = latest.id;
        seenCandidatesRef.current.clear();
        updatePhase("incoming");
        return;
      }

      const isParticipant =
        latest.initiator_id === actorId || latest.answered_by === actorId;
      if (!isParticipant) return;
      callIdRef.current = latest.id;

      const peer = peerRef.current;
      if (
        peer &&
        latest.initiator_id === actorId &&
        latest.answer_sdp &&
        !peer.remoteDescription
      ) {
        await peer.setRemoteDescription(
          JSON.parse(latest.answer_sdp) as RTCSessionDescriptionInit,
        );
        updatePhase("connecting");
      }
      await addRemoteCandidates(result.candidates);
    } catch {
      // Polling will retry while the conversation remains open.
    }
  }, [actorId, addRemoteCandidates, orderId, releaseMedia, updatePhase]);

  useEffect(() => {
    const firstSync = window.setTimeout(() => void sync(), 0);
    const timer = window.setInterval(sync, 1500);
    return () => {
      window.clearTimeout(firstSync);
      window.clearInterval(timer);
    };
  }, [sync]);

  useEffect(
    () => () => {
      const callId = callIdRef.current;
      if (callId && phaseRef.current !== "idle") {
        void fetch("/api/calls", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action: phaseRef.current === "incoming" ? "decline" : "end",
            callId,
          }),
          keepalive: true,
        });
      }
      releaseMedia();
    },
    [releaseMedia],
  );

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      onNotice("Voice calling is not supported on this device.");
      return;
    }
    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      const peer = await createPeer(stream);
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const result = await request({
        action: "start",
        orderId,
        offer: JSON.stringify(peer.localDescription),
      });
      const created = result.call as CallRecord;
      callIdRef.current = created.id;
      seenCandidatesRef.current.clear();
      setCall(created);
      updatePhase("calling");
      for (const candidate of pendingCandidatesRef.current.splice(0)) {
        void sendCandidate(candidate);
      }
    } catch (error) {
      releaseMedia();
      updatePhase("idle");
      onNotice(error instanceof Error ? error.message : "Could not start the call.");
    } finally {
      setBusy(false);
    }
  };

  const answer = async () => {
    if (!call?.offer_sdp) return;
    setBusy(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      callIdRef.current = call.id;
      const peer = await createPeer(stream);
      await peer.setRemoteDescription(
        JSON.parse(call.offer_sdp) as RTCSessionDescriptionInit,
      );
      const answerDescription = await peer.createAnswer();
      await peer.setLocalDescription(answerDescription);
      await request({
        action: "answer",
        callId: call.id,
        answer: JSON.stringify(peer.localDescription),
      });
      updatePhase("connecting");
      for (const candidate of pendingCandidatesRef.current.splice(0)) {
        void sendCandidate(candidate);
      }
      await sync();
    } catch (error) {
      releaseMedia();
      updatePhase("idle");
      onNotice(error instanceof Error ? error.message : "Could not answer the call.");
    } finally {
      setBusy(false);
    }
  };

  const finish = async (decline = false) => {
    const callId = callIdRef.current || call?.id;
    if (callId) {
      try {
        await request({ action: decline ? "decline" : "end", callId });
      } catch {
        // Local teardown should still happen when the network request fails.
      }
    }
    releaseMedia();
    updatePhase("idle");
    setCall(null);
  };

  const callUnavailable =
    call && ["ringing", "active"].includes(call.status) && phase === "idle";

  return (
    <>
      <button
        className="chat-call-button"
        disabled={busy || Boolean(callUnavailable)}
        onClick={start}
        aria-label="Start an internet voice call"
      >
        <Phone />
        <span>{callUnavailable ? "Call in progress" : "Voice call"}</span>
      </button>
      <audio ref={remoteAudioRef} autoPlay />

      {phase !== "idle" && (
        <div className="call-overlay" role="dialog" aria-modal="true">
          <div className="call-avatar">
            {phase === "incoming" ? <Phone /> : <Mic />}
          </div>
          <span className="call-label">
            {phase === "incoming"
              ? "INCOMING KOLA CALL"
              : phase === "connected"
                ? "VOICE CALL CONNECTED"
                : phase === "calling"
                  ? "CALLING ORDER PARTICIPANTS"
                  : "CONNECTING CALL"}
          </span>
          <h3>
            {phase === "incoming"
              ? call?.initiator_name ?? "Order participant"
              : `Order ${orderId}`}
          </h3>
          <p>
            {phase === "incoming"
              ? `Voice call about order ${orderId}`
              : phase === "connected"
                ? "Your internet call is private to this order."
                : "Waiting for another participant to answer…"}
          </p>
          <div className="call-actions">
            {phase === "incoming" ? (
              <>
                <button className="decline" disabled={busy} onClick={() => finish(true)}>
                  <PhoneOff />
                  Decline
                </button>
                <button className="answer" disabled={busy} onClick={answer}>
                  <Phone />
                  Answer
                </button>
              </>
            ) : (
              <button className="decline" onClick={() => finish(false)}>
                <PhoneOff />
                End call
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}
