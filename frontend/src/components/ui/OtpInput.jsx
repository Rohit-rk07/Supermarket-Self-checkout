import { useRef } from 'react';
import { Box } from '@mui/material';
import { tokens } from '../../theme/theme';

// Six boxes for a one-time code. Handles typing, backspace, paste and phone autofill.
const OtpInput = ({ value, onChange, length = 6, disabled = false, error = false, autoFocus = false }) => {
  const refs = useRef([]);

  const focusBox = (index) => {
    const target = Math.max(0, Math.min(length - 1, index));
    refs.current[target]?.focus();
  };

  const handleChange = (index, event) => {
    const digits = event.target.value.replace(/\D/g, '');

    if (digits === '') {
      onChange(value.slice(0, index) + value.slice(index + 1));
      return;
    }

    // Autofill from the phone drops the whole code into one box
    if (digits.length > 1) {
      const code = digits.slice(0, length);
      onChange(code);
      focusBox(code.length >= length ? length - 1 : code.length);
      return;
    }

    onChange((value.slice(0, index) + digits + value.slice(index + 1)).slice(0, length));
    focusBox(index + 1);
  };

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !value[index] && index > 0) {
      event.preventDefault();
      onChange(value.slice(0, index - 1) + value.slice(index));
      focusBox(index - 1);
    } else if (event.key === 'ArrowLeft') {
      focusBox(index - 1);
    } else if (event.key === 'ArrowRight') {
      focusBox(index + 1);
    }
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const code = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    if (code) {
      onChange(code);
      focusBox(code.length >= length ? length - 1 : code.length);
    }
  };

  return (
    <Box role="group" aria-label="One-time code" sx={{ display: 'flex', gap: { xs: 1, sm: 1.25 }, justifyContent: 'center' }}>
      {Array.from({ length }, (_, index) => (
        <Box
          key={index}
          component="input"
          ref={(element) => { refs.current[index] = element; }}
          value={value[index] || ''}
          onChange={(event) => handleChange(index, event)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={handlePaste}
          onFocus={(event) => event.target.select()}
          disabled={disabled}
          autoFocus={autoFocus && index === 0}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          aria-label={`Digit ${index + 1} of ${length}`}
          maxLength={index === 0 ? length : 1}
          sx={{
            width: { xs: 44, sm: 52 },
            height: { xs: 54, sm: 60 },
            textAlign: 'center',
            fontFamily: 'inherit',
            fontSize: '1.5rem',
            fontWeight: 600,
            color: 'text.primary',
            backgroundColor: 'background.paper',
            border: `1px solid ${error ? tokens.danger.fg : tokens.line}`,
            borderRadius: '6px',
            outline: 'none',
            '&:focus': { borderColor: tokens.forest, boxShadow: `0 0 0 1px ${tokens.forest}` },
            '&:disabled': { opacity: 0.6 },
          }}
        />
      ))}
    </Box>
  );
};

export default OtpInput;
