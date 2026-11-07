import { Box, Typography, IconButton, Avatar } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fonts } from '../../theme/theme';

export const Wordmark = ({ light = false, sx }) => (
  <Typography
    component="span"
    sx={{
      fontFamily: fonts.serif,
      fontWeight: 700,
      fontSize: '1.25rem',
      letterSpacing: '-0.01em',
      color: light ? '#F2F4EF' : 'text.primary',
      ...sx,
    }}
  >
    Smart Checkout
  </Typography>
);

// The bar at the top of every signed-in screen: wordmark or back + title, and the account button
const TopBar = ({ title, backTo, right, hideAccount = false }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
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

        {user && !hideAccount ? (
          <IconButton aria-label="Your account" onClick={() => navigate('/account')}>
            <Avatar src={user?.picture || undefined} imgProps={{ referrerPolicy: 'no-referrer' }} alt="" sx={{ width: 34, height: 34, bgcolor: 'primary.main', fontSize: '0.9rem', fontWeight: 600 }}>
              {initial}
            </Avatar>
          </IconButton>
        ) : null}
      </Box>
    </Box>
  );
};

export default TopBar;
