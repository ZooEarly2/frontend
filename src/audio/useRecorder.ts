import { useCallback, useEffect, useRef, useState } from 'react';
import type { RecordingFile } from '@/api/endpoints';
import { setMicOpen } from '@/audio/speaker';

/** 게이트웨이가 정한 상한. 넘기면 400 이라 앱이 먼저 끊는다. */
export const MAX_RECORDING_MS = 30_000;

export type RecorderError = 'PERMISSION_DENIED' | 'UNSUPPORTED' | 'FAILED';

type UseRecorder = {
  isRecording: boolean;
  /** 0~1. 30초 한도 대비 진행률 — 마이크 버튼의 링이 이 값으로 찬다. */
  progress: number;
  /** 0~1. 지금 들어오는 소리 크기. 녹음 중이라는 걸 눈으로 보여주는 데 쓴다. */
  level: number;
  error: RecorderError | null;
  start: () => Promise<void>;
  /** 녹음을 끝내고 올릴 파일을 돌려준다. 실패하면 null. */
  stop: () => Promise<RecordingFile | null>;
};

/** 게이트웨이가 받는 세 컨테이너 중 이 브라우저가 만들 수 있는 것을 고른다. */
function pickMimeType(): { mimeType: string; ext: string } | null {
  const candidates: { mimeType: string; ext: string }[] = [
    { mimeType: 'audio/webm;codecs=opus', ext: 'webm' },
    { mimeType: 'audio/webm', ext: 'webm' },
    { mimeType: 'audio/mp4', ext: 'm4a' }, // 사파리
    { mimeType: 'audio/wav', ext: 'wav' },
  ];
  if (typeof MediaRecorder === 'undefined') return null;
  return candidates.find((c) => MediaRecorder.isTypeSupported(c.mimeType)) ?? null;
}

/**
 * 마이크 녹음.
 *
 * 스트리밍이 아니다 — 파일 하나를 통째로 올리는 multipart 라, 멈춰서 파일이
 * 확정된 뒤에야 요청을 보낸다. 30초를 넘기면 스스로 멈추고 그 녹음을 그대로 넘긴다
 * (버리면 아이는 30초를 말하고도 아무 반응을 못 받는다).
 */
export function useRecorder(onLimitReached?: (audio: RecordingFile) => void): UseRecorder {
  const [isRecording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<RecorderError | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startedAtRef = useRef(0);
  const extRef = useRef('webm');
  // setTimeout 이 잡아둔 클로저가 낡지 않도록 최신 콜백을 ref 로 들고 있는다.
  const limitCallback = useRef(onLimitReached);
  limitCallback.current = onLimitReached;

  const teardown = useCallback(() => {
    setMicOpen(false);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    setLevel(0);
    setProgress(0);
  }, []);

  useEffect(() => teardown, [teardown]);

  const finish = useCallback(async (): Promise<RecordingFile | null> => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder || recorder.state === 'inactive') {
      teardown();
      setRecording(false);
      return null;
    }

    const blob = await new Promise<Blob>((resolve) => {
      recorder.addEventListener(
        'stop',
        () => resolve(new Blob(chunksRef.current, { type: recorder.mimeType })),
        { once: true },
      );
      recorder.stop();
    });

    teardown();
    setRecording(false);
    if (blob.size === 0) {
      setError('FAILED');
      return null;
    }
    return { blob, filename: `speech.${extRef.current}` };
  }, [teardown]);

  const start = useCallback(async () => {
    setError(null);
    const picked = pickMimeType();
    if (!picked || !navigator.mediaDevices?.getUserMedia) {
      setError('UNSUPPORTED');
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          // 사람 목소리 하나를 담는데 스테레오는 파일만 두 배로 키운다.
          // ideal 로 준다 — exact 로 주면 못 맞추는 기기에서 녹음이 아예 안 된다.
          channelCount: { ideal: 1 },
        },
      });
    } catch {
      // 권한 거부와 마이크 없음을 같게 다룬다 — 아이가 할 수 있는 일은 어느 쪽이든 없다.
      setError('PERMISSION_DENIED');
      return;
    }

    try {
      streamRef.current = stream;
      extRef.current = picked.ext;
      /*
       * 비트레이트를 지정하지 않으면 브라우저가 음악 기준(~256kbps)으로 잡는다.
       * 3.5초 녹음이 109KB 였다(실측). 말소리에는 32kbps 면 충분해서 —
       * 음성 통화 앱들이 20kbps 대를 쓴다 — 열 배 넘게 줄어든다.
       * 아이가 말한 뒤 기다리는 시간은 업로드가 끝나야 시작한다.
       */
      const recorder = new MediaRecorder(stream, {
        mimeType: picked.mimeType,
        audioBitsPerSecond: 32_000,
      });
      chunksRef.current = [];
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      });
      recorder.start();
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      setRecording(true);
      // 말풍선 자동 낭독이 스피커로 나가면 그 소리가 그대로 녹음에 섞인다.
      setMicOpen(true);

      // 소리 크기를 재서 마이크 버튼이 숨쉬듯 커지게 한다.
      // 녹음 중이라는 걸 아이가 알 수 있는 유일한 신호라 장식이 아니다.
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const buffer = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(buffer);
        let sum = 0;
        for (let i = 0; i < buffer.length; i += 1) {
          const v = (buffer[i] - 128) / 128;
          sum += v * v;
        }
        setLevel(Math.min(1, Math.sqrt(sum / buffer.length) * 4));
        setProgress(Math.min(1, (Date.now() - startedAtRef.current) / MAX_RECORDING_MS));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      timerRef.current = setTimeout(() => {
        void finish().then((audio) => {
          if (audio) limitCallback.current?.(audio);
        });
      }, MAX_RECORDING_MS);
    } catch {
      teardown();
      setRecording(false);
      setError('FAILED');
    }
  }, [finish, teardown]);

  return { isRecording, progress, level, error, start, stop: finish };
}
