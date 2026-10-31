import { useRef, useState } from "react";

export type SignInLock = {
  // For the screen: disables the form and Google's button while a request runs.
  locked: boolean;
  // Returns false if another sign-in request is already running.
  acquire: () => boolean;
  release: () => void;
};

// Lets one sign-in request run at a time across the auth cards. Each successful response
// replaces the refresh cookie, so two at once could leave the app showing one
// account while the cookie, and so the next reload, belongs to the other.
export function useSignInLock(): SignInLock {
  const [locked, setLocked] = useState(false);
  // State only updates on the next render, so two events in a row need the ref.
  const lockedRef = useRef(false);

  return {
    locked,
    acquire() {
      if (lockedRef.current) return false;
      lockedRef.current = true;
      setLocked(true);
      return true;
    },
    release() {
      lockedRef.current = false;
      setLocked(false);
    },
  };
}
