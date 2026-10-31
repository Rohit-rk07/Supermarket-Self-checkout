import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
    Box,
    Container,
    Typography,
    Paper,
    Grid,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    TableContainer,
    TablePagination,
    TextField,
    MenuItem,
    Chip,
    Button,
    IconButton,
    Tooltip,
    CircularProgress,
    Alert
} from "@mui/material";
import { ArrowBack, Refresh } from "@mui/icons-material";
import { useAuth } from "../context/AuthContext";

const API_URL = `${import.meta.env.VITE_SERVER_URL}/api/v1/orders`;

const PAYMENT_FILTERS = [
    { value: "", label: "All orders" },
    { value: "paid", label: "Paid" },
    { value: "pending", label: "Unpaid" },
    { value: "failed", label: "Failed" },
    { value: "expired", label: "Expired" }
];

const PAYMENT_CHIP = {
    paid: { label: "Paid", color: "#166534", background: "#dcfce7" },
    pending: { label: "Unpaid", color: "#92400e", background: "#fef3c7" },
    failed: { label: "Failed", color: "#991b1b", background: "#fee2e2" },
    refunded: { label: "Refunded", color: "#1e40af", background: "#dbeafe" },
    expired: { label: "Expired", color: "#475569", background: "#e2e8f0" }
};

// Staff see a name and the last 4 digits only
const maskPhone = (phone) => (phone ? `•••• ${String(phone).slice(-4)}` : "");

const StatCard = ({ label, value }) => (
    <Paper elevation={0} sx={{ p: 2.5, border: "1px solid #f1f5f9", borderRadius: 2 }}>
        <Typography variant="body2" sx={{ color: "#64748b" }}>{label}</Typography>
        <Typography variant="h5" fontWeight="700" sx={{ color: "#1e293b" }}>{value}</Typography>
    </Paper>
);

const StaffOrdersPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const canView = user?.role === "admin" || user?.role === "staff";
    const token = user?.token;

    const [orders, setOrders] = useState([]);
    const [stats, setStats] = useState(null);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [paymentFilter, setPaymentFilter] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    const [payments, setPayments] = useState(null);
    const [checkingId, setCheckingId] = useState(null);

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
        setNotice(null);
        try {
            const response = await fetch(`${API_URL}/${order._id}/reconcile`, {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` }
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "Could not check the payment");
            setNotice({ severity: data.result === "NOT_PAID" ? "info" : "success", message: `${order.orderNumber}: ${data.message}` });
            await load();
        } catch (err) {
            setNotice({ severity: "error", message: err.message });
        } finally {
            setCheckingId(null);
        }
    };

    if (!canView) {
        return (
            <Container maxWidth="sm" sx={{ py: 8, textAlign: "center" }}>
                <Typography variant="h5" fontWeight="600" gutterBottom>Staff only</Typography>
                <Typography variant="body1" sx={{ color: "#64748b" }}>
                    Your account does not have permission to view all orders.
                </Typography>
            </Container>
        );
    }

    const exitChip = (order) => {
        if (order.paymentStatus !== "paid") return null;
        return order.exitedAt
            ? <Chip size="small" label="Exited" sx={{ backgroundColor: "#dcfce7", color: "#166534" }} />
            : <Chip size="small" label="Awaiting exit" sx={{ backgroundColor: "#fef3c7", color: "#92400e" }} />;
    };

    return (
        <Box sx={{ minHeight: "100vh", backgroundColor: "#f8fafc", py: 4 }}>
            <Container maxWidth="lg">
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 3, flexWrap: "wrap", gap: 2 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Tooltip title="Back to dashboard">
                            <IconButton onClick={() => navigate("/dashboard")}><ArrowBack /></IconButton>
                        </Tooltip>
                        <Typography variant="h4" fontWeight="700" sx={{ color: "#1e293b" }}>All Orders</Typography>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <TextField
                            select
                            size="small"
                            label="Payment"
                            value={paymentFilter}
                            onChange={(event) => { setPaymentFilter(event.target.value); setPage(0); }}
                            sx={{ minWidth: 150 }}
                        >
                            {PAYMENT_FILTERS.map((option) => (
                                <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                            ))}
                        </TextField>
                        <Tooltip title="Refresh">
                            <IconButton onClick={load}><Refresh /></IconButton>
                        </Tooltip>
                    </Box>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}
                {notice && <Alert severity={notice.severity} onClose={() => setNotice(null)} sx={{ mb: 3 }}>{notice.message}</Alert>}
                {payments && (
                    <Alert severity={payments.webhookConfigured ? "success" : "warning"} sx={{ mb: 3 }}>
                        {!payments.webhookConfigured
                            ? "Payment webhook is off. A shopper who closes the browser right after paying stays Unpaid until you use Check payment."
                            : payments.lastWebhookAt
                                ? `Payment webhook is on. Last call received ${new Date(payments.lastWebhookAt).toLocaleString()}.`
                                : "Payment webhook is on, but no call has arrived yet."}
                    </Alert>
                )}

                {stats && (
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid item xs={6} md={3}><StatCard label="Total orders" value={stats.totalOrders} /></Grid>
                        <Grid item xs={6} md={3}><StatCard label="Revenue (paid, incl. GST)" value={`₹${Number(stats.totalRevenue).toFixed(2)}`} /></Grid>
                        <Grid item xs={6} md={3}><StatCard label="Unpaid" value={stats.pendingOrders} /></Grid>
                        <Grid item xs={6} md={3}><StatCard label="Expired / cancelled" value={`${stats.expiredOrders ?? 0} / ${stats.cancelledOrders}`} /></Grid>
                    </Grid>
                )}

                <Paper elevation={0} sx={{ border: "1px solid #f1f5f9", borderRadius: 2 }}>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell><strong>Order</strong></TableCell>
                                    <TableCell><strong>Customer</strong></TableCell>
                                    <TableCell align="right"><strong>Items</strong></TableCell>
                                    <TableCell align="right"><strong>Total (₹)</strong></TableCell>
                                    <TableCell><strong>Payment</strong></TableCell>
                                    <TableCell><strong>Exit</strong></TableCell>
                                    <TableCell><strong>Placed</strong></TableCell>
                                    <TableCell><strong>Action</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center" sx={{ py: 6 }}>
                                            <CircularProgress size={32} sx={{ color: "#10b981" }} />
                                        </TableCell>
                                    </TableRow>
                                ) : orders.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center" sx={{ py: 6, color: "#64748b" }}>
                                            No orders match this filter.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    orders.map((order) => {
                                        const chip = order.status === "expired" && order.paymentStatus !== "paid"
                                            ? PAYMENT_CHIP.expired
                                            : (PAYMENT_CHIP[order.paymentStatus] || PAYMENT_CHIP.pending);
                                        const canCheck = order.paymentStatus !== "paid" && order.status !== "cancelled" && Boolean(order.razorpayOrderId);
                                        return (
                                            <TableRow key={order._id} hover>
                                                <TableCell sx={{ fontFamily: "monospace" }}>
                                                    {order.orderNumber}
                                                    {order.status === "cancelled" && (
                                                        <Chip size="small" label="Cancelled" sx={{ ml: 1 }} />
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    {order.userName || "Customer"}
                                                    <Typography variant="caption" display="block" sx={{ color: "#64748b" }}>
                                                        {maskPhone(order.userPhone)}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">{order.items?.length ?? 0}</TableCell>
                                                <TableCell align="right">{Number(order.total).toFixed(2)}</TableCell>
                                                <TableCell>
                                                    <Chip size="small" label={chip.label} sx={{ backgroundColor: chip.background, color: chip.color }} />
                                                </TableCell>
                                                <TableCell>{exitChip(order)}</TableCell>
                                                <TableCell>{order.createdAt ? new Date(order.createdAt).toLocaleString() : ""}</TableCell>
                                                <TableCell>
                                                    {canCheck && (
                                                        <Button size="small" variant="outlined" disabled={checkingId === order._id} onClick={() => checkPayment(order)}>
                                                            {checkingId === order._id ? "Checking..." : "Check payment"}
                                                        </Button>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
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
                </Paper>
            </Container>
        </Box>
    );
};

export default StaffOrdersPage;
