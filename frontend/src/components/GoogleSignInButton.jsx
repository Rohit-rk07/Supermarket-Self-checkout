import { useState, useEffect, useRef } from "react";
import { Box, Typography, Alert, CircularProgress } from "@mui/material";
import { useAuth } from "../context/AuthContext";

const GOOGLE_SCRIPT = "https://accounts.google.com/gsi/client";

// Loads Google's sign-in script once, however many times it is asked for
const loadGoogleScript = () =>
  new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT}"]`);
    const script = existing || Object.assign(document.createElement("script"), { src: GOOGLE_SCRIPT, async: true, defer: true });
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Could not load Google sign-in. Check your internet connection.")), { once: true });
    if (!existing) document.head.appendChild(script);
  });

// Google's own "Continue with Google" button, with its loading and error messages.
// Used on the sign-in page and in the sign-in pop-up. onSignedIn runs after the server accepted the sign-in.
const GoogleSignInButton = ({ onSignedIn }) => {
  const { loginWithGoogle, error } = useAuth();
  const buttonRef = useRef(null);
  // Kept in refs so Google's button is set up once, not again on every render
  const loginRef = useRef(loginWithGoogle);
  const doneRef = useRef(onSignedIn);
  loginRef.current = loginWithGoogle;
  doneRef.current = onSignedIn;
  const [status, setStatus] = useState("loading"); // loading | ready | notConfigured | failed
  const [signingIn, setSigningIn] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const setUp = async () => {
      try {
        const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/auth/config`);
        const body = await response.json();
        const clientId = body?.data?.googleClientId;
        if (!clientId) {
          if (!cancelled) setStatus("notConfigured");
          return;
        }

        await loadGoogleScript();
        if (cancelled) return;

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async ({ credential }) => {
            setSigningIn(true);
            try {
              await loginRef.current(credential);
              doneRef.current?.();
            } catch {
              // The message is shown from the auth context
            }
            setSigningIn(false);
          },
        });
        window.google.accounts.id.renderButton(buttonRef.current, {
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          width: Math.min(360, buttonRef.current?.offsetWidth || 320),
          logo_alignment: "left",
        });
        setStatus("ready");
      } catch (err) {
        if (!cancelled) {
          setLoadError(err.message || "Could not reach the server.");
          setStatus("failed");
        }
      }
    };

    setUp();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {status === "notConfigured" && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Sign-in is not set up on this server yet. The shop owner needs to add the Google client id.
        </Alert>
      )}

      {status === "failed" && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {loadError}
        </Alert>
      )}

      {/* Google draws its own button inside this box */}
      <Box sx={{ minHeight: 44, display: status === "ready" && !signingIn ? "block" : "none" }}>
        <div ref={buttonRef} />
      </Box>

      {(status === "loading" || signingIn) && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, color: "text.secondary" }} role="status">
          <CircularProgress size={20} color="inherit" />
          <Typography>{signingIn ? "Signing you in..." : "Getting ready..."}</Typography>
        </Box>
      )}
    </Box>
  );
};

export default GoogleSignInButton;
