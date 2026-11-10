import { Box, Typography, IconButton, Avatar, Button } from '@mui/material';
import { ArrowBack, DarkMode, LightMode } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSignInPrompt } from '../../context/SignInPrompt';
import { useTheme } from '../../context/ThemeContext';
import logo from '../../assets/logo.png';

export const Wordmark = ({ sx }) => (
  <Box
    component="img"
    src={logo}
    alt="Supermarket Self Checkout"
    sx={{
      display: 'block',
      height: 40,
      width: 'auto',
      maxWidth: 200,
      objectFit: 'contain',
      // In a column layout the picture must keep its shape, not stretch across the row
      alignSelf: 'flex-start',
      ...sx,
    }}
  />
);

// The bar at the top of every signed-in screen: wordmark or back + title, and the account button
const TopBar = ({ title, backTo, right, hideAccount = false }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { promptSignIn } = useSignInPrompt();
  const { mode, toggleTheme } = useTheme();
  const initial = (user?.name || user?.email || 'U').toString().trim()[0]?.toUpperCase();

  return (
    <Box
      component="header"
      sx={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        backgroundColor: 'background.default',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Box
        sx={{
          maxWidth: 960,
          mx: 'auto',
          px: { xs: 1.5, sm: 3 },
          height: 60,
          display: 'flex',
          alignItems: 'center',
          gap: 1,
        }}
      >
        {backTo ? (
          <IconButton aria-label="Back" onClick={() => navigate(backTo)} edge="start">
            <ArrowBack />
          </IconButton>
        ) : null}

        {title ? (
          <Typography component="h1" variant="h6" noWrap sx={{ ml: backTo ? 0 : 1.5 }}>
            {title}
          </Typography>
        ) : (
          <Box sx={{ ml: 1.5 }}>
            <Wordmark />
          </Box>
        )}

        <Box sx={{ flex: 1 }} />
        {right}

        {/* Theme toggle button */}
        <IconButton
          aria-label="Toggle theme"
          onClick={toggleTheme}
          sx={{ ml: 0.5 }}
        >
          {mode === 'light' ? <DarkMode /> : <LightMode />}
        </IconButton>

        {user && !hideAccount ? (
          <IconButton aria-label="Your account" onClick={() => navigate('/account')}>
            <Avatar src={user?.picture || undefined} imgProps={{ referrerPolicy: 'no-referrer' }} alt="" sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: '0.9rem', fontWeight: 600 }}>
              {initial}
            </Avatar>
          </IconButton>
        ) : null}

        {/* Visitors who have not signed in see a button where the account picture would be */}
        {!user && !hideAccount ? (
          <Button variant="outlined" size="small" onClick={() => promptSignIn({ reason: 'Sign in to see your receipts and pay.' })}>
            Sign in
          </Button>
        ) : null}
      </Box>
    </Box>
  );
};

export default TopBar;
