// The parts of Google Identity Services (https://accounts.google.com/gsi/client)
// that StudyForge uses. The script adds window.google when it loads.

interface GoogleCredentialResponse {
  // The Google ID token (a JWT) that the backend verifies.
  credential: string;
}

interface GoogleIdConfiguration {
  client_id: string;
  callback: (response: GoogleCredentialResponse) => void;
  context?: "signin" | "signup";
  // Popup only: redirect mode would never call the callback above.
  ux_mode: "popup";
}

interface GoogleButtonOptions {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "large" | "medium" | "small";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "rectangular" | "pill" | "circle" | "square";
  logo_alignment?: "left" | "center";
  // Pixels, between 200 and 400.
  width?: string;
  // Called when the user clicks the button, before Google returns a credential.
  click_listener?: () => void;
}

interface GoogleAccountsId {
  initialize: (config: GoogleIdConfiguration) => void;
  renderButton: (parent: HTMLElement, options: GoogleButtonOptions) => void;
}

interface Window {
  google?: { accounts: { id: GoogleAccountsId } };
}