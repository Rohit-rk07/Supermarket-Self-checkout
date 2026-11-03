import { useState, useCallback, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Button, TextField, CircularProgress, Checkbox, FormControlLabel } from "@mui/material";
import { QrCodeScanner } from "@mui/icons-material";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/ui/TopBar";
import Money from "../components/ui/Money";
import { tokens, fonts } from "../theme/theme";

const BarcodeScanner = lazy(() => import("../components/BarcodeScanner"));

const API_URL = `${import.meta.env.VITE_SERVER_URL}/api/v1/orders`;

// What staff see for each result from the server
const VERDICTS = {
    PAID: { label: "PAID", hint: "Payment confirmed. Check the items, then confirm exit.", ...tokens.success },
    EXIT_CONFIRMED: { label: "EXIT CONFIRMED", hint: "Recorded. This receipt cannot be used again.", ...tokens.success },
    ALREADY_EXITED: { label: "ALREADY USED", hint: "This receipt was already used to leave the store.", ...tokens.warning },
    NOT_PAID: { label: "NOT PAID", hint: "Do not let the shopper leave. Send them back to pay.", ...tokens.danger },
    CANCELLED: { label: "CANCELLED", hint: "This order was cancelled and is not valid.", ...tokens.danger },
    REFUNDED: { label: "REFUNDED", hint: "The money was returned. Do not let the shopper leave with these items.", ...tokens.danger },
    NOT_FOUND: { label: "NOT FOUND", hint: "No order matches this code.", ...tokens.danger },
    ERROR: { label: "ERROR", hint: "Something went wrong. Try again.", ...tokens.danger }
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
    // Set when the shopper's bag was picked for a random check; staff must tick before Confirm exit
    const [bagTicked, setBagTicked] = useState(false);

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
        setBagTicked(false);

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
                setVerdict({ result: data.result, order: data.data, bagCheckRequired: data.bagCheckRequired === true });
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
                headers: authHeaders(),
                body: JSON.stringify({ bagChecked: verdict.bagCheckRequired === true && bagTicked })
            });
            const data = await response.json();

            if (response.ok) {
                setVerdict({ result: "EXIT_CONFIRMED", order: verdict.order });
            } else if (data.result === "BAG_CHECK_REQUIRED") {
                // Stay on the receipt: staff just need to look in the bag and tick the box
                setVerdict({ ...verdict, bagCheckRequired: true, message: data.message });
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
        setBagTicked(false);
    };

    if (!canVerify) {
        return (
            <Box sx={{ minHeight: "100vh" }}>
                <TopBar title="Verify receipt" backTo="/dashboard" />
                <Box sx={{ maxWidth: 480, mx: "auto", px: 3, py: 8, textAlign: "center" }}>
                    <Typography component="h2" variant="h5" gutterBottom>Staff only</Typography>
                    <Typography color="text.secondary" sx={{ mb: 3 }}>
                        Your account does not have permission to verify receipts.
                    </Typography>
                    <Button variant="outlined" onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
                </Box>
            </Box>
        );
    }

    const style = verdict ? (VERDICTS[verdict.result] || VERDICTS.ERROR) : null;
    const order = verdict?.order;
    const items = order?.items || [];
    const itemCount = items.reduce((sum, item) => sum + (item.quantity || 1), 0);

    return (
        <Box sx={{ minHeight: "100vh" }}>
            <TopBar title="Verify receipt" backTo="/dashboard" />

            <Box sx={{ maxWidth: 560, mx: "auto", px: { xs: 2, sm: 3 }, pt: 3, pb: 8 }}>
                <Button
                    variant="contained"
                    fullWidth
                    size="large"
                    startIcon={<QrCodeScanner />}
                    onClick={() => setScannerOpen(true)}
                    sx={{ mb: 2 }}
                >
                    Scan receipt QR
                </Button>

                <Box sx={{ display: "flex", gap: 1, mb: 3 }}>
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

                {loading && (
                    <Box sx={{ textAlign: "center", py: 4 }}>
                        <CircularProgress aria-label="Checking the receipt" />
                    </Box>
                )}

                {verdict && style && (
                    <Box>
                        {/* 1. The verdict, as large as possible */}
                        <Box
                            role="status"
                            aria-live="assertive"
                            sx={{ backgroundColor: style.bg, color: style.fg, textAlign: "center", borderRadius: "10px", px: 2, py: 4 }}
                        >
                            <Typography
                                component="h2"
                                sx={{ fontFamily: fonts.serif, fontWeight: 700, fontSize: { xs: "2.4rem", sm: "3rem" }, lineHeight: 1.1 }}
                            >
                                {style.label}
                            </Typography>
                            <Typography sx={{ mt: 1.5, fontWeight: 600 }}>
                                {verdict.message && verdict.result !== "NOT_FOUND" ? verdict.message : style.hint}
                            </Typography>
                            {verdict.result === "ALREADY_EXITED" && order?.exitedAt && (
                                <Typography variant="body2" sx={{ mt: 1 }}>
                                    Used at {new Date(order.exitedAt).toLocaleString()}
                                </Typography>
                            )}
                        </Box>

                        {/* Picked for a random bag check: staff must look in the bag and tick before confirming */}
                        {verdict.result === "PAID" && verdict.bagCheckRequired && (
                            <Box
                                role="alert"
                                sx={{ mt: 2, p: 2, borderRadius: "10px", border: 2, borderColor: tokens.warning.fg, backgroundColor: tokens.warning.bg, color: tokens.warning.fg }}
                            >
                                <Typography component="h3" sx={{ fontFamily: fonts.serif, fontWeight: 700, fontSize: "1.6rem", lineHeight: 1.1 }}>
                                    CHECK BAG
                                </Typography>
                                <Typography sx={{ mt: 0.5, fontWeight: 600 }}>
                                    This bag was picked for a check. Compare it with the list below.
                                </Typography>
                                <FormControlLabel
                                    sx={{ mt: 1, ml: 0, alignItems: "flex-start" }}
                                    control={<Checkbox checked={bagTicked} onChange={(event) => setBagTicked(event.target.checked)} sx={{ py: 0.5 }} />}
                                    label="I have checked the bag against this list"
                                />
                            </Box>
                        )}

                        {order && (
                            <Box sx={{ mt: 3 }}>
                                {/* 2. How many items, then the list, so staff can compare with the bag */}
                                <Typography variant="body2" color="text.secondary">
                                    Order {order.orderNumber}{order.userName ? ` · ${order.userName}` : ""}
                                </Typography>
                                <Typography component="h3" sx={{ fontFamily: fonts.serif, fontWeight: 700, fontSize: "2rem", mb: 1 }}>
                                    {itemCount} {itemCount === 1 ? "item" : "items"}
                                </Typography>

                                {items.map((item, index) => (
                                    <Box
                                        key={index}
                                        sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 1.25, borderTop: 1, borderColor: "divider" }}
                                    >
                                        <Typography fontWeight={600} sx={{ minWidth: 0 }}>
                                            {item.quantity} {"×"} {item.name}
                                        </Typography>
                                        <Money value={item.price * item.quantity} />
                                    </Box>
                                ))}

                                <Box sx={{ display: "flex", justifyContent: "space-between", py: 1.5, borderTop: 1, borderColor: "divider" }}>
                                    <Typography fontWeight={700}>Total (incl. GST)</Typography>
                                    <Money value={order.total} sx={{ fontWeight: 700 }} />
                                </Box>

                                {/* 3. Only now, the action */}
                                {verdict.result === "PAID" && (
                                    <Button
                                        variant="contained"
                                        fullWidth
                                        size="large"
                                        onClick={confirmExit}
                                        disabled={confirming || (verdict.bagCheckRequired && !bagTicked)}
                                        sx={{ mt: 1 }}
                                    >
                                        {confirming ? "Confirming..." : "Confirm exit"}
                                    </Button>
                                )}
                            </Box>
                        )}

                        <Box sx={{ textAlign: "center", mt: 3 }}>
                            <Button onClick={reset}>Verify another receipt</Button>
                        </Box>
                    </Box>
                )}
            </Box>

            {scannerOpen && (
                <Suspense fallback={null}>
                    <BarcodeScanner
                        onScan={handleScan}
                        closeScanner={closeScanner}
                        title="Scan the receipt QR"
                    />
                </Suspense>
            )}
        </Box>
    );
};

export default VerifyExitPage;
