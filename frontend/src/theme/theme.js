import { createTheme, alpha } from '@mui/material/styles';

// Design tokens: the one place colours, type and shape are decided.
// Direction: a classic grocer. Cool paper, green-black ink, bottle green, a little brass.
export const tokens = {
  paper: '#F2F4EF',
  surface: '#FFFFFF',
  ink: '#14201A',
  inkSoft: '#4B5A52',
  line: '#DCE1D8',
  forest: '#0E4A33',
  forestDark: '#093525',
  forestTint: '#E3EEE8',
  // Brass is decorative (rules, stamps). It is too light for small text.
  brass: '#A8802F',
  success: { fg: '#146C3A', bg: '#DDF2E4' },
  warning: { fg: '#9A5A06', bg: '#FBEBCB' },
  danger: { fg: '#A5231D', bg: '#F9DEDB' },
};

export const fonts = {
  serif: '"Libre Caslon Text", Georgia, "Times New Roman", serif',
  sans: '"Hanken Grotesk", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  receipt: '"Courier Prime", "Courier New", monospace',
};

export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: tokens.forest,
      dark: tokens.forestDark,
      light: '#2F6B52',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: tokens.brass,
      contrastText: '#FFFFFF',
    },
    background: {
      default: tokens.paper,
      paper: tokens.surface,
    },
    text: {
      primary: tokens.ink,
      secondary: tokens.inkSoft,
    },
    divider: tokens.line,
    success: { main: tokens.success.fg, contrastText: '#FFFFFF' },
    warning: { main: tokens.warning.fg, contrastText: '#FFFFFF' },
    error: { main: tokens.danger.fg, contrastText: '#FFFFFF' },
    info: { main: tokens.forest, contrastText: '#FFFFFF' },
  },

  typography: {
    fontFamily: fonts.sans,
    // Headlines are serif; everything you tap is sans
    h1: { fontFamily: fonts.serif, fontWeight: 700, fontSize: '2.75rem', lineHeight: 1.15, letterSpacing: '-0.01em' },
    h2: { fontFamily: fonts.serif, fontWeight: 700, fontSize: '2.125rem', lineHeight: 1.2, letterSpacing: '-0.01em' },
    h3: { fontFamily: fonts.serif, fontWeight: 700, fontSize: '1.75rem', lineHeight: 1.25 },
    h4: { fontFamily: fonts.sans, fontWeight: 600, fontSize: '1.375rem', lineHeight: 1.3 },
    h5: { fontFamily: fonts.sans, fontWeight: 600, fontSize: '1.125rem', lineHeight: 1.4 },
    h6: { fontFamily: fonts.sans, fontWeight: 600, fontSize: '1rem', lineHeight: 1.4 },
    subtitle1: { fontWeight: 600, fontSize: '1rem' },
    subtitle2: { fontWeight: 600, fontSize: '0.875rem' },
    body1: { fontSize: '1rem', lineHeight: 1.55 },
    body2: { fontSize: '0.875rem', lineHeight: 1.5 },
    caption: { fontSize: '0.75rem', lineHeight: 1.4 },
    button: { fontWeight: 600, fontSize: '0.9375rem', textTransform: 'none', letterSpacing: 0 },
  },

  // Controls are lightly rounded; chips are fully round; cards use their own radius
  shape: { borderRadius: 6 },

  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: { backgroundColor: tokens.paper },
      },
    },

    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          borderRadius: 6,
          minHeight: 44,
          padding: '10px 20px',
          textTransform: 'none',
          '&:hover': { boxShadow: 'none' },
        },
        sizeLarge: { minHeight: 52, padding: '12px 24px', fontSize: '1rem' },
        sizeSmall: { minHeight: 36, padding: '6px 14px' },
        containedPrimary: {
          '&:hover': { backgroundColor: tokens.forestDark },
          '&.Mui-disabled': { backgroundColor: alpha(tokens.forest, 0.28), color: '#FFFFFF' },
        },
        outlined: {
          borderColor: alpha(tokens.ink, 0.35),
          color: tokens.ink,
          '&:hover': { borderColor: tokens.ink, backgroundColor: alpha(tokens.ink, 0.04) },
        },
        outlinedPrimary: {
          borderColor: tokens.forest,
          color: tokens.forest,
          '&:hover': { borderColor: tokens.forestDark, backgroundColor: tokens.forestTint },
        },
        text: {
          '&:hover': { backgroundColor: alpha(tokens.ink, 0.05) },
        },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: { '&:hover': { backgroundColor: alpha(tokens.ink, 0.06) } },
      },
    },

    MuiTextField: {
      defaultProps: { variant: 'outlined' },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          backgroundColor: tokens.surface,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: tokens.line },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: tokens.inkSoft },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: tokens.forest, borderWidth: 2 },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: tokens.danger.fg },
        },
        input: { padding: '13px 14px' },
      },
    },

    MuiInputLabel: {
      styleOverrides: {
        root: { color: tokens.inkSoft, '&.Mui-focused': { color: tokens.forest } },
      },
    },

    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none' },
        outlined: { borderColor: tokens.line },
      },
    },

    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 10 },
      },
    },

    MuiDialogTitle: {
      styleOverrides: {
        root: { fontFamily: fonts.serif, fontWeight: 700, fontSize: '1.375rem', padding: '20px 24px 8px' },
      },
    },

    MuiChip: {
      styleOverrides: {
        root: { borderRadius: 999, fontWeight: 600, fontSize: '0.75rem', height: 26 },
        filled: { backgroundColor: tokens.forestTint, color: tokens.forest },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 6, alignItems: 'center' },
        standardError: { backgroundColor: tokens.danger.bg, color: tokens.danger.fg },
        standardSuccess: { backgroundColor: tokens.success.bg, color: tokens.success.fg },
        standardWarning: { backgroundColor: tokens.warning.bg, color: tokens.warning.fg },
        standardInfo: { backgroundColor: tokens.forestTint, color: tokens.forest },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: { borderBottomColor: tokens.line },
        head: { color: tokens.inkSoft, fontWeight: 600, fontSize: '0.8125rem' },
      },
    },

    MuiTabs: {
      styleOverrides: {
        indicator: { height: 3, backgroundColor: tokens.forest },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.9375rem',
          minHeight: 48,
          color: tokens.inkSoft,
          '&.Mui-selected': { color: tokens.ink },
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: tokens.ink, fontSize: '0.75rem' },
      },
    },

    MuiDivider: {
      styleOverrides: {
        root: { borderColor: tokens.line },
      },
    },
  },
});

// Kept so older imports keep working
export const colors = {
  primary: { 50: tokens.forestTint, 500: tokens.forest, 700: tokens.forestDark, 900: tokens.ink },
  accent: { primary: tokens.forest, secondary: tokens.brass, warning: tokens.warning.fg, error: tokens.danger.fg },
  background: { main: tokens.paper, paper: tokens.surface, surface: tokens.forestTint },
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };

export default theme;
