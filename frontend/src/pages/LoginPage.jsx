import { useState, useEffect } from "react";
import { Box, TextField, Button, Typography, Alert, CircularProgress, MenuItem, Divider } from "@mui/material";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";
import OtpInput from "../components/ui/OtpInput";
import { Wordmark } from "../components/ui/TopBar";
import { tokens, fonts } from "../theme/theme";

const countryCodes = [
  { code: '+1', country: 'US/Canada', digits: 10, example: '2123456789' },
  { code: '+91', country: 'India', digits: 10, example: '9876543210' },
  { code: '+86', country: 'China', digits: 11, example: '13812345678' },
  { code: '+44', country: 'UK', digits: 10, example: '7123456789' },
  { code: '+81', country: 'Japan', digits: 9, example: '912345678' },
  { code: '+49', country: 'Germany', digits: '10-11', example: '1234567890' }
];

const STEPS = {
  1: { title: "Sign in", intro: "Enter your mobile number and we will text you a six‑digit code." },
  2: { title: "Enter your code", intro: "" },
  3: { title: "What should we call you?", intro: "One last thing before you start shopping." }
};

const steps = [
  "Scan each item with your phone camera, or type its barcode.",
  "Pay securely through Razorpay.",
  "Show the QR code on your receipt at the exit."
];

const LoginPage = () => {
  const { sendPhoneOTP, verifyPhoneOTP, completeRegistration, loginAsDemo, error } = useAuth();
  const [countryCode, setCountryCode] = useState('+91');
  const [phoneNumber, setPhoneNumber] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [demoEnabled, setDemoEnabled] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const navigate = useNavigate();

  const country = countryCodes.find((c) => c.code === countryCode);
  const fullPhoneNumber = countryCode + phoneNumber;

  useEffect(() => {
    if (countdown <= 0) return undefined;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Ask the server what this deployment offers (for example whether the demo is on)
  useEffect(() => {
    fetch(`${import.meta.env.VITE_SERVER_URL}/api/auth/config`)
      .then((response) => response.json())
      .then((body) => setDemoEnabled(Boolean(body?.data?.demoEnabled)))
      .catch(() => setDemoEnabled(false));
  }, []);

  const handleSendOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sendPhoneOTP(fullPhoneNumber);
      setStep(2);
      setCountdown(30);
    } catch {
      // Error handled by context
    }
    setLoading(false);
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await verifyPhoneOTP(fullPhoneNumber, otp);
      if (response.data && response.data.isNewUser) {
        setStep(3); // New users finish their profile first
      } else {
        navigate('/dashboard');
      }
    } catch {
      // Error handled by context
    }
    setLoading(false);
  };

  const handleCompleteRegistration = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await completeRegistration(name, email);
      navigate('/dashboard', { replace: true });
    } catch {
      // Error handled by context
    }
    setLoading(false);
  };

  const handleResendOTP = async () => {
    if (countdown > 0) return;
    setLoading(true);
    try {
      await sendPhoneOTP(fullPhoneNumber);
      setOtp("");
      setCountdown(30);
    } catch {
      // Error handled by context
    }
    setLoading(false);
  };

  const handleDemo = async () => {
    setDemoLoading(true);
    try {
      await loginAsDemo();
      navigate('/dashboard');
    } catch {
      // Error shown by context
    }
    setDemoLoading(false);
  };

  const spinner = <CircularProgress size={22} color="inherit" />;

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.05fr 1fr' }, backgroundColor: 'background.default' }}>
      {/* Brand panel */}
      <Box
        sx={{
          backgroundColor: tokens.forest,
          color: tokens.paper,
          px: { xs: 3, md: 8 },
          py: { xs: 3, md: 7 },
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: { xs: 0, md: 6 }
        }}
      >
        <Wordmark light />

        <Box sx={{ display: { xs: 'none', md: 'block' }, maxWidth: 460 }}>
          <Typography component="p" sx={{ fontFamily: fonts.serif, fontWeight: 700, fontSize: '2.75rem', lineHeight: 1.15, letterSpacing: '-0.01em' }}>
            Scan as you shop. Pay once. Walk out with your receipt.
          </Typography>
          <Box sx={{ mt: 5 }}>
            {steps.map((text) => (
              <Typography
                key={text}
                sx={{ py: 1.75, borderTop: '1px solid rgba(242, 244, 239, 0.22)', color: 'rgba(242, 244, 239, 0.9)' }}
              >
                {text}
              </Typography>
            ))}
          </Box>
        </Box>

        <Box aria-hidden sx={{ display: { xs: 'none', md: 'block' }, borderTop: `3px double ${tokens.brass}`, width: 72 }} />
      </Box>

      {/* Form */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', px: { xs: 3, sm: 6 }, py: { xs: 5, md: 7 } }}>
        <Box sx={{ width: '100%', maxWidth: 400 }}>
          <Typography component="h1" variant="h3" sx={{ mb: 1.5 }}>
            {STEPS[step].title}
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3.5 }}>
            {step === 2 ? (
              <>We sent a six‑digit code to <strong>{fullPhoneNumber}</strong>.</>
            ) : (
              STEPS[step].intro
            )}
          </Typography>

          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          {step === 1 && (
            <Box component="form" onSubmit={handleSendOTP}>
              <Box sx={{ display: 'flex', gap: 1.5 }}>
                <TextField
                  select
                  label="Country"
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  sx={{ width: 120, flexShrink: 0 }}
                >
                  {countryCodes.map((c) => (
                    <MenuItem key={c.code} value={c.code}>{c.code}</MenuItem>
                  ))}
                </TextField>
                <TextField
                  fullWidth
                  label="Mobile number"
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ''))}
                  placeholder={country?.example}
                  helperText={country ? `${country.digits} digits for ${country.country}` : ""}
                  inputProps={{ inputMode: 'numeric', autoComplete: 'tel-national' }}
                  required
                />
              </Box>

              <Button type="submit" variant="contained" size="large" fullWidth sx={{ mt: 3 }} disabled={loading || !phoneNumber}>
                {loading ? spinner : "Send code"}
              </Button>

                            {demoEnabled && (
                <>
                  <Divider sx={{ my: 4 }} />

                  <Typography color="text.secondary" sx={{ mb: 1.5, textAlign: 'center' }}>
                    No code arriving? Texts can be slow or blocked in a test build.
                  </Typography>
                  <Button variant="outlined" size="large" fullWidth onClick={handleDemo} disabled={demoLoading}>
                    {demoLoading ? spinner : "Try the demo"}
                  </Button>
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, textAlign: 'center' }}>
                    The demo is a throwaway shopper. Payments use Razorpay test mode, so no real money moves.
                  </Typography>
                </>
              )}
            </Box>
          )}

          {step === 2 && (
            <Box component="form" onSubmit={handleVerifyOTP}>
              <OtpInput value={otp} onChange={setOtp} disabled={loading} error={!!error} autoFocus />

              <Button type="submit" variant="contained" size="large" fullWidth sx={{ mt: 3.5 }} disabled={loading || otp.length !== 6}>
                {loading ? spinner : "Verify and continue"}
              </Button>

              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Button variant="text" onClick={() => { setStep(1); setOtp(""); }} disabled={loading}>
                  Change number
                </Button>
                <Button variant="text" onClick={handleResendOTP} disabled={countdown > 0 || loading}>
                  {countdown > 0 ? `Resend in ${countdown}s` : "Send a new code"}
                </Button>
              </Box>
            </Box>
          )}

          {step === 3 && (
            <Box component="form" onSubmit={handleCompleteRegistration}>
              <TextField
                fullWidth
                label="Full name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                required
                autoFocus
              />
              <TextField
                fullWidth
                label="Email (optional)"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                helperText="Used on payment receipts. You can skip it."
                sx={{ mt: 2.5 }}
              />
              <Button type="submit" variant="contained" size="large" fullWidth sx={{ mt: 3 }} disabled={loading || !name.trim()}>
                {loading ? spinner : "Start shopping"}
              </Button>
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default LoginPage;


