import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Box, Typography, Button, TablePagination, TextField, MenuItem, IconButton, Tooltip, Alert, DialogTitle, DialogContent, DialogActions, Radio, RadioGroup, FormControlLabel } from "@mui/material";
import { Refresh } from "@mui/icons-material";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/ui/TopBar";
import Money from "../components/ui/Money";
import StatusChip from "../components/ui/StatusChip";
import Toast from "../components/ui/Toast";
import ResponsiveRows from "../components/ui/ResponsiveRows";
import Sheet from "../components/ui/Sheet";
import { fonts } from "../theme/theme";

const API_URL = `${import.meta.env.VITE_SERVER_URL}/api/v1/orders`;

const PAYMENT_FILTERS = [
    { value: "", label: "All orders" },
    { value: "paid", label: "Paid" },
    { value: "pending", label: "Unpaid" },
    { value: "failed", label: "Failed" },
    { value: "expired", label: "Expired" },
    { value: "refunded", label: "Refunded" },
    { value: "partialRefund", label: "Part-refunded" },
    { value: "refundFailed", label: "Refund failed (needs action)" },
    { value: "bagMismatch", label: "Bag check mismatch" }
];

// Filters that are not a payment status are sent as a "flag"
const FLAGS = ["partialRefund", "refundFailed", "bagMismatch"];

// What can still be refunded on an order: [{ barcode, name, left }]
const refundableLines = (order) => {
    const lines = new Map();
    for (const item of order?.items || []) {
        const row = lines.get(item.barcode) || { barcode: item.barcode, name: item.name, left: 0 };
        row.left += item.quantity || 1;
        lines.set(item.barcode, row);
    }
    for (const back of order?.refundLines || []) {
        if (lines.has(back.barcode)) lines.get(back.barcode).left -= back.quantity || 0;
    }
    return [...lines.values()].filter((row) => row.left > 0);
};

// Staff see a name and the last 4 digits only
const maskPhone = (phone) => (phone ? `•••• ${String(phone).slice(-4)}` : "");

const StatCard = ({ label, value }) => (
    <Box sx={{ p: 2, border: 1, borderColor: "divider", borderRadius: "10px", backgroundColor: "background.paper" }}>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Typography sx={{ fontFamily: fonts.serif, fontWeight: 700, fontSize: "1.6rem", fontVariantNumeric: "tabular-nums" }}>
            {value}
        </Typography>
    </Box>
);

const StaffOrdersPage = () => {
    const { user } = useAuth();
    const canView = user?.role === "admin" || user?.role === "staff";
    const token = user?.token;

    const [orders, setOrders] = useState([]);
    const [stats, setStats] = useState(null);
    const [payments, setPayments] = useState(null);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [searchParams] = useSearchParams();
    const startFilter = searchParams.get("show");
    const [paymentFilter, setPaymentFilter] = useState(PAYMENT_FILTERS.some((option) => option.value === startFilter) ? startFilter : "");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [toast, setToast] = useState(null);
    const [checkingId, setCheckingId] = useState(null);
    // The order an admin is about to refund, and why
    const [refundTarget, setRefundTarget] = useState(null);
    const [refundReason, setRefundReason] = useState("");
    const [refundQty, setRefundQty] = useState({}); // barcode -> how many to hand back (when choosing items)
    const [refundAll, setRefundAll] = useState(true);
    const [refunding, setRefunding] = useState(false);
    const isAdmin = user?.role === "admin";

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);

        const headers = { "Authorization": `Bearer ${token}` };
        const query = new URLSearchParams({ page: page + 1, limit: rowsPerPage });
        // Expired is an order status; Unpaid means waiting for payment and not expired
        if (paymentFilter === "expired") {
            query.set("status", "expired");
        } else if (paymentFilter === "pending") {
            query.set("paymentStatus", "pending");
            query.set("status", "pending");
        } else if (FLAGS.includes(paymentFilter)) {
            query.set("flag", paymentFilter);
        } else if (paymentFilter) {
            query.set("paymentStatus", paymentFilter);
        }

        try {
            const [ordersResponse, statsResponse] = await Promise.all([
                fetch(`${API_URL}/all?${query}`, { headers }),
                fetch(`${API_URL}/stats`, { headers })
            ]);
            const ordersData = await ordersResponse.json();
            const statsData = await statsResponse.json();

            if (!ordersResponse.ok) throw new Error(ordersData.message || "Could not load orders");
            if (!statsResponse.ok) throw new Error(statsData.message || "Could not load statistics");

            setOrders(ordersData.data.orders);
            setTotal(ordersData.data.pagination.total);
            setStats(statsData.data.stats);
            setPayments(statsData.data.payments || null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [token, page, rowsPerPage, paymentFilter]);

    useEffect(() => {
        if (canView) load();
    }, [canView, load]);

    // Ask Razorpay whether this order was really paid (the server only accepts a captured payment of the exact amount)
    const checkPayment = async (order) => {
        setCheckingId(order._id);
        try {
            const response = await fetch(`${API_URL}/${order._id}/reconcile`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Could not check the payment");
            setToast({ severity: data.result === "NOT_PAID" ? "info" : "success", message: `${order.orderNumber}: ${data.message}` });
            await load();
        } catch (err) {
            setToast({ severity: "error", message: err.message });
        } finally {
            setCheckingId(null);
        }
    };

    // Admin: give the shopper their money back through Razorpay
    const chosenItems = Object.entries(refundQty)
        .map(([barcode, quantity]) => ({ barcode, quantity: Number(quantity) || 0 }))
        .filter((entry) => entry.quantity > 0);

    const refund = async () => {
        if (!refundTarget) return;
        setRefunding(true);
        try {
            const response = await fetch(`${API_URL}/${refundTarget._id}/refund`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ reason: refundReason.trim(), ...(refundAll ? {} : { items: chosenItems }) })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Could not refund this order");
            setToast({ severity: "success", message: `${refundTarget.orderNumber}: ${data.message}` });
            setRefundTarget(null);
            setRefundReason("");
            await load();
        } catch (err) {
            setToast({ severity: "error", message: err.message });
        } finally {
            setRefunding(false);
        }
    };

    const openRefund = (order) => {
        setRefundTarget(order);
        setRefundReason("");
        setRefundQty({});
        setRefundAll(true);
    };

    // Admin: the failed refund was sorted out by hand, so remove the warning
    const clearRefundFailure = async (order) => {
        try {
            const response = await fetch(`${API_URL}/${order._id}/refund-failure/clear`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Could not clear the warning");
            setToast({ severity: "success", message: `${order.orderNumber}: warning cleared` });
            await load();
        } catch (err) {
            setToast({ severity: "error", message: err.message });
        }
    };

    if (!canView) {
        return (
            <Box sx={{ minHeight: "100vh" }}>
                <TopBar title="All orders" backTo="/dashboard" />
                <Box sx={{ maxWidth: 480, mx: "auto", px: 3, py: 8, textAlign: "center" }}>
                    <Typography component="h2" variant="h5" gutterBottom>Staff only</Typography>
                    <Typography color="text.secondary">
                        Your account does not have permission to view all orders.
                    </Typography>
                </Box>
            </Box>
        );
    }

    const columns = [
        {
            label: "Order",
            primary: true,
            render: (order) => <span style={{ fontFamily: "monospace" }}>{order.orderNumber}</span>
        },
        {
            label: "Customer",
            render: (order) => (
                <>
                    {order.userName || "Customer"}
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ display: "block" }}>
                        {maskPhone(order.userPhone)}
                    </Typography>
                </>
            )
        },
        { label: "Items", align: "right", render: (order) => order.items?.length ?? 0 },
        { label: "Total", align: "right", render: (order) => <Money value={order.total} /> },
        {
            label: "Payment",
            render: (order) => (
                <>
                    <StatusChip order={order} />
                    {order.paymentStatus === "paid" && order.refundedAmount > 0 && (
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                            Part-refunded: <Money value={order.refundedAmount} /> returned
                        </Typography>
                    )}
                    {order.refundFailedAt && (
                        <Typography component="span" variant="caption" sx={{ display: "block", mt: 0.5, color: "error.main", fontWeight: 700 }}>
                            Refund failed at Razorpay. Handle it in the Razorpay dashboard.
                        </Typography>
                    )}
                </>
            )
        },
        {
            label: "Exit",
            render: (order) => {
                if (order.paymentStatus === "refunded") {
                    return (
                        <Typography component="span" variant="caption" color="text.secondary">
                            {order.refundedAt ? `Refunded ${new Date(order.refundedAt).toLocaleString()}` : "Refunded"}
                            {order.refundReason ? ` · ${order.refundReason}` : ""}
                        </Typography>
                    );
                }
                if (order.paymentStatus !== "paid") return null;
                return (
                    <>
                        <StatusChip status={order.exitedAt ? "exited" : "awaitingExit"} />
                        {order.exitedAt && (
                            <Typography component="span" variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                                {new Date(order.exitedAt).toLocaleString()}
                                {order.exitedByName ? ` · by ${order.exitedByName}` : ""}
                                {order.bagResult === "mismatch"
                                    ? " · bag MISMATCH"
                                    : order.bagChecked
                                        ? " · bag checked, matched"
                                        : order.bagCheckRequired === false ? " · not picked for a bag check" : ""}
                            </Typography>
                        )}
                        {order.bagResult === "mismatch" && order.bagNote && (
                            <Typography component="span" variant="caption" sx={{ display: "block", color: "error.main", fontWeight: 600 }}>
                                Note: {order.bagNote}
                            </Typography>
                        )}
                    </>
                );
            }
        },
        { label: "Placed", render: (order) => (order.createdAt ? new Date(order.createdAt).toLocaleString() : "") },
        {
            label: "Action",
            actions: true,
            render: (order) => {
                const canCheck = order.paymentStatus !== "paid" && order.paymentStatus !== "refunded" && order.status !== "cancelled" && Boolean(order.razorpayOrderId);
                if (canCheck) {
                    return (
                        <Button size="small" variant="outlined" disabled={checkingId === order._id} onClick={() => checkPayment(order)}>
                            {checkingId === order._id ? "Checking..." : "Check payment"}
                        </Button>
                    );
                }
                return (
                    <>
                        {isAdmin && order.paymentStatus === "paid" && (
                            <Button size="small" variant="outlined" color="error" onClick={() => openRefund(order)}>
                                Refund
                            </Button>
                        )}
                        {isAdmin && order.refundFailedAt && (
                            <Button size="small" onClick={() => clearRefundFailure(order)} sx={{ ml: 0.5 }}>
                                Mark handled
                            </Button>
                        )}
                    </>
                );
            }
        }
    ];

    return (
        <Box sx={{ minHeight: "100vh" }}>
            <TopBar
                title="All orders"
                backTo="/dashboard"
                right={
                    <Tooltip title="Refresh">
                        <IconButton aria-label="Refresh" onClick={load}><Refresh /></IconButton>
                    </Tooltip>
                }
            />

            <Box sx={{ maxWidth: 1040, mx: "auto", px: { xs: 2, sm: 3 }, pt: 3, pb: 8 }}>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                {payments && (
                    <Alert severity={payments.webhookConfigured ? "success" : "warning"} sx={{ mb: 2 }}>
                        {!payments.webhookConfigured
                            ? "Payment webhook is off. A shopper who closes the browser right after paying stays Unpaid until you use Check payment."
                            : payments.lastWebhookAt
                                ? `Payment webhook is on. Last call received ${new Date(payments.lastWebhookAt).toLocaleString()}.`
                                : "Payment webhook is on, but no call has arrived yet."}
                    </Alert>
                )}

                {stats && (
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, gap: 1.5, mb: 3 }}>
                        <StatCard label="Total orders" value={stats.totalOrders} />
                        <StatCard label="Revenue (paid, incl. GST)" value={<Money value={stats.totalRevenue} />} />
                        <StatCard label="Unpaid" value={stats.pendingOrders} />
                        <StatCard label="Expired / cancelled / refunded" value={`${stats.expiredOrders ?? 0} / ${stats.cancelledOrders} / ${stats.refundedOrders ?? 0}`} />
                    </Box>
                )}

                <Box sx={{ mb: 2 }}>
                    <TextField
                        select
                        size="small"
                        label="Show"
                        value={paymentFilter}
                        onChange={(event) => { setPaymentFilter(event.target.value); setPage(0); }}
                        sx={{ minWidth: 160 }}
                    >
                        {PAYMENT_FILTERS.map((option) => (
                            <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                        ))}
                    </TextField>
                </Box>

                <ResponsiveRows
                    columns={columns}
                    rows={orders}
                    rowKey={(order) => order._id}
                    loading={loading}
                    emptyText="No orders match this filter."
                    footer={
                        <TablePagination
                            component="div"
                            count={total}
                            page={page}
                            onPageChange={(event, newPage) => setPage(newPage)}
                            rowsPerPage={rowsPerPage}
                            onRowsPerPageChange={(event) => {
                                setRowsPerPage(parseInt(event.target.value, 10));
                                setPage(0);
                            }}
                            rowsPerPageOptions={[10, 25, 50]}
                        />
                    }
                />
            </Box>

            <Sheet open={Boolean(refundTarget)} onClose={() => !refunding && setRefundTarget(null)} maxWidth="xs">
                <DialogTitle>Refund this order?</DialogTitle>
                <DialogContent>
                    {refundTarget && (
                        <>
                            <Typography sx={{ mb: 1.5 }}>
                                {refundTarget.orderNumber}: the money goes back to the shopper through Razorpay, and the items return to stock. This cannot be undone.
                            </Typography>
                            {refundTarget.refundedAmount > 0 && (
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                                    Already returned: <Money value={refundTarget.refundedAmount} />
                                </Typography>
                            )}
                            <RadioGroup value={refundAll ? "all" : "some"} onChange={(event) => setRefundAll(event.target.value === "all")} sx={{ mb: 1 }}>
                                <FormControlLabel value="all" control={<Radio />} label="Everything that is left" />
                                <FormControlLabel value="some" control={<Radio />} label="Only some items" />
                            </RadioGroup>
                            {!refundAll && (
                                <Box sx={{ mb: 2 }}>
                                    {refundableLines(refundTarget).map((line) => (
                                        <Box key={line.barcode} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, py: 0.75, borderTop: 1, borderColor: "divider" }}>
                                            <Typography variant="body2" sx={{ minWidth: 0 }}>{line.name} <span style={{ opacity: 0.7 }}>(up to {line.left})</span></Typography>
                                            <TextField
                                                size="small"
                                                type="number"
                                                value={refundQty[line.barcode] ?? ""}
                                                placeholder="0"
                                                onChange={(event) => {
                                                    const next = Math.max(0, Math.min(line.left, parseInt(event.target.value, 10) || 0));
                                                    setRefundQty((prev) => ({ ...prev, [line.barcode]: next }));
                                                }}
                                                inputProps={{ min: 0, max: line.left, "aria-label": `How many ${line.name} to refund`, style: { width: 56, textAlign: "right" } }}
                                            />
                                        </Box>
                                    ))}
                                </Box>
                            )}
                            {refundTarget.exitedAt && (
                                <Alert severity="warning" sx={{ mb: 2 }}>
                                    This shopper has already left the shop with these items.
                                </Alert>
                            )}
                            <TextField
                                fullWidth
                                size="small"
                                label="Reason (optional)"
                                value={refundReason}
                                onChange={(event) => setRefundReason(event.target.value)}
                                inputProps={{ maxLength: 200 }}
                            />
                        </>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setRefundTarget(null)} disabled={refunding}>Cancel</Button>
                    <Button variant="contained" color="error" onClick={refund} disabled={refunding || (!refundAll && chosenItems.length === 0)}>
                        {refunding ? "Refunding..." : refundAll ? "Refund everything left" : "Refund chosen items"}
                    </Button>
                </DialogActions>
            </Sheet>

            <Toast toast={toast} onClose={() => setToast(null)} />
        </Box>
    );
};

export default StaffOrdersPage;
