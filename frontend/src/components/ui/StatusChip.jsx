import { Chip } from '@mui/material';
import { tokens } from '../../theme/theme';

const STYLES = {
  paid: { label: 'Paid', ...tokens.success },
  exited: { label: 'Exited', ...tokens.success },
  pending: { label: 'Unpaid', ...tokens.warning },
  awaitingExit: { label: 'Awaiting exit', ...tokens.warning },
  failed: { label: 'Payment failed', ...tokens.danger },
  cancelled: { label: 'Cancelled', ...tokens.danger },
  expired: { label: 'Expired', fg: tokens.inkSoft, bg: tokens.line },
  refunded: { label: 'Refunded', fg: tokens.forest, bg: tokens.forestTint },
};

// The status of an order, as a word and a colour (never colour alone)
const orderStatusKey = (order) => {
  if (order?.status === 'cancelled') return 'cancelled';
  if (order?.paymentStatus === 'paid') return 'paid';
  if (order?.status === 'expired') return 'expired';
  if (order?.paymentStatus === 'failed') return 'failed';
  if (order?.paymentStatus === 'refunded') return 'refunded';
  return 'pending';
};

const StatusChip = ({ status, order, sx }) => {
  const style = STYLES[status || orderStatusKey(order)] || STYLES.pending;
  return (
    <Chip
      size="small"
      label={style.label}
      sx={{ backgroundColor: style.bg, color: style.fg, ...sx }}
    />
  );
};

export default StatusChip;

