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

const AccountPage = () => {
    const { user, logout } = useAuth();
    const { orders, loading, error } = useOrders();
    const navigate = useNavigate();
    const [tab, setTab] = useState("receipts");
    const [selected, setSelected] = useState(null);

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
                        ) : orders.length === 0 ? (
                            <Box sx={{ textAlign: "center", py: 8 }}>
                                <Typography component="h3" variant="h4" sx={{ mb: 1 }}>No receipts yet</Typography>
                                <Typography color="text.secondary" sx={{ mb: 3 }}>
                                    Once you pay for a basket, its receipt will be kept here.
                                </Typography>
                                <Button variant="contained" onClick={() => navigate("/dashboard")}>Start shopping</Button>
                            </Box>
                        ) : (
                            orders.map((order) => {
                                const totals = getTotals(order);
                                const count = (order.items || []).reduce((n, item) => n + (item.quantity || 1), 0);
                                return (
                                    <Box
                                        key={order._id}
                                        sx={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 2, py: 2.25, borderTop: 1, borderColor: "divider" }}
                                    >
                                        <Box sx={{ minWidth: 0 }}>
                                            <Typography fontWeight={600} sx={{ wordBreak: "break-all" }}>
                                                {order.orderNumber || order._id.slice(-6).toUpperCase()}
                                            </Typography>
                                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
                                                {formatDateTime(order.paidAt || order.createdAt)} · {count} {count === 1 ? "item" : "items"}
                                            </Typography>
                                            <Button variant="outlined" size="small" onClick={() => setSelected(order)}>
                                                View receipt
                                            </Button>
                                        </Box>
                                        <Box sx={{ textAlign: "right" }}>
                                            <Money value={totals.total} sx={{ display: "block", fontWeight: 700, fontSize: "1.0625rem", mb: 0.75 }} />
                                            <StatusChip order={order} />
                                        </Box>
                                    </Box>
                                );
                            })
                        )}
                        {orders.length > 0 && <Box sx={{ borderTop: 1, borderColor: "divider" }} />}
                    </Box>
                )}

                {tab === "profile" && (
                    <Box>
                        <ProfileRow label="Full name" value={user?.name} />
                        <ProfileRow label="Phone number" value={user?.phoneNumber} />
                        <ProfileRow label="Email" value={user?.email} />
                        <ProfileRow label="Account type" value={ROLE_LABELS[user?.role] || "Shopper"} />
                        <ProfileRow label="Receipts" value={String(orders.length)} />
                        <Box sx={{ borderTop: 1, borderColor: "divider", pt: 3 }}>
                            <Button variant="outlined" color="error" onClick={handleLogout}>
                                Log out
                            </Button>
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
                <DialogContent sx={{ pt: 4, pb: 3 }}>
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
