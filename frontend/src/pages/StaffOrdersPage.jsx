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
    { value: "failed", label: "Failed" }
];

const PAYMENT_CHIP = {
    paid: { label: "Paid", color: "#166534", background: "#dcfce7" },
    pending: { label: "Unpaid", color: "#92400e", background: "#fef3c7" },
    failed: { label: "Failed", color: "#991b1b", background: "#fee2e2" },
    refunded: { label: "Refunded", color: "#1e40af", background: "#dbeafe" }
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

    const load = useCallback(async () => {
        setLoading(true);
        setError(null);

        const headers = { "Authorization": `Bearer ${token}` };
        const query = new URLSearchParams({ page: page + 1, limit: rowsPerPage });
        if (paymentFilter) query.set("paymentStatus", paymentFilter);

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
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [token, page, rowsPerPage, paymentFilter]);

    useEffect(() => {
        if (canView) load();
    }, [canView, load]);

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

                {stats && (
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid item xs={6} md={3}><StatCard label="Total orders" value={stats.totalOrders} /></Grid>
                        <Grid item xs={6} md={3}><StatCard label="Revenue (paid, incl. GST)" value={`₹${Number(stats.totalRevenue).toFixed(2)}`} /></Grid>
                        <Grid item xs={6} md={3}><StatCard label="Unpaid" value={stats.pendingOrders} /></Grid>
                        <Grid item xs={6} md={3}><StatCard label="Cancelled" value={stats.cancelledOrders} /></Grid>
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
                                        const chip = PAYMENT_CHIP[order.paymentStatus] || PAYMENT_CHIP.pending;
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
