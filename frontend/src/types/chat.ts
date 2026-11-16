import type { ReactNode } from "react";

// References retain the real backend document ID needed for grounding.
export type CourseMaterialReference = {
  id: string;
  name: string;
  detail: string;
  available: boolean;
  source: "course";
  documentId: number;
  status: string;
};

// Conversation uploads remain separate from ordinary course materials.
export type ChatUploadReference = {
  id: string;
  name: string;
  detail: string;
  available: boolean;
  source: "upload";
  documentId: number;
  status: string;
};

export type ChatReference = CourseMaterialReference | ChatUploadReference;
// Where a citation can be opened. Demo citations have no source and cannot be opened.
export type CitationSource = {
  documentId: number; name: string | null; format: "pdf" | "docx" | "pptx" | null; page: number; available: boolean;
};
// Citation display data is deliberately independent from backend response shapes.
export type ChatCitation = { id: string; label: string; detail: string; source?: CitationSource };
// What Pandu did to answer, e.g. "Searched course materials" with per-source details.
export type ChatToolUse = { id: string; summary: string; details: string[] };
// serverId links a message to the saved history; state marks a question without an answer.
export type ChatMessage = {
  id: string; role: "user" | "assistant"; text: string; citations?: ChatCitation[]; tools?: ChatToolUse[];
  serverId?: number; state?: "sending" | "pending" | "failed";
};
export type ChatStatus = "idle" | "sending" | "streaming" | "error";
export type ChatThread = { id: number; title: string; updatedAt: string };

export type ChatThreadsProps = {
  items: ChatThread[];
  activeId: number | null;
  loading?: boolean;
  error?: string;
  creating?: boolean;
  deletingId?: number | null;
  onSelect: (id: number) => void;
  onCreate: () => void;
  onDelete: (id: number) => void;
  onRetry?: () => void;
};

// The workspace supplies real conversation state through these callbacks.
export type CourseChatProps = {
  courseId: number;
  messages: ChatMessage[];
  references: ChatReference[];
  selectedReferences: string[];
  status: ChatStatus;
  error?: string;
  demo?: boolean;
  onSend: (text: string, documentIds: number[]) => void;
  onStop?: () => void;
  onRetry?: () => void;
  onReferencesChange: (ids: string[]) => void;
  onAddDocuments: (files: File[]) => void;
  onCitation: (citation: ChatCitation) => void;
  uploadProgress?: number | null;
  uploadError?: string;
  uploading?: boolean;
  loadingReferences?: boolean;
  referenceError?: string;
  onRetryReferences?: () => void;
  uploadStatusViews?: ReactNode;
  chatReady?: boolean;
  // Saved history (connected chat only).
  threads?: ChatThreadsProps;
  historyLoading?: boolean;
  historyError?: string;
  onReloadHistory?: () => void;
  onRetryMessage?: (message: ChatMessage) => void;
  onDeleteUpload?: (documentId: number) => void;
  deletingUploadId?: number | null;
  uploadDeleteError?: string;
  notice?: string;
  onDismissNotice?: () => void;
};
