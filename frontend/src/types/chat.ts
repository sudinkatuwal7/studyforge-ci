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
// Citation display data is deliberately independent from backend response shapes.
export type ChatCitation = { id: string; label: string; detail: string };
export type ChatMessage = { id: string; role: "user" | "assistant"; text: string; citations?: ChatCitation[] };
export type ChatStatus = "idle" | "sending" | "streaming" | "error";

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
  onRetry: () => void;
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
};
