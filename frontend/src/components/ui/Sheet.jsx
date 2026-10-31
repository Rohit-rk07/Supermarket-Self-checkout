import { forwardRef } from 'react';
import { Dialog, Slide, useMediaQuery, useTheme } from '@mui/material';

const SlideUp = forwardRef((props, ref) => <Slide direction="up" ref={ref} {...props} />);
SlideUp.displayName = 'SlideUp';

// A dialog that is centred on wide screens and slides up from the bottom on phones
const Sheet = ({ children, sx, ...props }) => {
  const theme = useTheme();
  const phone = useMediaQuery(theme.breakpoints.down('sm'));

  return (
    <Dialog
      fullWidth
      maxWidth="sm"
      TransitionComponent={phone ? SlideUp : undefined}
      sx={[
        {
          [theme.breakpoints.down('sm')]: {
            '& .MuiDialog-container': { alignItems: 'flex-end' },
            '& .MuiDialog-paper': { m: 0, width: '100%', maxWidth: '100%', borderRadius: '16px 16px 0 0' },
          },
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
      {...props}
    >
      {children}
    </Dialog>
  );
};

export default Sheet;
