// SpeechRecognition is still exposed with a WebKit prefix in some browsers.
export type SpeechResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; [index: number]: { transcript: string } }>;
};

export type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export function recognitionConstructor(): SpeechRecognitionConstructor | undefined {
  const browser = window as Window & {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

export function microphoneError(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed") return "Microphone access was denied. Allow access in your browser settings, or type your question instead.";
  if (code === "audio-capture") return "No microphone was found. Connect a microphone, or type your question instead.";
  if (code === "no-speech") return "No speech was heard. Try speaking again, or type your question instead.";
  return "Voice input could not start. You can still type your question.";
}
