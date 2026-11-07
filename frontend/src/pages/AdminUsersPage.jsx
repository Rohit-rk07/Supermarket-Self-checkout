import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
    Box,
    Typography,
    Button,
    TablePagination,
    TextField,
    MenuItem,
    Chip,
    Tooltip,
    DialogTitle,
    DialogContent,
    DialogActions
} from "@mui/material";
import { Search } from "@mui/icons-material";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/ui/TopBar";
import Toast from "../components/ui/Toast";
import Sheet from "../components/ui/Sheet";
import ResponsiveRows from "../components/ui/ResponsiveRows";
import { tokens } from "../theme/theme";

const API_URL = `${import.meta.env.VITE_SERVER_URL}/api/v1/users`;

const ROLE_OPTIONS = [
    { value: "customer", label: "Customer", hint: "Can scan, pay and see their own orders" },
    { value: "staff", label: "Staff", hint: "Can also verify receipts at the exit and view all orders" }
];

// Admins are set on the server (ADMIN_EMAILS), so they can be filtered and shown but not chosen here
const FILTER_OPTIONS = [...ROLE_OPTIONS, { value: "admin", label: "Admin" }];

const roleLabel = (value) => FILTER_OPTIONS.find((option) => option.value === value)?.label || value;

const getMessage = (data) => data?.message || data?.details || data?.error || "Something went wrong";

const AdminUsersPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === "admin";
    const token = user?.token;
    const myId = String(user?._id || user?.id || "");

    const [users, setUsers] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [roleFilter, setRoleFilter] = useState("");
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);
    const [pendingChange, setPendingChange] = useState(null); // { target, role }
    const [pendingDeactivate, setPendingDeactivate] = useState(null); // the user about to be switched off
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);

    const notify = (message, severity = "success") => setToast({ message, severity });

    const authHeaders = useCallback(() => ({
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    }), [token]);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const query = new URLSearchParams({ page: page + 1, limit: rowsPerPage });
            if (roleFilter) query.set("role", roleFilter);
            if (search) query.set("search", search);

            const response = await fetch(`${API_URL}?${query}`, { headers: authHeaders() });
            const data = await response.json();
            if (!response.ok) throw new Error(getMessage(data));

            setUsers(data.data.users);
            setTotal(data.data.pagination.total);
        } catch (error) {
            setToast({ message: error.message, severity: "error" });
        } finally {
            setLoading(false);
        }
    }, [page, rowsPerPage, roleFilter, search, authHeaders]);

    useEffect(() => {
        if (isAdmin) fetchUsers();
    }, [isAdmin, fetchUsers]);

    const runSearch = () => {
        setPage(0);
        setSearch(searchInput.trim());
    };

    const confirmChange = async () => {
        setSaving(true);
        try {
            const response = await fetch(`${API_URL}/${pendingChange.target._id}/role`, {
                method: "PUT",
                headers: authHeaders(),
                body: JSON.stringify({ role: pendingChange.role })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(getMessage(data));

            notify(data.message);
            setPendingChange(null);
            fetchUsers();
        } catch (error) {
            notify(error.message, "error");
        } finally {
            setSaving(false);
        }
    };

    // Switch an account off or on. Nothing is deleted, so orders and exit records stay in the history.
    const setActive = async (target, isActive) => {
        setSaving(true);
        try {
            const response = await fetch(`${API_URL}/${target._id}/active`, {
                method: "PUT",
                headers: authHeaders(),
                body: JSON.stringify({ isActive })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(getMessage(data));

            notify(data.message);
            setPendingDeactivate(null);
            fetchUsers();
        } catch (error) {
            notify(error.message, "error");
        } finally {
            setSaving(false);
        }
    };

    if (!isAdmin) {
        return (
            <Box sx={{ minHeight: "100vh" }}>
                <TopBar title="Manage staff" backTo="/dashboard" />
                <Box sx={{ maxWidth: 480, mx: "auto", px: 3, py: 8, textAlign: "center" }}>
                    <Typography component="h2" variant="h5" gutterBottom>Admins only</Typography>
                    <Typography color="text.secondary" sx={{ mb: 3 }}>
                        Your account does not have permission to manage staff.
                    </Typography>
                    <Button variant="outlined" onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
                </Box>
            </Box>
        );
    }

    const columns = [
        {
            label: "Name",
            primary: true,
            render: (person) => (
                <>
                    {person.name || "Unnamed"}
                    {String(person._id) === myId && <Chip size="small" label="You" sx={{ ml: 1 }} />}
                </>
            )
        },
        {
            label: "Email",
            render: (person) => <span style={{ wordBreak: "break-all" }}>{person.email}</span>
        },
        {
            label: "Role",
            render: (person) => {
                const isMe = String(person._id) === myId;
                if (person.role === "admin") {
                    return <Chip size="small" label="Admin" />;
                }
                return (
                    <Tooltip title={isMe ? "You cannot change your own role" : ""}>
                        <span>
                            <TextField
                                select
                                size="small"
                                value={person.role}
                                disabled={isMe}
                                inputProps={{ "aria-label": `Role for ${person.name || person.email}` }}
                                onChange={(event) => {
                                    if (event.target.value !== person.role) {
                                        setPendingChange({ target: person, role: event.target.value });
                                    }
                                }}
                                sx={{ minWidth: 130 }}
                            >
                                {ROLE_OPTIONS.map((option) => (
                                    <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                                ))}
                            </TextField>
                        </span>
                    </Tooltip>
                );
            }
        },
        {
            label: "Status",
            render: (person) => (
                <Chip
                    size="small"
                    label={person.isActive === false ? "Deactivated" : "Active"}
                    sx={person.isActive === false ? { backgroundColor: tokens.danger.bg, color: tokens.danger.fg } : { backgroundColor: tokens.success.bg, color: tokens.success.fg }}
                />
            )
        },
        {
            label: "Last login",
            render: (person) => (person.lastLogin ? new Date(person.lastLogin).toLocaleString() : "")
        },
        {
            label: "Action",
            actions: true,
            render: (person) => {
                if (String(person._id) === myId) return null;
                return person.isActive === false ? (
                    <Button size="small" variant="outlined" disabled={saving} onClick={() => setActive(person, true)}>Reactivate</Button>
                ) : (
                    <Button size="small" variant="outlined" color="error" onClick={() => setPendingDeactivate(person)}>Deactivate</Button>
                );
            }
        }
    ];

    return (
        <Box sx={{ minHeight: "100vh" }}>
            <TopBar title="Manage staff" backTo="/dashboard" />

            <Box sx={{ maxWidth: 1040, mx: "auto", px: { xs: 2, sm: 3 }, pt: 3, pb: 8 }}>
                <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 640 }}>
                    New staff sign in with their own Google account first. Then find them here and give them the Staff role. Admins are set by the server setting ADMIN_EMAILS. Changes apply the next time they open the app.
                </Typography>

                <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
                    <TextField
                        size="small"
                        label="Search name or email"
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") runSearch(); }}
                        sx={{ minWidth: { xs: "100%", sm: 240 } }}
                    />
                    <Button variant="outlined" startIcon={<Search />} onClick={runSearch}>Search</Button>
                    <TextField
                        select
                        size="small"
                        label="Role"
                        value={roleFilter}
                        onChange={(event) => { setRoleFilter(event.target.value); setPage(0); }}
                        sx={{ minWidth: 150 }}
                    >
                        <MenuItem value="">All roles</MenuItem>
                        {FILTER_OPTIONS.map((option) => (
                            <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                        ))}
                    </TextField>
                </Box>

                <ResponsiveRows
                    columns={columns}
                    rows={users}
                    rowKey={(person) => person._id}
                    loading={loading}
                    emptyText="No users match your search."
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

            {/* Confirm a role change */}
            <Sheet open={!!pendingChange} onClose={() => !saving && setPendingChange(null)} maxWidth="xs">
                <DialogTitle>Change role?</DialogTitle>
                <DialogContent>
                    <Typography gutterBottom>
                        {pendingChange?.target.name || pendingChange?.target.email}: {roleLabel(pendingChange?.target.role)} {"→"} <strong>{roleLabel(pendingChange?.role)}</strong>
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        {ROLE_OPTIONS.find((option) => option.value === pendingChange?.role)?.hint}
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setPendingChange(null)} disabled={saving}>Cancel</Button>
                    <Button variant="contained" onClick={confirmChange} disabled={saving}>
                        {saving ? "Saving..." : "Confirm"}
                    </Button>
                </DialogActions>
            </Sheet>

            {/* Confirm switching an account off */}
            <Sheet open={!!pendingDeactivate} onClose={() => !saving && setPendingDeactivate(null)} maxWidth="xs">
                <DialogTitle>Deactivate this account?</DialogTitle>
                <DialogContent>
                    <Typography gutterBottom>
                        {pendingDeactivate?.name || pendingDeactivate?.email} will be signed out and cannot sign in again until you reactivate them.
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Nothing is deleted: their orders and the exits they confirmed stay in the history.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setPendingDeactivate(null)} disabled={saving}>Cancel</Button>
                    <Button variant="contained" color="error" onClick={() => setActive(pendingDeactivate, false)} disabled={saving}>
                        {saving ? "Saving..." : "Deactivate"}
                    </Button>
                </DialogActions>
            </Sheet>

            <Toast toast={toast} onClose={() => setToast(null)} />
        </Box>
    );
};

export default AdminUsersPage;
