import { useCallback, useEffect, useRef, useState } from 'react';

// Web Speech API 최소 타입 (lib.dom에 없음)
interface SRResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface SREvent {
  resultIndex: number;
  results: ArrayLike<SRResult>;
}
interface SR {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SREvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start(): void;
  stop(): void;
}
type SRCtor = new () => SR;

function getCtor(): SRCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function useSpeech(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const rec = useRef<SR | null>(null);
  const cb = useRef(onFinal);
  cb.current = onFinal;
  const supported = typeof window !== 'undefined' && !!getCtor();

  const stop = useCallback(() => {
    rec.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    setError('');
    const r = new Ctor();
    r.lang = 'ko-KR';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let tmp = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) cb.current(res[0].transcript.trim());
        else tmp += res[0].transcript;
      }
      setInterim(tmp);
    };
    r.onerror = (e) => setError(e.error === 'not-allowed' ? '마이크 권한이 거부되었습니다' : `음성 인식 오류: ${e.error}`);
    r.onend = () => {
      setListening(false);
      setInterim('');
    };
    rec.current = r;
    r.start();
    setListening(true);
  }, []);

  useEffect(() => () => rec.current?.stop(), []);

  return { supported, listening, interim, error, start, stop };
}
