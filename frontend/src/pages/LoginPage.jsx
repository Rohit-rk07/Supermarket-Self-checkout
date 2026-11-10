import { useEffect } from "react";
import { Box, Typography, Alert, Button } from "@mui/material";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";
import { Wordmark } from "../components/ui/TopBar";
import GoogleSignInButton from "../components/GoogleSignInButton";
import { tokens, fonts } from "../theme/theme";

const steps = [
  "Scan each item with your phone camera, or type its barcode.",
  "Pay securely through Razorpay.",
  "Show the QR code on your receipt at the exit.",
];

// The full sign-in page. Shoppers normally never see it: the home page is open to everyone and asks to sign in only when needed.
// This page is for direct links, staff and admin pages, and an ended session.
const LoginPage = () => {
  const { user, sessionExpired, error } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Where to go after signing in: the page that sent the visitor here, or the home page
  const goTo = location.state?.from || "/dashboard";

  // Already signed in: go straight on
  useEffect(() => {
    if (user) navigate(goTo, { replace: true });
  }, [user, navigate, goTo]);

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
        <Wordmark sx={{ height: { xs: 48, md: 64 } }} />

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

          <GoogleSignInButton onSignedIn={() => navigate(goTo, { replace: true })} />

          <Typography variant="body2" color="text.secondary" sx={{ mt: 3 }}>
            We only use your name and email to keep your receipts together. Payments are handled by Razorpay.
          </Typography>

          <Button variant="text" sx={{ mt: 2, px: 0 }} onClick={() => navigate("/dashboard")}>
            Just looking? Go to the shop
          </Button>
        </Box>
      </Box>
    </Box>
  );
};

export default LoginPage;
