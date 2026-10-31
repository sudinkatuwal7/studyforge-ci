# Course workspace

The authenticated `/courses/:courseId` page renders Materials, Notes, Quizzes, and Tasks beside the always-visible course chat partner **Pandu**. Desktop uses a roughly 70/30 content-to-chat split. At 1024px and below, independently scrollable course content is stacked above Pandu. The styling is scoped to course routes.

Materials retain real upload, rename, delete, and processing-status polling. Notes and Quizzes each pick from the course's `READY` materials with the shared `MaterialPicker`. Notes call the course notes endpoint in [notes-api.md](notes-api.md), and the open notes are restored after a reload without generating again. Tab changes keep every panel mounted, preserving material data, selections, and generated notes.

## Pandu presentation

`CourseChat` provides a minimal panel with a compact identity header, centered welcome state, suggested-prompt buttons, source picker, message history, citations, and a single-line composer. A neutral sparkle currently reserves the panda-icon position and can be replaced when the final asset is available.

The presentation supports `idle`, `sending`, `streaming`, and `error` states. Sending and streaming prevent duplicate messages and expose an optional Stop response action. The latest streaming assistant message displays an animated cursor; reduced-motion preferences disable that animation. Prompt suggestions fill the composer but do not send automatically.

## References and SCRUM-75 integration

Chat contracts live in `frontend/src/types/chat.ts`. A course reference contains its presentation ID, real backend `documentId`, processing detail, and availability. Only `READY` course materials can be selected. Before sending, `selectedCourseDocumentIds` converts selected UI references into numeric backend document IDs, and `onSend` receives both the text and those IDs.

`CourseChat` remains presentation-only and makes no API request. It receives messages, references, selected IDs, status, and callbacks for send, stop, retry, reference changes, attachments, and citations. SCRUM-75 can preserve this component and supply a real API-backed controller.

`DemoCourseChat` is the replaceable local controller. It clearly labels replies, citations, and attachments as samples and does not call an AI endpoint. Its `AbortController` cancels a pending response when Stop is selected or the course workspace unmounts. Local demo attachments store names in memory only and remain unavailable as grounded sources because they are not uploaded or processed.

`CourseMaterials.onMaterialsChange` publishes uploads, renames, deletions, and status updates to the workspace. Pandu therefore reuses the live material list without another list request or polling loop.

## Verification

The full frontend suite passed on October 23, 2026: 15 test files and 108 tests. Coverage includes course routing, material operations, study notes, workspace tabs, references, prompt selection, streaming presentation, errors, citations, and cancellation. Run `npm test`, `npm run lint`, and `npm run build` from `frontend/`.

Browser viewport and mobile-keyboard checks remain manual because browser automation is not installed in this workspace. Real streaming transport, AI responses, persistent chat uploads, and final panda artwork remain part of later integration work.
