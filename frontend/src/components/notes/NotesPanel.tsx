import { useEffect, useRef, useState } from "react";
import { generateNotes, getNotes, NotesRequestError } from "../../api/notes";
import { useAuth } from "../../context/AuthContext";
import type { MaterialsLoadState, TrackedDocument } from "../../types/document";
import { DEFAULT_NOTES_OPTIONS, type CourseNotes, type NotesOptions } from "../../types/notes";
