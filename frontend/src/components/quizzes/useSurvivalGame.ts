import { useEffect, useRef, useState } from "react";
import { getQuizResults, QuizRequestError } from "../../api/quizzes";
import { answerSurvival, getSurvivalSession, startSurvival, SurvivalRequestError } from "../../api/survival";
import { QUIZ_LENGTHS, type QuizLength, type QuizResult } from "../../types/quiz";
import type { SurvivalFeedback, SurvivalSession } from "../../types/survival";
import { generateErrorMessage } from "./quizErrors";

// The open game's id, and the materials it used so Play again can start the
// same game. Lives, score and question are never stored: they are refetched.
type SavedGame = { sessionId: number; documentIds: number[] };

export function survivalStorageKey(userId: number, courseId: number) { return `studyforge:survival:${userId}:${courseId}`; }

function readGame(key: string): SavedGame | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (value && typeof value === "object") {
      const { sessionId, documentIds } = value as Record<string, unknown>;
      if (Number.isSafeInteger(sessionId) && Array.isArray(documentIds) && documentIds.every(Number.isSafeInteger)) {
        return { sessionId: sessionId as number, documentIds: documentIds as number[] };
      }
    }
  } catch { /* Private browsing or a stale entry: start fresh. */ }
  return null;
}

function saveGame(key: string, game: SavedGame | null) {
  try {
    if (game === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, JSON.stringify(game));
  } catch { /* The game stays open until the page reloads. */ }
}

export function hasSavedGame(key: string) { return readGame(key) !== null; }

function answerErrorMessage(cause: unknown): string {
  if (cause instanceof QuizRequestError && cause.status === 400) return "That answer could not be accepted. No life was lost, so choose again.";
  return "Your answer could not be sent. Check your connection and try again.";
}

export type ReviewState = "idle" | "loading" | "error";

type Options = {
  courseId: number;
  accessToken: string;
  storageKey: string;
  // Called after a game starts, so the panel can forget an open regular quiz.
  onStart?: () => void;
};

/**
 * One Survival game for a course: start, resume after a reload, answer, review,
 * play again and exit. The server decides lives, score and correctness; this hook
 * only stores what the latest response said.
 */
export function useSurvivalGame({ courseId, accessToken, storageKey, onStart }: Options) {
  const [session, setSession] = useState<SurvivalSession | null>(null);
  // The question just answered, kept until Continue because the server has already moved on.
  const [feedback, setFeedback] = useState<SurvivalFeedback | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [review, setReview] = useState<QuizResult | null>(null);
  const [reviewState, setReviewState] = useState<ReviewState>("idle");
  const [restoring, setRestoring] = useState(() => hasSavedGame(storageKey));
  const controller = useRef<AbortController | null>(null);
  // Blocks a second click that lands before React re-renders the disabled buttons.
  const answering = useRef(false);
  const lastDocuments = useRef<number[]>([]);

  // Cancel any request still in flight when the student leaves the course.
  useEffect(() => () => controller.current?.abort(), []);

  // After a reload, reopen the saved game: still running, or its summary.
  useEffect(() => {
    const saved = restoring ? readGame(storageKey) : null;
    if (!saved) return;
    controller.current?.abort();
    controller.current = new AbortController();
    const signal = controller.current.signal;
    lastDocuments.current = saved.documentIds;
    (async () => {
      try {
        const restored = await getSurvivalSession(saved.sessionId, accessToken, signal);
        if (!signal.aborted) setSession(restored);
      } catch (cause) {
        if (signal.aborted) return;
        // 404: deleted or someone else's, so forget it quietly.
        if (cause instanceof QuizRequestError && cause.status === 404) saveGame(storageKey, null);
        else setError("Your last game could not be loaded. Reload the page to try again, or start a new game.");
      } finally {
        if (!signal.aborted) setRestoring(false);
      }
    })();
    // Once restored, a refreshed token must not refetch or abort a request in flight.
  }, [accessToken, storageKey, restoring]);

  const newSignal = () => {
    controller.current?.abort();
    controller.current = new AbortController();
    return controller.current.signal;
  };

  const begin = () => {
    setBusy(true);
    setError("");
    return newSignal();
  };

  const clearGame = () => {
    setSession(null);
    setFeedback(null);
    setNotice("");
    setReview(null);
    setReviewState("idle");
  };

  // Never retried automatically: each success generates a new quiz.
  const start = async (documentIds: number[], numQuestions: QuizLength) => {
    const signal = begin();
    try {
      const created = await startSurvival(courseId, documentIds, numQuestions, accessToken, signal);
      if (signal.aborted) return;
      lastDocuments.current = documentIds;
      saveGame(storageKey, { sessionId: created.id, documentIds });
      onStart?.();
      clearGame();
      setSession(created);
    } catch (cause) {
      if (signal.aborted) return;
      // A failed Play again returns to setup, where the error is shown and the student can adjust.
      saveGame(storageKey, null);
      clearGame();
      setError(generateErrorMessage(cause));
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  };

  const answer = async (optionIndex: number) => {
    const question = session?.current_question;
    if (!session || !question || answering.current) return;
    answering.current = true;
    const signal = begin();
    setNotice("");
    try {
      const answered = await answerSurvival(session.id, question.id, optionIndex, accessToken, signal);
      if (signal.aborted) return;
      setSession(answered.session);
      setFeedback({ question, result: answered });
    } catch (cause) {
      if (signal.aborted) return;
      if (cause instanceof SurvivalRequestError && cause.session) {
        // QUESTION_NOT_CURRENT (answered in another tab or by an earlier attempt)
        // or SURVIVAL_SESSION_ENDED: show the server's real state.
        setSession(cause.session);
        setFeedback(null);
        if (cause.code === "QUESTION_NOT_CURRENT") setNotice("That question was already answered, so here is where your game is now.");
      } else if (cause instanceof QuizRequestError && cause.status === 404) {
        saveGame(storageKey, null);
        clearGame();
        setError("This game could not be found. Start a new one.");
      } else setError(answerErrorMessage(cause));
    } finally {
      answering.current = false;
      if (!signal.aborted) setBusy(false);
    }
  };

  const next = () => setFeedback(null);

  // Forgets the game in this browser. Also used when a regular quiz starts.
  const exit = () => {
    saveGame(storageKey, null);
    clearGame();
    setError("");
  };

  const playAgain = () => {
    const length = session ? QUIZ_LENGTHS.find((option) => option === session.total_questions) : undefined;
    if (length && lastDocuments.current.length) start(lastDocuments.current, length);
    else exit();
  };

  // The finished game is saved as an ordinary quiz submission, so its review comes
  // from the regular results endpoint. A running game has no results (404).
  const loadReview = async () => {
    if (!session || session.status === "ACTIVE") return;
    const signal = newSignal();
    setReviewState("loading");
    try {
      const result = await getQuizResults(session.quiz_id, accessToken, signal);
      if (signal.aborted) return;
      setReview(result);
      setReviewState("idle");
    } catch {
      if (!signal.aborted) setReviewState("error");
    }
  };

  return { session, feedback, notice, busy, error, restoring, review, reviewState, start, answer, next, exit, playAgain, loadReview };
}
