import { afterEach, expect, it, vi } from "vitest";
import { generateQuiz, getQuizResults, QuizRequestError, submitQuiz } from "./quizzes";

afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(typeof body === "string" ? body : JSON.stringify(body), { status }));

it("posts the selected documents and length with the bearer token", async () => {
  const fetchMock = reply(201, { id: 3 });
  vi.stubGlobal("fetch", fetchMock);
  await generateQuiz(7, [1, 2], 10, "tok");
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("http://api.test/api/v1/courses/7/quizzes/");
  expect(init.method).toBe("POST");
  expect(JSON.parse(init.body)).toEqual({ document_ids: [1, 2], num_questions: 10 });
  expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok");
});

it("sends every answer, including null for a skipped question", async () => {
  const fetchMock = reply(201, { quiz_id: 3 });
  vi.stubGlobal("fetch", fetchMock);
  await submitQuiz(3, [{ question_id: 1, selected_option_index: null }], "tok");
  expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/api/v1/quizzes/3/submit/");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ answers: [{ question_id: 1, selected_option_index: null }] });
});

it("reads graded results", async () => {
  vi.stubGlobal("fetch", reply(200, { quiz_id: 3, score: 4 }));
  await expect(getQuizResults(3, "tok")).resolves.toMatchObject({ score: 4 });
});

it("keeps the backend code and offending document ids on a 409", async () => {
  vi.stubGlobal("fetch", reply(409, { code: "DOCUMENT_NOT_READY", detail: "x", document_ids: [2] }));
  await expect(generateQuiz(7, [2], 5, "tok")).rejects.toMatchObject({ status: 409, code: "DOCUMENT_NOT_READY", documentIds: [2] });
});

it("falls back to an empty code when the error body is not JSON", async () => {
  vi.stubGlobal("fetch", reply(502, "<html>Bad gateway</html>"));
  const error = await generateQuiz(7, [2], 5, "tok").catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(QuizRequestError);
  expect(error).toMatchObject({ status: 502, code: "" });
});
