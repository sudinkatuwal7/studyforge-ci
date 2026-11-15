import { useEffect, useRef, useState } from "react";
import { generateQuiz, getQuiz, getQuizResults, QuizRequestError, submitQuiz } from "../../api/quizzes";
import { useAuth } from "../../context/AuthContext";
import type { MaterialsLoadState, TrackedDocument } from "../../types/document";
import type { Quiz, QuizAnswer, QuizLength, QuizResult } from "../../types/quiz";
import type { QuizMode } from "../../types/survival";
import QuizPlayer from "./QuizPlayer";
import QuizResults from "./QuizResults";
import QuizSetup from "./QuizSetup";
import SurvivalGame from "./SurvivalGame";
import SurvivalSummary from "./SurvivalSummary";
import { generateErrorMessage } from "./quizErrors";
import { hasSavedGame, survivalStorageKey, useSurvivalGame } from "./useSurvivalGame";

// materialsState defaults to "ready" for callers that already have the final list.
type Props = { courseId: number; materials: TrackedDocument[]; materialsState?: MaterialsLoadState };

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
function Quizzes({ courseId, materials, materialsState = "ready", accessToken, storageKey, survivalKey }: QuizzesProps) {
  const game = useSurvivalGame({ courseId, accessToken, storageKey: survivalKey, onStart: () => saveQuizId(storageKey, null) });
  // Selection, length and mode live here, not in QuizSetup, so "Take another quiz" keeps them.
  const [mode, setMode] = useState<QuizMode>(() => hasSavedGame(survivalKey) ? "survival" : "regular");
