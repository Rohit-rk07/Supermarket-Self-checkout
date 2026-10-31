import { Box, Typography } from '@mui/material';
import { QRCodeSVG } from 'qrcode.react';
import { tokens, fonts } from '../../theme/theme';
import { formatMoney, getTotals, formatDateTime } from '../../utils/money';

// A torn paper edge: white teeth pointing down from the bottom of the receipt
const TEETH =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='8' viewBox='0 0 14 8'%3E%3Cpolygon points='0,0 14,0 7,8' fill='white'/%3E%3C/svg%3E\")";

const Rule = ({ double = false, sx }) => (
  <Box
    aria-hidden
    sx={{
      my: 1.75,
      borderTop: double ? `3px double ${tokens.brass}` : `1px dashed ${tokens.ink}55`,
      ...sx,
    }}
  />
);

// One line of the receipt: label ........ amount
const Line = ({ left, right, strong = false, large = false }) => (
  <Box
    sx={{
      display: 'flex',
      alignItems: 'baseline',
      gap: 0.75,
      fontWeight: strong ? 700 : 400,
      fontSize: large ? '1.15rem' : '0.875rem',
      lineHeight: 1.7,
    }}
  >
    <Box component="span" sx={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {left}
    </Box>
    <Box
      component="span"
      aria-hidden
      sx={{ flex: 1, minWidth: 12, borderBottom: '1px dotted', borderColor: `${tokens.ink}77`, transform: 'translateY(-4px)' }}
    />
    <Box component="span" className="num" sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      {right}
    </Box>
  </Box>
);

const Receipt = ({ order, animate = false }) => {
  if (!order) return null;

  const paid = order.paymentStatus === 'paid';
  const totals = getTotals(order);
  const when = order.paidAt || order.createdAt;
  const items = order.items || [];

  return (
    <Box
      className={`print-receipt receipt-print${animate ? ' receipt-print--animate' : ''}`}
      sx={{
        position: 'relative',
        width: '100%',
        maxWidth: 360,
        mx: 'auto',
        mb: '8px',
        px: 3,
        pt: 3.5,
        pb: 3,
        backgroundColor: '#FFFFFF',
        color: tokens.ink,
        fontFamily: fonts.receipt,
        filter: 'drop-shadow(0 8px 16px rgba(20, 32, 26, 0.14))',
        '&::after': {
          content: '""',
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: -8,
          height: 8,
          backgroundImage: TEETH,
          backgroundRepeat: 'repeat-x',
          backgroundSize: '14px 8px',
        },
      }}
    >
      <Typography
        component="p"
        sx={{ fontFamily: fonts.serif, fontWeight: 700, fontSize: '1.45rem', textAlign: 'center', lineHeight: 1.2 }}
      >
        Smart Checkout
      </Typography>
      <Typography
        component="p"
        sx={{ fontFamily: fonts.receipt, fontSize: '0.75rem', textAlign: 'center', color: tokens.inkSoft, mt: 0.25 }}
      >
        Self-checkout receipt
      </Typography>

      <Rule double />

      <Box sx={{ fontSize: '0.8125rem', lineHeight: 1.7 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
          <span>Receipt</span>
          <Box component="span" sx={{ fontWeight: 700, wordBreak: 'break-all', textAlign: 'right' }}>
            {order.orderNumber || order._id?.slice(-6).toUpperCase()}
          </Box>
        </Box>
        {when ? (
          <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
            <span>{paid ? 'Paid' : 'Placed'}</span>
            <span>{formatDateTime(when)}</span>
          </Box>
        ) : null}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
          <span>Items</span>
          <span className="num">{items.reduce((count, item) => count + (item.quantity || 1), 0)}</span>
        </Box>
      </Box>

      <Rule />

      <Box>
        {items.map((item, index) => (
          <Line
            key={index}
            left={`${item.name}${(item.quantity || 1) > 1 ? ` ×${item.quantity}` : ''}`}
            right={formatMoney((item.quantity || 1) * (item.price || 0))}
          />
        ))}
      </Box>

      <Rule />

      <Line left="Subtotal" right={formatMoney(totals.subtotal)} />
      {totals.tax > 0 && <Line left="GST added" right={formatMoney(totals.tax)} />}
      <Box sx={{ mt: 0.5 }}>
        <Line left="Total" right={formatMoney(totals.total)} strong large />
        {totals.taxIncluded > 0 && (
          <Typography
            component="p"
            sx={{ fontFamily: fonts.receipt, fontSize: '0.75rem', color: tokens.inkSoft, textAlign: 'right', mt: 0.25 }}
          >
            Includes GST of {formatMoney(totals.taxIncluded)}
          </Typography>
        )}
      </Box>

      <Rule />

      {paid ? (
        <Box sx={{ textAlign: 'center' }}>
          <Box
            className="receipt-stamp"
            sx={{
              display: 'block',
              width: 'fit-content',
              mx: 'auto',
              mt: 0.5,
              mb: 2,
              px: 2,
              py: 0.5,
              border: `3px double ${tokens.forest}`,
              borderRadius: '4px',
              color: tokens.forest,
              fontFamily: fonts.receipt,
              fontWeight: 700,
              fontSize: '1.4rem',
              letterSpacing: '0.22em',
              paddingLeft: '1.2rem',
              transform: 'rotate(-7deg)',
              opacity: 0.92,
            }}
          >
            PAID
          </Box>

          <Box
            sx={{ display: 'inline-block', p: 1.25, backgroundColor: '#FFFFFF', border: `1px solid ${tokens.line}`, borderRadius: '4px' }}
          >
            <QRCodeSVG
              value={order.orderNumber || ''}
              size={132}
              level="M"
              fgColor={tokens.ink}
              bgColor="#FFFFFF"
              role="img"
              aria-label={`QR code for receipt ${order.orderNumber || ''}`}
            />
          </Box>
          <Typography
            component="p"
            sx={{ fontFamily: fonts.receipt, fontWeight: 700, fontSize: '0.8125rem', mt: 1 }}
          >
            Show this code at the exit
          </Typography>
        </Box>
      ) : (
        <Typography
          component="p"
          sx={{ fontFamily: fonts.receipt, fontWeight: 700, fontSize: '0.875rem', textAlign: 'center', color: tokens.danger.fg }}
        >
          Not paid. This receipt is not an exit pass.
        </Typography>
      )}

      <Typography
        component="p"
        sx={{ fontFamily: fonts.receipt, fontSize: '0.75rem', textAlign: 'center', color: tokens.inkSoft, mt: 2 }}
      >
        Thank you for shopping with us.
      </Typography>
    </Box>
  );
};

export default Receipt;
