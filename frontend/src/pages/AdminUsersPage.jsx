import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
    Box,
    Container,
    Typography,
    Button,
    Paper,
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
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Snackbar,
    Alert,
    CircularProgress
} from "@mui/material";
import { ArrowBack, Search } from "@mui/icons-material";
import { useAuth } from "../context/AuthContext";

const API_URL = `${import.meta.env.VITE_SERVER_URL}/api/v1/users`;

const ROLE_OPTIONS = [
    { value: "customer", label: "Customer", hint: "Can scan, pay and see their own orders" },
    { value: "staff", label: "Staff", hint: "Can also verify receipts at the exit and view all orders" },
    { value: "admin", label: "Admin", hint: "Can also manage products and staff roles" }
];

const roleLabel = (value) => ROLE_OPTIONS.find((option) => option.value === value)?.label || value;

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
    const [saving, setSaving] = useState(false);
    const [snackbar, setSnackbar] = useState(null);

    const notify = (message, severity = "success") => setSnackbar({ message, severity });

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
            notify(error.message, "error");
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

    if (!isAdmin) {
        return (
            <Container maxWidth="sm" sx={{ py: 8, textAlign: "center" }}>
                <Typography variant="h5" fontWeight="600" gutterBottom>Admins only</Typography>
                <Typography variant="body1" sx={{ color: "#64748b", mb: 3 }}>
                    Your account does not have permission to manage staff.
                </Typography>
                <Button variant="outlined" onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
            </Container>
        );
    }

    return (
        <Box sx={{ minHeight: "100vh", backgroundColor: "#f8fafc", py: 4 }}>
            <Container maxWidth="lg">
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                    <Tooltip title="Back to dashboard">
                        <IconButton onClick={() => navigate("/dashboard")}><ArrowBack /></IconButton>
                    </Tooltip>
                    <Typography variant="h4" fontWeight="700" sx={{ color: "#1e293b" }}>Manage Staff</Typography>
                </Box>
                <Typography variant="body2" sx={{ color: "#64748b", mb: 3, ml: 6 }}>
                    New staff sign in with their own phone number first. Then find them here and give them the Staff role. Changes apply the next time they open the app.
                </Typography>

                <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap" }}>
                    <TextField
                        size="small"
                        label="Search name or phone"
                        value={searchInput}
                        onChange={(event) => setSearchInput(event.target.value)}
                        onKeyDown={(event) => { if (event.key === "Enter") runSearch(); }}
                        sx={{ minWidth: 240 }}
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
                        {ROLE_OPTIONS.map((option) => (
                            <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                        ))}
                    </TextField>
                </Box>

                <Paper elevation={0} sx={{ border: "1px solid #f1f5f9", borderRadius: 2 }}>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell><strong>Name</strong></TableCell>
                                    <TableCell><strong>Phone</strong></TableCell>
                                    <TableCell><strong>Role</strong></TableCell>
                                    <TableCell><strong>Last login</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={4} align="center" sx={{ py: 6 }}>
                                            <CircularProgress size={32} sx={{ color: "#10b981" }} />
                                        </TableCell>
                                    </TableRow>
                                ) : users.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} align="center" sx={{ py: 6, color: "#64748b" }}>
                                            No users match your search.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    users.map((person) => {
                                        const isMe = String(person._id) === myId;
                                        return (
                                            <TableRow key={person._id} hover>
                                                <TableCell>
                                                    {person.name || "Unnamed"}
                                                    {isMe && <Chip size="small" label="You" sx={{ ml: 1 }} />}
                                                </TableCell>
                                                <TableCell sx={{ fontFamily: "monospace" }}>{person.phoneNumber}</TableCell>
                                                <TableCell>
                                                    <Tooltip title={isMe ? "You cannot change your own role" : ""}>
                                                        <span>
                                                            <TextField
                                                                select
                                                                size="small"
                                                                value={person.role}
                                                                disabled={isMe}
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
                                                </TableCell>
                                                <TableCell>
                                                    {person.lastLogin ? new Date(person.lastLogin).toLocaleString() : ""}
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

            {/* Confirm a role change */}
            <Dialog open={!!pendingChange} onClose={() => !saving && setPendingChange(null)} fullWidth maxWidth="xs">
                <DialogTitle>Change role?</DialogTitle>
                <DialogContent>
                    <Typography gutterBottom>
                        {pendingChange?.target.name || pendingChange?.target.phoneNumber}: {roleLabel(pendingChange?.target.role)} → <strong>{roleLabel(pendingChange?.role)}</strong>
                    </Typography>
                    <Typography variant="body2" sx={{ color: "#64748b" }}>
                        {ROLE_OPTIONS.find((option) => option.value === pendingChange?.role)?.hint}
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setPendingChange(null)} disabled={saving}>Cancel</Button>
                    <Button
                        variant="contained"
                        onClick={confirmChange}
                        disabled={saving}
                        sx={{ backgroundColor: "#10b981", "&:hover": { backgroundColor: "#059669" } }}
                    >
                        {saving ? "Saving..." : "Confirm"}
                    </Button>
                </DialogActions>
            </Dialog>

            <Snackbar
                open={!!snackbar}
                autoHideDuration={4000}
                onClose={() => setSnackbar(null)}
                anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
            >
                {snackbar ? (
                    <Alert severity={snackbar.severity} onClose={() => setSnackbar(null)} variant="filled">
                        {snackbar.message}
                    </Alert>
                ) : undefined}
            </Snackbar>
        </Box>
    );
};

export default AdminUsersPage;
