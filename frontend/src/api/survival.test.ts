import { afterEach, expect, it, vi } from "vitest";
import { QuizRequestError } from "./quizzes";
import { answerSurvival, getSurvivalSession, startSurvival, SurvivalRequestError } from "./survival";

afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

const session = { id: 7, status: "ACTIVE", lives: 2, max_lives: 3, score: 1, current_position: 3, total_questions: 5 };

it("starts a game with the selected documents and length", async () => {
  const fetchMock = reply(201, session);
  vi.stubGlobal("fetch", fetchMock);
  await expect(startSurvival(3, [1, 2], 10, "tok")).resolves.toMatchObject({ id: 7 });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("http://api.test/api/v1/courses/3/survival-sessions/");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({ document_ids: [1, 2], num_questions: 10 });
  expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok");
});

it("reads the session state without caching", async () => {
  const fetchMock = reply(200, session);
  vi.stubGlobal("fetch", fetchMock);
  await expect(getSurvivalSession(7, "tok")).resolves.toMatchObject({ lives: 2 });
  expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/api/v1/survival-sessions/7/");
  expect(fetchMock.mock.calls[0][1].cache).toBe("no-store");
});

it("answers the current question", async () => {
  const fetchMock = reply(200, { question_id: 103, is_correct: true, session });
  vi.stubGlobal("fetch", fetchMock);
  await answerSurvival(7, 103, 2, "tok");
  expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/api/v1/survival-sessions/7/answers/");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ question_id: 103, selected_option_index: 2 });
});

it.each(["QUESTION_NOT_CURRENT", "SURVIVAL_SESSION_ENDED"])("keeps the server's session on a 409 %s", async (code) => {
  vi.stubGlobal("fetch", reply(409, { code, detail: "x", session }));
  const error = await answerSurvival(7, 103, 0, "tok").catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(SurvivalRequestError);
  expect(error).toBeInstanceOf(QuizRequestError);
  expect(error).toMatchObject({ status: 409, code, session: { id: 7, lives: 2 } });
});

it("keeps quiz-generation codes and document ids when a start fails", async () => {
  vi.stubGlobal("fetch", reply(409, { code: "DOCUMENT_NOT_READY", document_ids: [2] }));
  await expect(startSurvival(3, [2], 5, "tok")).rejects.toMatchObject({ code: "DOCUMENT_NOT_READY", documentIds: [2], session: null });
});

it("falls back to an empty code and no session when the error body is not JSON", async () => {
  vi.stubGlobal("fetch", reply(502, "<html>Bad gateway</html>"));
  await expect(getSurvivalSession(7, "tok")).rejects.toMatchObject({ status: 502, code: "", session: null });
});
