import { useState } from "react";
import {
    Box,
    Typography,
    Button,
    Tabs,
    Tab,
    Avatar,
    Dialog,
    DialogContent,
    DialogActions,
    CircularProgress,
    Alert,
} from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useOrders } from "../context/OrderContext";
import TopBar from "./ui/TopBar";
import Money from "./ui/Money";
import Receipt from "./ui/Receipt";
import StatusChip from "./ui/StatusChip";
import { getTotals, formatDateTime } from "../utils/money";

const ROLE_LABELS = { admin: "Administrator", staff: "Store staff", customer: "Shopper" };

const ProfileRow = ({ label, value }) => (
    <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 1.75, borderTop: 1, borderColor: "divider" }}>
        <Typography color="text.secondary">{label}</Typography>
        <Typography fontWeight={600} sx={{ textAlign: "right", wordBreak: "break-word" }}>{value || "Not provided"}</Typography>
    </Box>
);

// One order in a list. Paid orders can be opened as a receipt; unfinished ones cannot.
const OrderRow = ({ order, onView }) => {
    const totals = getTotals(order);
    const count = (order.items || []).reduce((n, item) => n + (item.quantity || 1), 0);
    const isReceipt = order.paymentStatus === "paid" || order.paymentStatus === "refunded";
    return (
        <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 2, py: 2.25, borderTop: 1, borderColor: "divider" }}>
            <Box sx={{ minWidth: 0 }}>
                <Typography fontWeight={600} sx={{ wordBreak: "break-all" }}>
                    {order.orderNumber || order._id.slice(-6).toUpperCase()}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: isReceipt ? 1.25 : 0 }}>
                    {formatDateTime(order.paidAt || order.createdAt)} · {count} {count === 1 ? "item" : "items"}
                </Typography>
                {order.paymentStatus === "paid" && order.refundedAmount > 0 && (
                    <Typography variant="body2" sx={{ mb: 1.25, color: "warning.main", fontWeight: 600 }}>
                        <Money value={order.refundedAmount} /> was refunded to you
                    </Typography>
                )}
                {isReceipt && (
                    <Button variant="outlined" size="small" onClick={() => onView(order)}>
                        View receipt
                    </Button>
                )}
            </Box>
            <Box sx={{ textAlign: "right" }}>
                <Money value={totals.total} sx={{ display: "block", fontWeight: 700, fontSize: "1.0625rem", mb: 0.75 }} />
                <StatusChip order={order} />
            </Box>
        </Box>
    );
};

const AccountPage = () => {
    const { user, logout } = useAuth();
    const { orders, loading, error } = useOrders();
    const navigate = useNavigate();
    const [tab, setTab] = useState("receipts");
    const [selected, setSelected] = useState(null);

    // Only paid (or refunded) orders are receipts. Orders that were never paid, expired or cancelled are listed apart.
    const receipts = orders.filter((order) => order.paymentStatus === "paid" || order.paymentStatus === "refunded");
    const unfinished = orders.filter((order) => !(order.paymentStatus === "paid" || order.paymentStatus === "refunded"));

    // Cancels every sign-in of this account (phone, laptop, a borrowed device), then signs this one out too
    const [signingOutAll, setSigningOutAll] = useState(false);
    const [signOutAllError, setSignOutAllError] = useState("");
    const handleLogoutAll = async () => {
        setSigningOutAll(true);
        setSignOutAllError("");
        try {
            const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/auth/logout-all`, {
                method: "POST",
                headers: { Authorization: `Bearer ${user?.token}` }
            });
            if (!response.ok) throw new Error("Could not sign you out of all devices. Try again.");
            logout();
            navigate("/login");
        } catch (error) {
            setSignOutAllError(error.message);
        } finally {
            setSigningOutAll(false);
        }
    };

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    return (
        <Box sx={{ minHeight: "100vh", pb: 8 }}>
            <TopBar title="Account" backTo="/dashboard" hideAccount />

            <Box sx={{ maxWidth: 720, mx: "auto", px: { xs: 2, sm: 3 }, pt: 4 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 3 }}>
                    <Avatar sx={{ width: 56, height: 56, bgcolor: "primary.main", fontSize: "1.5rem", fontWeight: 600 }}>
                        {(user?.name || user?.phoneNumber || "U").toString().trim()[0]?.toUpperCase()}
                    </Avatar>
                    <Box sx={{ minWidth: 0 }}>
                        <Typography component="h2" variant="h3" noWrap>{user?.name || "Shopper"}</Typography>
                        <Typography color="text.secondary">{user?.phoneNumber}</Typography>
                    </Box>
                </Box>

                <Tabs
                    value={tab}
                    onChange={(event, value) => setTab(value)}
                    sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}
                >
                    <Tab value="receipts" label="Receipts" />
                    {unfinished.length > 0 && <Tab value="unfinished" label={`Unfinished (${unfinished.length})`} />}
                    <Tab value="profile" label="Profile" />
                </Tabs>

                {tab === "receipts" && (
                    <Box>
                        {loading ? (
                            <Box sx={{ textAlign: "center", py: 8 }}>
                                <CircularProgress size={28} />
                            </Box>
                        ) : error ? (
                            <Alert severity="error">{error}</Alert>
                        ) : receipts.length === 0 ? (
                            <Box sx={{ textAlign: "center", py: 8 }}>
                                <Typography component="h3" variant="h4" sx={{ mb: 1 }}>No receipts yet</Typography>
                                <Typography color="text.secondary" sx={{ mb: 3 }}>
                                    Once you pay for a basket, its receipt will be kept here.
                                </Typography>
                                <Button variant="contained" onClick={() => navigate("/dashboard")}>Start shopping</Button>
                            </Box>
                        ) : (
                            receipts.map((order) => <OrderRow key={order._id} order={order} onView={setSelected} />)
                        )}
                        {receipts.length > 0 && <Box sx={{ borderTop: 1, borderColor: "divider" }} />}
                    </Box>
                )}

                {tab === "unfinished" && (
                    <Box>
                        <Typography color="text.secondary" sx={{ mb: 2 }}>
                            These baskets were never paid for, so there is no receipt. To buy the items, scan them again and pay.
                        </Typography>
                        {unfinished.map((order) => <OrderRow key={order._id} order={order} onView={setSelected} />)}
                        <Box sx={{ borderTop: 1, borderColor: "divider" }} />
                    </Box>
                )}

                {tab === "profile" && (
                    <Box>
                        <ProfileRow label="Full name" value={user?.name} />
                        <ProfileRow label="Phone number" value={user?.phoneNumber} />
                        <ProfileRow label="Email" value={user?.email} />
                        <ProfileRow label="Account type" value={ROLE_LABELS[user?.role] || "Shopper"} />
                        <ProfileRow label="Receipts" value={String(receipts.length)} />
                        <Box sx={{ borderTop: 1, borderColor: "divider", pt: 3 }}>
                            <Button variant="outlined" color="error" onClick={handleLogout}>
                                Log out
                            </Button>
                            <Box sx={{ mt: 2 }}>
                                <Button color="error" onClick={handleLogoutAll} disabled={signingOutAll}>
                                    {signingOutAll ? "Signing out..." : "Sign out of all devices"}
                                </Button>
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                                    Use this if you lost your phone or signed in on a device that is not yours.
                                </Typography>
                                {signOutAllError && <Alert severity="error" sx={{ mt: 1 }}>{signOutAllError}</Alert>}
                            </Box>
                        </Box>
                    </Box>
                )}
            </Box>

            {/* The receipt, shown on paper */}
            <Dialog
                open={!!selected}
                onClose={() => setSelected(null)}
                fullWidth
                maxWidth="xs"
                aria-label="Receipt"
                PaperProps={{ sx: { backgroundColor: "background.default", boxShadow: "none" } }}
            >
                <DialogContent tabIndex={0} sx={{ pt: 4, pb: 3 }}>
                    <Receipt order={selected} />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
                    <Button onClick={() => setSelected(null)}>Close</Button>
                    <Button variant="contained" onClick={() => window.print()}>Print receipt</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default AccountPage;
