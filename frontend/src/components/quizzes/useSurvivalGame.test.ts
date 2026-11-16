import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { answerSurvival, startSurvival } from "../../api/survival";
import type { SurvivalAnswerResult, SurvivalSession } from "../../types/survival";
import { useSurvivalGame } from "./useSurvivalGame";

vi.mock("../../api/survival", async (original) => ({
  ...await original<typeof import("../../api/survival")>(),
  startSurvival: vi.fn(), getSurvivalSession: vi.fn(), answerSurvival: vi.fn(),
}));

afterEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });

const key = "studyforge:survival:1:42";
const question = { id: 101, position: 1, text: "Which is last in, first out?", options: ["Stack", "Queue"] };
const state = (overrides: Partial<SurvivalSession> = {}): SurvivalSession => ({
  id: 7, quiz_id: 9, course: 42, status: "ACTIVE", lives: 3, max_lives: 3, score: 0,
  current_position: 1, total_questions: 10, current_question: question, started_at: "", ended_at: null, ...overrides,
});

const renderGame = (onStart = vi.fn()) =>
  renderHook(() => useSurvivalGame({ courseId: 42, accessToken: "tok", storageKey: key, onStart }));

it("starts a game, remembers it for a reload and tells the panel", async () => {
  vi.mocked(startSurvival).mockResolvedValue(state());
  const onStart = vi.fn();
  const { result } = renderGame(onStart);
  await act(() => result.current.start([1, 2], 10));

  expect(startSurvival).toHaveBeenCalledWith(42, [1, 2], 10, "tok", expect.any(AbortSignal));
  expect(result.current.session).toMatchObject({ id: 7, lives: 3 });
  expect(JSON.parse(sessionStorage.getItem(key) ?? "null")).toEqual({ sessionId: 7, documentIds: [1, 2] });
  expect(onStart).toHaveBeenCalledOnce();
});

it("sends only one answer when two arrive before the first returns", async () => {
  vi.mocked(startSurvival).mockResolvedValue(state());
  let finish: (value: SurvivalAnswerResult) => void = () => {};
  vi.mocked(answerSurvival).mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  const { result } = renderGame();
  await act(() => result.current.start([1], 10));

  // Both calls happen in the same tick, before React re-renders anything.
  act(() => { result.current.answer(0); result.current.answer(1); });
  expect(answerSurvival).toHaveBeenCalledTimes(1);

  const next = state({ score: 1, current_position: 2 });
  await act(async () => finish({ question_id: 101, selected_option_index: 0, is_correct: true, correct_option_index: 0, explanation: "", session: next }));
  expect(result.current.session?.score).toBe(1);
  expect(result.current.feedback?.question.id).toBe(101);
});

it("plays again with the last materials and the finished game's length", async () => {
  vi.mocked(startSurvival).mockResolvedValueOnce(state()).mockResolvedValueOnce(state({ id: 8 }));
  vi.mocked(answerSurvival).mockResolvedValue({
    question_id: 101, selected_option_index: 1, is_correct: false, correct_option_index: 0, explanation: "",
    session: state({ status: "GAME_OVER", lives: 0, current_question: null, ended_at: "x" }),
  });
  const { result } = renderGame();
  await act(() => result.current.start([3], 10));
  await act(() => result.current.answer(1));
  await act(async () => result.current.playAgain());

  expect(startSurvival).toHaveBeenLastCalledWith(42, [3], 10, "tok", expect.any(AbortSignal));
  expect(result.current.session?.id).toBe(8);
  expect(result.current.feedback).toBeNull();
});
