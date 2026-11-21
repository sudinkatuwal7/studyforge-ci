import { afterEach, expect, it, vi } from "vitest";
import { getQuizProgress, listQuizHistory } from "./quizHistory";
import { QuizRequestError } from "./quizzes";

afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body: unknown) =>
  vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));

it("lists every course's history with the bearer token and no caching", async () => {
  const fetchMock = reply(200, [{ quiz_id: 3 }]);
  vi.stubGlobal("fetch", fetchMock);
  await expect(listQuizHistory("tok")).resolves.toEqual([{ quiz_id: 3 }]);
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("http://api.test/api/v1/quiz-history/");
  expect(init.cache).toBe("no-store");
  expect(new Headers(init.headers).get("Authorization")).toBe("Bearer tok");
});

it("filters by course", async () => {
  const fetchMock = reply(200, []);
  vi.stubGlobal("fetch", fetchMock);
  await listQuizHistory("tok", 7);
  expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/api/v1/quiz-history/?course=7");
});

it("treats a null course as no filter", async () => {
  const fetchMock = reply(200, []);
  vi.stubGlobal("fetch", fetchMock);
  await listQuizHistory("tok", null);
  expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/api/v1/quiz-history/");
});

it("reads a course's progress", async () => {
  const fetchMock = reply(200, { course: 7, quizzes_taken: 2 });
  vi.stubGlobal("fetch", fetchMock);
  await expect(getQuizProgress(7, "tok")).resolves.toMatchObject({ quizzes_taken: 2 });
  expect(fetchMock.mock.calls[0][0]).toBe("http://api.test/api/v1/courses/7/quiz-progress/");
  expect(fetchMock.mock.calls[0][1].cache).toBe("no-store");
});

it("reports another student's course as a 404 error", async () => {
  vi.stubGlobal("fetch", reply(404, { detail: "Not found." }));
  const error = await listQuizHistory("tok", 9).catch((cause: unknown) => cause);
  expect(error).toBeInstanceOf(QuizRequestError);
  expect(error).toMatchObject({ status: 404 });
});
