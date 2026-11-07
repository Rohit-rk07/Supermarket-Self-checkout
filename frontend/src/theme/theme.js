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

// Dark mode tokens
export const darkTokens = {
  paper: '#1A1F1C',
  surface: '#242A26',
  ink: '#F2F4EF',
  inkSoft: '#B8C4BC',
  line: '#3A443D',
  forest: '#4CAF50',
  forestDark: '#388E3C',
  forestTint: '#1B3326',
  brass: '#FFB74D',
  success: { fg: '#81C784', bg: '#1B3326' },
  warning: { fg: '#FFB74D', bg: '#332614' },
  danger: { fg: '#E57373', bg: '#261414' },
};

export const fonts = {
  serif: '"Libre Caslon Text", Georgia, "Times New Roman", serif',
  sans: '"Hanken Grotesk", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  receipt: '"Courier Prime", "Courier New", monospace',
};

const createSharedTheme = (palette) => ({
  palette,
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
        body: { backgroundColor: palette.background.default },
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
          '&:hover': { backgroundColor: palette.primary.dark },
          '&.Mui-disabled': { backgroundColor: alpha(palette.primary.main, 0.28), color: '#FFFFFF' },
        },
        outlined: {
          borderColor: alpha(palette.text.primary, 0.35),
          color: palette.text.primary,
          '&:hover': { borderColor: palette.text.primary, backgroundColor: alpha(palette.text.primary, 0.04) },
        },
        outlinedPrimary: {
          borderColor: palette.primary.main,
          color: palette.primary.main,
          '&:hover': { borderColor: palette.primary.dark, backgroundColor: alpha(palette.primary.main, 0.08) },
        },
        text: {
          '&:hover': { backgroundColor: alpha(palette.text.primary, 0.05) },
        },
      },
    },

    MuiIconButton: {
      styleOverrides: {
        root: { '&:hover': { backgroundColor: alpha(palette.text.primary, 0.06) } },
      },
    },

    MuiTextField: {
      defaultProps: { variant: 'outlined' },
    },

    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          backgroundColor: palette.background.paper,
          '& .MuiOutlinedInput-notchedOutline': { borderColor: palette.divider },
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: palette.text.secondary },
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: palette.primary.main, borderWidth: 2 },
          '&.Mui-error .MuiOutlinedInput-notchedOutline': { borderColor: palette.error.main },
        },
        input: { padding: '13px 14px' },
      },
    },

    MuiInputLabel: {
      styleOverrides: {
        root: { color: palette.text.secondary, '&.Mui-focused': { color: palette.primary.main } },
      },
    },

    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: 'none' },
        outlined: { borderColor: palette.divider },
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
        filled: { backgroundColor: alpha(palette.primary.main, 0.12), color: palette.primary.main },
      },
    },

    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 6, alignItems: 'center' },
        standardError: { backgroundColor: palette.error.bg, color: palette.error.main },
        standardSuccess: { backgroundColor: palette.success.bg, color: palette.success.main },
        standardWarning: { backgroundColor: palette.warning.bg, color: palette.warning.main },
        standardInfo: { backgroundColor: alpha(palette.primary.main, 0.12), color: palette.primary.main },
      },
    },

    MuiTableCell: {
      styleOverrides: {
        root: { borderBottomColor: palette.divider },
        head: { color: palette.text.secondary, fontWeight: 600, fontSize: '0.8125rem' },
      },
    },

    MuiTabs: {
      styleOverrides: {
        indicator: { height: 3, backgroundColor: palette.primary.main },
      },
    },

    MuiTab: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          fontSize: '0.9375rem',
          minHeight: 48,
          color: palette.text.secondary,
          '&.Mui-selected': { color: palette.text.primary },
        },
      },
    },

    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: palette.text.primary, fontSize: '0.75rem' },
      },
    },

    MuiDivider: {
      styleOverrides: {
        root: { borderColor: palette.divider },
      },
    },
    // On a phone the pager keeps only the range and the two arrows, so it never runs off the screen
    MuiTablePagination: {
      styleOverrides: {
        root: ({ theme }) => ({
          [theme.breakpoints.down('sm')]: {
            '& .MuiTablePagination-selectLabel, & .MuiTablePagination-input': { display: 'none' },
            '& .MuiTablePagination-toolbar': { paddingLeft: 8, paddingRight: 8, justifyContent: 'center' },
            '& .MuiTablePagination-spacer': { display: 'none' },
            '& .MuiTablePagination-displayedRows': { margin: 0 },
            '& .MuiTablePagination-actions': { marginLeft: 8 },
          },
        }),
      },
    },
  },
});

export const theme = createTheme(createSharedTheme({
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
  success: { main: tokens.success.fg, contrastText: '#FFFFFF', bg: tokens.success.bg },
  warning: { main: tokens.warning.fg, contrastText: '#FFFFFF', bg: tokens.warning.bg },
  error: { main: tokens.danger.fg, contrastText: '#FFFFFF', bg: tokens.danger.bg },
  info: { main: tokens.forest, contrastText: '#FFFFFF' },
}));

export const darkTheme = createTheme(createSharedTheme({
  mode: 'dark',
  primary: {
    main: darkTokens.forest,
    dark: darkTokens.forestDark,
    light: '#66BB6A',
    contrastText: '#FFFFFF',
  },
  secondary: {
    main: darkTokens.brass,
    contrastText: '#000000',
  },
  background: {
    default: darkTokens.paper,
    paper: darkTokens.surface,
  },
  text: {
    primary: darkTokens.ink,
    secondary: darkTokens.inkSoft,
  },
  divider: darkTokens.line,
  success: { main: darkTokens.success.fg, contrastText: '#000000', bg: darkTokens.success.bg },
  warning: { main: darkTokens.warning.fg, contrastText: '#000000', bg: darkTokens.warning.bg },
  error: { main: darkTokens.danger.fg, contrastText: '#000000', bg: darkTokens.danger.bg },
  info: { main: darkTokens.forest, contrastText: '#000000' },
}));

// Kept so older imports keep working
export const colors = {
  primary: { 50: tokens.forestTint, 500: tokens.forest, 700: tokens.forestDark, 900: tokens.ink },
  accent: { primary: tokens.forest, secondary: tokens.brass, warning: tokens.warning.fg, error: tokens.danger.fg },
  background: { main: tokens.paper, paper: tokens.surface, surface: tokens.forestTint },
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48 };

export default theme;
