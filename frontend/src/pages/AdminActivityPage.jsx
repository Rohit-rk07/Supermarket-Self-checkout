import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Button, TablePagination, TextField, MenuItem } from "@mui/material";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/ui/TopBar";
import Toast from "../components/ui/Toast";
import ResponsiveRows from "../components/ui/ResponsiveRows";

const API_URL = `${import.meta.env.VITE_SERVER_URL}/api/v1/audit`;
const getMessage = (data) => data?.message || data?.details || data?.error || "Something went wrong";

const GROUPS = [
    { value: "", label: "Everything" },
    { value: "product", label: "Products" },
    { value: "order", label: "Orders and refunds" },
    { value: "user", label: "Staff and accounts" },
    { value: "setting", label: "Settings" }
];

const AdminActivityPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === "admin";

    const [entries, setEntries] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(25);
    const [group, setGroup] = useState("");
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const query = new URLSearchParams({ page: page + 1, limit: rowsPerPage });
            if (group) query.set("group", group);
            const response = await fetch(`${API_URL}?${query}`, { headers: { Authorization: `Bearer ${user?.token}` } });
            const data = await response.json();
            if (!response.ok) throw new Error(getMessage(data));
            setEntries(data.data.entries);
            setTotal(data.data.pagination.total);
        } catch (error) {
            setToast({ message: error.message, severity: "error" });
        } finally {
            setLoading(false);
        }
    }, [page, rowsPerPage, group, user?.token]);

    useEffect(() => {
        if (isAdmin) load();
    }, [isAdmin, load]);

    if (!isAdmin) {
        return (
            <Box sx={{ minHeight: "100vh" }}>
                <TopBar title="Activity log" backTo="/dashboard" />
                <Box sx={{ maxWidth: 480, mx: "auto", px: 3, py: 8, textAlign: "center" }}>
                    <Typography component="h2" variant="h5" gutterBottom>Admins only</Typography>
                    <Button variant="outlined" onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
                </Box>
            </Box>
        );
    }

    const columns = [
        {
            label: "What happened",
            primary: true,
            render: (entry) => entry.summary
        },
        { label: "Who", render: (entry) => entry.actorName || "Unknown" },
        { label: "When", render: (entry) => new Date(entry.createdAt).toLocaleString() }
    ];

    return (
        <Box sx={{ minHeight: "100vh" }}>
            <TopBar title="Activity log" backTo="/dashboard" />
            <Box sx={{ maxWidth: 1040, mx: "auto", px: { xs: 2, sm: 3 }, pt: 3, pb: 8 }}>
                <Typography color="text.secondary" sx={{ mb: 3, maxWidth: 640 }}>
                    Who changed what: prices, products, roles, refunds and settings. Newest first.
                </Typography>
                <TextField
                    select
                    size="small"
                    label="Show"
                    value={group}
                    onChange={(event) => { setGroup(event.target.value); setPage(0); }}
                    sx={{ minWidth: 200, mb: 2 }}
                >
                    {GROUPS.map((option) => (
                        <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>
                    ))}
                </TextField>
                <ResponsiveRows
                    columns={columns}
                    rows={entries}
                    rowKey={(entry) => entry._id}
                    loading={loading}
                    emptyText="Nothing recorded yet."
                    footer={
                        <TablePagination
                            component="div"
                            count={total}
                            page={page}
                            onPageChange={(event, newPage) => setPage(newPage)}
                            rowsPerPage={rowsPerPage}
                            onRowsPerPageChange={(event) => { setRowsPerPage(parseInt(event.target.value, 10)); setPage(0); }}
                            rowsPerPageOptions={[25, 50, 100]}
                        />
                    }
                />
            </Box>
            <Toast toast={toast} onClose={() => setToast(null)} />
        </Box>
    );
};

export default AdminActivityPage;
