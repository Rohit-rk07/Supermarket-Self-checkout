import { Box } from '@mui/material';
import { formatMoney } from '../../utils/money';

// A price. Tabular figures keep columns of prices lined up.
const Money = ({ value, sx, ...rest }) => (
  <Box
    component="span"
    className="num"
    sx={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', ...sx }}
    {...rest}
  >
    {formatMoney(value)}
  </Box>
);

export default Money;
