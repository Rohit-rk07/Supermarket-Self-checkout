import { Box, Table, TableHead, TableRow, TableCell, TableBody, TableContainer, Typography, CircularProgress } from '@mui/material';

// A list of records: a table on wide screens, a stack of cards on phones.
// columns: [{ label, render(row), align, primary, actions }]
//   primary  = the card title on phones (usually the first column)
//   actions  = buttons, shown in the last column and at the bottom of each card
const ResponsiveRows = ({ columns, rows, rowKey, loading, emptyText, footer }) => {
  const primary = columns.find((column) => column.primary);
  const actions = columns.find((column) => column.actions);
  const details = columns.filter((column) => column !== primary && column !== actions);

  let body;
  if (loading) {
    body = (
      <Box sx={{ py: 8, textAlign: 'center' }}>
        <CircularProgress size={32} aria-label="Loading" />
      </Box>
    );
  } else if (rows.length === 0) {
    body = (
      <Typography color="text.secondary" sx={{ py: 8, px: 2, textAlign: 'center' }}>
        {emptyText}
      </Typography>
    );
  } else {
    body = (
      <>
        {/* Wide screens */}
        <TableContainer sx={{ display: { xs: 'none', md: 'block' }, maxHeight: '70vh' }}>
          <Table stickyHeader>
            <TableHead>
              <TableRow>
                {columns.map((column) => (
                  <TableCell key={column.label} align={column.align}>{column.label}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={rowKey(row)} hover>
                  {columns.map((column) => (
                    <TableCell key={column.label} align={column.align}>{column.render(row)}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>

        {/* Phones */}
        <Box sx={{ display: { xs: 'block', md: 'none' } }}>
          {rows.map((row, index) => (
            <Box key={rowKey(row)} sx={{ px: 2, py: 1.75, borderTop: index === 0 ? 0 : 1, borderColor: 'divider' }}>
              {primary && <Box sx={{ fontWeight: 600, mb: 0.5 }}>{primary.render(row)}</Box>}
              {details.map((column) => {
                const value = column.render(row);
                if (value === null || value === undefined || value === '' || value === false) return null;
                return (
                  <Box key={column.label} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, py: 0.4 }}>
                    <Typography variant="body2" color="text.secondary">{column.label}</Typography>
                    <Box sx={{ textAlign: 'right', minWidth: 0 }}>{value}</Box>
                  </Box>
                );
              })}
              {actions && <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1, mt: 1 }}>{actions.render(row)}</Box>}
            </Box>
          ))}
        </Box>
      </>
    );
  }

  return (
    <Box sx={{ backgroundColor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: '10px' }}>
      {body}
      {footer}
    </Box>
  );
};

export default ResponsiveRows;
