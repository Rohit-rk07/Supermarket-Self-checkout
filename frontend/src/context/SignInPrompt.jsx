import { createContext, useContext, useState, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { DialogTitle, DialogContent, Typography } from "@mui/material";
import GoogleSignInButton from "../components/GoogleSignInButton";
import Sheet from "../components/ui/Sheet";
import { useAuth } from "./AuthContext";

const SignInPromptContext = createContext({ promptSignIn: () => {} });

// Lets any screen ask the shopper to sign in at the moment it is needed (paying, opening the account).
// promptSignIn({ reason, returnTo }) opens a pop-up; after a good sign-in it goes to returnTo, if given.
export const SignInPromptProvider = ({ children }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState(null); // { reason, returnTo } while the pop-up is open
  const returnToRef = useRef(null);

  const promptSignIn = useCallback((options = {}) => {
    returnToRef.current = options.returnTo || null;
    setPrompt({ reason: options.reason || "Sign in to continue." });
  }, []);

  const handleSignedIn = () => {
    setPrompt(null);
    if (returnToRef.current) navigate(returnToRef.current);
  };

  return (
    <SignInPromptContext.Provider value={{ promptSignIn }}>
      {children}
      <Sheet open={Boolean(prompt) && !user} onClose={() => setPrompt(null)} maxWidth="xs">
        <DialogTitle>Sign in</DialogTitle>
        <DialogContent sx={{ pb: 3 }}>
          <Typography color="text.secondary" sx={{ mb: 2.5 }}>
            {prompt?.reason} Your basket stays as it is.
          </Typography>
          <GoogleSignInButton onSignedIn={handleSignedIn} />
          <Typography variant="body2" color="text.secondary" sx={{ mt: 2.5 }}>
            We only use your name and email to keep your receipts together. Payments are handled by Razorpay.
          </Typography>
        </DialogContent>
      </Sheet>
    </SignInPromptContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useSignInPrompt = () => useContext(SignInPromptContext);
