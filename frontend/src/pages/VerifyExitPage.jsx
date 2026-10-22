import { useState, useCallback, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import {
    Box,
    Container,
    Typography,
    Button,
    Paper,
    TextField,
    Table,
    TableBody,
    TableCell,
    TableRow,
    IconButton,
    Tooltip,
    CircularProgress
} from "@mui/material";
import { ArrowBack, QrCodeScanner } from "@mui/icons-material";
import { useAuth } from "../context/AuthContext";

const BarcodeScanner = lazy(() => import("../components/BarcodeScanner"));

const API_URL = `${import.meta.env.VITE_SERVER_URL}/api/v1/orders`;

// What staff see for each result from the server
const VERDICTS = {
    PAID: { label: "PAID", hint: "Payment confirmed. The shopper may leave.", color: "#166534", background: "#dcfce7" },
    EXIT_CONFIRMED: { label: "EXIT CONFIRMED", hint: "Recorded. This receipt cannot be used again.", color: "#166534", background: "#dcfce7" },
    ALREADY_EXITED: { label: "ALREADY USED", hint: "This receipt was already used to leave the store.", color: "#92400e", background: "#fef3c7" },
    NOT_PAID: { label: "NOT PAID", hint: "Do not let the shopper leave. Send them back to pay.", color: "#991b1b", background: "#fee2e2" },
    CANCELLED: { label: "CANCELLED", hint: "This order was cancelled and is not valid.", color: "#991b1b", background: "#fee2e2" },
    NOT_FOUND: { label: "NOT FOUND", hint: "No order matches this code.", color: "#991b1b", background: "#fee2e2" },
    ERROR: { label: "ERROR", hint: "Something went wrong. Try again.", color: "#991b1b", background: "#fee2e2" }
};

const VerifyExitPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const canVerify = user?.role === "admin" || user?.role === "staff";
    const token = user?.token;

    const [code, setCode] = useState("");
    const [verdict, setVerdict] = useState(null); // { result, order, message }
    const [loading, setLoading] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);

    const authHeaders = useCallback(() => ({
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    }), [token]);

    const lookup = useCallback(async (value) => {
        const orderNumber = String(value || "").trim().toUpperCase();
        if (!orderNumber) return;

        setCode(orderNumber);
        setLoading(true);
        setVerdict(null);

        try {
            const response = await fetch(`${API_URL}/verify/${encodeURIComponent(orderNumber)}`, {
                headers: authHeaders()
            });
            const data = await response.json();

            if (response.status === 404) {
                setVerdict({ result: "NOT_FOUND", message: data.message });
            } else if (!response.ok) {
                throw new Error(data.message || "Could not verify this receipt");
            } else {
                setVerdict({ result: data.result, order: data.data });
            }
        } catch (error) {
            setVerdict({ result: "ERROR", message: error.message });
        } finally {
            setLoading(false);
        }
    }, [authHeaders]);

    // Stable callbacks, so the scanner is not re-created on every render
    const handleScan = useCallback((text) => lookup(text), [lookup]);
    const closeScanner = useCallback(() => setScannerOpen(false), []);

    const confirmExit = async () => {
        if (!verdict?.order) return;

        setConfirming(true);
        try {
            const response = await fetch(`${API_URL}/verify/${encodeURIComponent(verdict.order.orderNumber)}/exit`, {
                method: "POST",
                headers: authHeaders()
            });
            const data = await response.json();

            if (response.ok) {
                setVerdict({ result: "EXIT_CONFIRMED", order: verdict.order });
            } else {
                setVerdict({ result: data.result || "ERROR", order: verdict.order, message: data.message });
            }
        } catch (error) {
            setVerdict({ result: "ERROR", order: verdict.order, message: error.message });
        } finally {
            setConfirming(false);
        }
    };

    const reset = () => {
        setVerdict(null);
        setCode("");
    };

    if (!canVerify) {
        return (
            <Container maxWidth="sm" sx={{ py: 8, textAlign: "center" }}>
                <Typography variant="h5" fontWeight="600" gutterBottom>
                    Staff only
                </Typography>
                <Typography variant="body1" sx={{ color: "#64748b", mb: 3 }}>
                    Your account does not have permission to verify receipts.
                </Typography>
                <Button variant="outlined" onClick={() => navigate("/dashboard")}>
                    Back to dashboard
                </Button>
            </Container>
        );
    }

    const style = verdict ? (VERDICTS[verdict.result] || VERDICTS.ERROR) : null;
    const order = verdict?.order;

    return (
        <Box sx={{ minHeight: "100vh", backgroundColor: "#f8fafc", py: 4 }}>
            <Container maxWidth="sm">
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 3 }}>
                    <Tooltip title="Back to dashboard">
                        <IconButton onClick={() => navigate("/dashboard")}>
                            <ArrowBack />
                        </IconButton>
                    </Tooltip>
                    <Typography variant="h4" fontWeight="700" sx={{ color: "#1e293b" }}>
                        Verify Receipt
                    </Typography>
                </Box>

                <Paper elevation={0} sx={{ p: 3, mb: 3, border: "1px solid #f1f5f9", borderRadius: 2 }}>
                    <Button
                        variant="contained"
                        fullWidth
                        size="large"
                        startIcon={<QrCodeScanner />}
                        onClick={() => setScannerOpen(true)}
                        sx={{ mb: 2, py: 1.5, backgroundColor: "#10b981", "&:hover": { backgroundColor: "#059669" } }}
                    >
                        Scan receipt QR
                    </Button>

                    <Box sx={{ display: "flex", gap: 1 }}>
                        <TextField
                            fullWidth
                            size="small"
                            label="Or type the order number"
                            value={code}
                            onChange={(event) => setCode(event.target.value)}
                            onKeyDown={(event) => { if (event.key === "Enter") lookup(code); }}
                        />
                        <Button variant="outlined" onClick={() => lookup(code)} disabled={loading || !code.trim()} sx={{ whiteSpace: "nowrap", flexShrink: 0 }}>
                            Look up
                        </Button>
                    </Box>
                </Paper>

                {loading && (
                    <Box sx={{ textAlign: "center", py: 4 }}>
                        <CircularProgress sx={{ color: "#10b981" }} />
                    </Box>
                )}

                {verdict && style && (
                    <Paper elevation={0} sx={{ border: "1px solid #f1f5f9", borderRadius: 2, overflow: "hidden" }}>
                        <Box sx={{ backgroundColor: style.background, color: style.color, textAlign: "center", p: 3 }}>
                            <Typography variant="h3" fontWeight="800">
                                {style.label}
                            </Typography>
                            <Typography variant="body1" sx={{ mt: 1 }}>
                                {verdict.message && verdict.result !== "NOT_FOUND" ? verdict.message : style.hint}
                            </Typography>
                            {verdict.result === "ALREADY_EXITED" && order?.exitedAt && (
                                <Typography variant="body2" sx={{ mt: 1 }}>
                                    Used at {new Date(order.exitedAt).toLocaleString()}
                                </Typography>
                            )}
                        </Box>

                        {order && (
                            <Box sx={{ p: 3 }}>
                                <Typography variant="subtitle2" sx={{ color: "#64748b" }}>
                                    Order {order.orderNumber}
                                    {order.userName ? ` · ${order.userName}` : ""}
                                </Typography>

                                <Table size="small" sx={{ my: 2 }}>
                                    <TableBody>
                                        {(order.items || []).map((item, index) => (
                                            <TableRow key={index}>
                                                <TableCell sx={{ pl: 0 }}>{item.name}</TableCell>
                                                <TableCell align="right">{item.quantity} × ₹{Number(item.price).toFixed(2)}</TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow>
                                            <TableCell sx={{ pl: 0, fontWeight: 700 }}>Total (incl. GST)</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700 }}>₹{Number(order.total).toFixed(2)}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>

                                {verdict.result === "PAID" && (
                                    <Button
                                        variant="contained"
                                        fullWidth
                                        size="large"
                                        onClick={confirmExit}
                                        disabled={confirming}
                                        sx={{ backgroundColor: "#10b981", "&:hover": { backgroundColor: "#059669" } }}
                                    >
                                        {confirming ? "Confirming..." : "Confirm exit"}
                                    </Button>
                                )}
                            </Box>
                        )}

                        <Box sx={{ p: 2, borderTop: "1px solid #f1f5f9", textAlign: "center" }}>
                            <Button onClick={reset}>Verify another receipt</Button>
                        </Box>
                    </Paper>
                )}
            </Container>

            {scannerOpen && (
                <Suspense fallback={null}>
                    <BarcodeScanner
                        onScan={handleScan}
                        closeScanner={closeScanner}
                        title="📸 Scan the receipt QR"
                    />
                </Suspense>
            )}
        </Box>
    );
};

export default VerifyExitPage;
