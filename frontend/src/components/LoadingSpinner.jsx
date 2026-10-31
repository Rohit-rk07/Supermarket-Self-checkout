import { Box, CircularProgress, Typography } from "@mui/material";
import { Wordmark } from "./ui/TopBar";

// Shown between pages while they load: the brand, a thin spinner, one quiet line
const LoadingSpinner = ({ message = "Loading..." }) => {
    return (
        <Box
            role="status"
            aria-live="polite"
            sx={{
                minHeight: '100vh',
                backgroundColor: 'background.default',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 2.5
            }}
        >
            <Wordmark sx={{ fontSize: '1.5rem' }} />
            <CircularProgress size={28} thickness={3} />
            <Typography color="text.secondary">{message}</Typography>
        </Box>
    );
};

export default LoadingSpinner;
