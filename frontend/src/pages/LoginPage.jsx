import { useState, useEffect, useRef } from "react";
import { Box, Typography, Alert, CircularProgress } from "@mui/material";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import { Wordmark } from "../components/ui/TopBar";
import { tokens, fonts } from "../theme/theme";

const GOOGLE_SCRIPT = "https://accounts.google.com/gsi/client";

const steps = [
  "Scan each item with your phone camera, or type its barcode.",
  "Pay securely through Razorpay.",
  "Show the QR code on your receipt at the exit.",
];

// Loads Google's sign-in script once, however many times the page is opened
const loadGoogleScript = () =>
  new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT}"]`);
    const script = existing || Object.assign(document.createElement("script"), { src: GOOGLE_SCRIPT, async: true, defer: true });
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Could not load Google sign-in. Check your internet connection.")), { once: true });
    if (!existing) document.head.appendChild(script);
  });

const LoginPage = () => {
  const { user, loginWithGoogle, error, sessionExpired } = useAuth();
  const navigate = useNavigate();
  const buttonRef = useRef(null);
  // Kept in refs so Google's button is set up once, not again on every render
  const loginRef = useRef(loginWithGoogle);
  const navigateRef = useRef(navigate);
  loginRef.current = loginWithGoogle;
  navigateRef.current = navigate;
  const [status, setStatus] = useState("loading"); // loading | ready | notConfigured | failed
  const [signingIn, setSigningIn] = useState(false);
  const [loadError, setLoadError] = useState("");

  // Already signed in: go straight to the home page
  useEffect(() => {
    if (user) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  // Ask the server which Google client id to use, then draw Google's own button
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
              navigateRef.current("/dashboard", { replace: true });
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
    <Box sx={{ minHeight: "100vh", display: "grid", gridTemplateColumns: { xs: "1fr", md: "1.05fr 1fr" }, backgroundColor: "background.default" }}>
      {/* Brand panel */}
      <Box
        sx={{
          backgroundColor: tokens.forest,
          color: tokens.paper,
          px: { xs: 3, md: 8 },
          py: { xs: 3, md: 7 },
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: { xs: 0, md: 6 },
        }}
      >
        <Wordmark light />

        <Box sx={{ display: { xs: "none", md: "block" }, maxWidth: 460 }}>
          <Typography component="p" sx={{ fontFamily: fonts.serif, fontWeight: 700, fontSize: "2.75rem", lineHeight: 1.15, letterSpacing: "-0.01em" }}>
            Scan as you shop. Pay once. Walk out with your receipt.
          </Typography>
          <Box sx={{ mt: 5 }}>
            {steps.map((text) => (
              <Typography key={text} sx={{ py: 1.75, borderTop: "1px solid rgba(242, 244, 239, 0.22)", color: "rgba(242, 244, 239, 0.9)" }}>
                {text}
              </Typography>
            ))}
          </Box>
        </Box>

        <Box aria-hidden sx={{ display: { xs: "none", md: "block" }, borderTop: `3px double ${tokens.brass}`, width: 72 }} />
      </Box>

      {/* Sign in */}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", px: { xs: 3, sm: 6 }, py: { xs: 5, md: 7 } }}>
        <Box sx={{ width: "100%", maxWidth: 400 }}>
          <Typography component="h1" variant="h3" sx={{ mb: 1.5 }}>
            Sign in
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3.5 }}>
            Continue with your Google account. There is no password to remember, and new accounts are made for you.
          </Typography>

          {sessionExpired && !error && (
            <Alert severity="info" sx={{ mb: 3 }}>
              Your session has ended. Please sign in again.
            </Alert>
          )}

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {status === "notConfigured" && (
            <Alert severity="warning" sx={{ mb: 3 }}>
              Sign-in is not set up on this server yet. The shop owner needs to add the Google client id.
            </Alert>
          )}

          {status === "failed" && (
            <Alert severity="error" sx={{ mb: 3 }}>
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

          <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
            We only use your name and email to keep your receipts together. Payments are handled by Razorpay.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default LoginPage;
