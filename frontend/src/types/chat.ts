// Course references retain the real backend document ID needed for grounding.
export type CourseMaterialReference = {
  id: string;
  name: string;
  detail: string;
  available: boolean;
  source: "course";
  documentId: number;
};

// Chat uploads remain separate until SCRUM-75 defines their persistence contract.
export type ChatUploadReference = {
  id: string;
  name: string;
  detail: string;
  available: boolean;
  source: "upload";
};

export type ChatReference = CourseMaterialReference | ChatUploadReference;
// Citation display data is deliberately independent from backend response shapes.
export type ChatCitation = { id: string; label: string; detail: string };
export type ChatMessage = { id: string; role: "user" | "assistant"; text: string; citations?: ChatCitation[] };
export type ChatStatus = "idle" | "sending" | "streaming" | "error";

// SCRUM-75 can replace the demo adapter by supplying real state and callbacks here.
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
};
