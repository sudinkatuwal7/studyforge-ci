import { useEffect, useRef, useState } from "react";
import { generateQuiz, getQuiz, getQuizResults, QuizRequestError, submitQuiz } from "../../api/quizzes";
import { useAuth } from "../../context/AuthContext";
import type { TrackedDocument } from "../../types/document";
import type { Quiz, QuizAnswer, QuizLength, QuizResult } from "../../types/quiz";
import type { QuizMode } from "../../types/survival";
import QuizPlayer from "./QuizPlayer";
import QuizResults from "./QuizResults";
import QuizSetup from "./QuizSetup";
import SurvivalGame from "./SurvivalGame";
import SurvivalSummary from "./SurvivalSummary";
import { generateErrorMessage } from "./quizErrors";
import { hasSavedGame, survivalStorageKey, useSurvivalGame } from "./useSurvivalGame";

type Props = { courseId: number; materials: TrackedDocument[] };

// The open quiz's id survives a reload; the quiz itself and any grade are refetched.
function quizKey(userId: number, courseId: number) { return `studyforge:quiz:${userId}:${courseId}`; }
function readQuizId(key: string): number | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (Number.isSafeInteger(value)) return value as number;
  } catch { /* Private browsing or a stale entry: start fresh. */ }
  return null;
}
function saveQuizId(key: string, quizId: number | null) {
  try {
    if (quizId === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, String(quizId));
  } catch { /* The quiz stays open until the page reloads. */ }
}

function submitErrorMessage(cause: unknown): string {
  if (cause instanceof QuizRequestError && cause.status === 400) return "Your answers could not be accepted. Reload the page and start a new quiz.";
  return "Your answers could not be submitted. They are still here, so try again.";
}

export default function QuizPanel(props: Props) {
  const { accessToken, user } = useAuth();
  if (!accessToken || !user) return <p role="alert">Sign in to take a quiz.</p>;
  // A new account or course starts from a clean slate.
  return <Quizzes key={`${user.id}:${props.courseId}`} {...props} accessToken={accessToken}
    storageKey={quizKey(user.id, props.courseId)} survivalKey={survivalStorageKey(user.id, props.courseId)} />;
}

type QuizzesProps = Props & { accessToken: string; storageKey: string; survivalKey: string };

// Chooses the screen and runs the regular quiz. Survival's logic lives in useSurvivalGame.
function Quizzes({ courseId, materials, accessToken, storageKey, survivalKey }: QuizzesProps) {
  const game = useSurvivalGame({ courseId, accessToken, storageKey: survivalKey, onStart: () => saveQuizId(storageKey, null) });
  // Selection, length and mode live here, not in QuizSetup, so "Take another quiz" keeps them.
  const [mode, setMode] = useState<QuizMode>(() => hasSavedGame(survivalKey) ? "survival" : "regular");
  const [selected, setSelected] = useState<string[]>([]);
  const [length, setLength] = useState<QuizLength>(5);
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // A saved Survival game takes priority; the hook restores that one.
  const [restoring, setRestoring] = useState(() => !hasSavedGame(survivalKey) && readQuizId(storageKey) !== null);
  const controller = useRef<AbortController | null>(null);

  // Cancel any request still in flight when the student leaves the course.
  useEffect(() => () => controller.current?.abort(), []);

  // After a reload, reopen the quiz the student had open: its results if it was submitted.
  useEffect(() => {
    const savedId = restoring ? readQuizId(storageKey) : null;
    if (savedId === null) return;
    controller.current?.abort();
    controller.current = new AbortController();
    const signal = controller.current.signal;
    (async () => {
      try {
        const saved = await getQuiz(savedId, accessToken, signal);
        if (signal.aborted) return;
        if (saved.is_submitted) setResult(await getQuizResults(savedId, accessToken, signal));
        else setQuiz(saved);
      } catch (cause) {
        if (signal.aborted) return;
        // 404: the quiz was deleted or belongs to someone else, so forget it quietly.
        if (cause instanceof QuizRequestError && cause.status === 404) saveQuizId(storageKey, null);
        else setError("Your last quiz could not be loaded. Reload the page to try again, or start a new quiz.");
      } finally {
        if (!signal.aborted) setRestoring(false);
      }
    })();
    // Once restored, a refreshed token must not refetch or abort a submit in flight.
  }, [accessToken, storageKey, restoring]);

  const begin = () => {
    controller.current?.abort();
    controller.current = new AbortController();
    setBusy(true);
    setError("");
    return controller.current.signal;
  };

  const generate = async (documentIds: number[]) => {
    const signal = begin();
    try {
      const created = await generateQuiz(courseId, documentIds, length, accessToken, signal);
      if (signal.aborted) return;
      game.exit();
      saveQuizId(storageKey, created.id);
      // Defensive: a quiz returned already graded goes straight to its results.
      if (created.is_submitted) setResult(await getQuizResults(created.id, accessToken, signal));
      else setQuiz(created);
    } catch (cause) {
      if (!signal.aborted) setError(generateErrorMessage(cause));
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  };

  const submit = async (answers: QuizAnswer[]) => {
    if (!quiz) return;
    const signal = begin();
    try {
      setResult(await submitQuiz(quiz.id, answers, accessToken, signal));
    } catch (cause) {
      if (signal.aborted) return;
      if (cause instanceof QuizRequestError && cause.code === "QUIZ_ALREADY_SUBMITTED") {
        // Submitted from another tab or an earlier attempt: show that grade.
        try {
          setResult(await getQuizResults(quiz.id, accessToken, signal));
        } catch (second) {
          if (!signal.aborted) setError(submitErrorMessage(second));
        }
      } else setError(submitErrorMessage(cause));
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  };

  const restart = () => { saveQuizId(storageKey, null); setQuiz(null); setResult(null); setError(""); };

  if (restoring || game.restoring) return <p role="status">Loading your quiz…</p>;
  const { session } = game;
  // Feedback for the final answer is shown before the summary, so the student sees what they got wrong.
  if (session && (game.feedback || session.status === "ACTIVE")) {
    return <SurvivalGame session={session} feedback={game.feedback} answering={game.busy} error={game.error} notice={game.notice}
      onAnswer={game.answer} onContinue={game.next} />;
  }
  if (session) {
    return <SurvivalSummary key={session.id} session={session} busy={game.busy} review={game.review} reviewState={game.reviewState}
      onReview={game.loadReview} onPlayAgain={game.playAgain} onExit={game.exit} />;
  }
  if (result) return <QuizResults result={result} onRestart={restart} />;
  if (quiz) return <QuizPlayer key={quiz.id} quiz={quiz} submitting={busy} error={error} onSubmit={submit} />;
  return <QuizSetup mode={mode} onModeChange={setMode} materials={materials} selected={selected} onSelectedChange={setSelected}
    length={length} onLengthChange={setLength} busy={busy || game.busy} error={mode === "survival" ? game.error : error}
    onGenerate={mode === "survival" ? (documentIds) => game.start(documentIds, length) : generate} />;
}
