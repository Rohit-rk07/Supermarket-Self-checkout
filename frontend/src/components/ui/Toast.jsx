import { useEffect, useRef } from 'react';
import { Alert, Box } from '@mui/material';

// A short message at the bottom of the screen that dismisses itself.
// `offset` lifts it above a bar that sits at the bottom (such as the basket bar).
const Toast = ({ toast, onClose, offset = 0, duration = 3500 }) => {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => closeRef.current(), duration);
    return () => clearTimeout(timer);
  }, [toast, duration]);

  if (!toast) return null;

  return (
    <Box
      role="status"
      aria-live="polite"
      sx={{
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: offset + 24,
        display: 'flex',
        justifyContent: 'center',
        px: 2,
        zIndex: 1400,
        pointerEvents: 'none',
      }}
    >
      <Alert
        severity={toast.severity || 'success'}
        variant="filled"
        onClose={() => closeRef.current()}
        sx={{ pointerEvents: 'auto', maxWidth: 480 }}
      >
        {toast.message}
      </Alert>
    </Box>
  );
};

export default Toast;
