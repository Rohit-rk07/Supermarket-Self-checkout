import { useState, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Button, TextField, ToggleButton, ToggleButtonGroup, CircularProgress, Alert } from "@mui/material";
import { Download } from "@mui/icons-material";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/ui/TopBar";
import Money from "../components/ui/Money";
import Toast from "../components/ui/Toast";
import { Tile } from "./home/Parts";
import { tokens } from "../theme/theme";

const API_URL = `${import.meta.env.VITE_SERVER_URL}/api/v1/orders/reports/sales`;
const getMessage = (data) => data?.message || data?.details || data?.error || "Something went wrong";

// "2026-11-05" in the viewer's own calendar
const dayString = (date) => {
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dayString(d); };
const startOfMonth = () => { const d = new Date(); d.setDate(1); return dayString(d); };

const PRESETS = {
    today: () => ({ from: daysAgo(0), to: daysAgo(0) }),
    week: () => ({ from: daysAgo(6), to: daysAgo(0) }),
    month: () => ({ from: startOfMonth(), to: daysAgo(0) }),
    last30: () => ({ from: daysAgo(29), to: daysAgo(0) })
};

// "+05:30" for the browser's own timezone, so days are cut at the shop's midnight
const offsetString = () => {
    const minutes = -new Date().getTimezoneOffset();
    const sign = minutes < 0 ? "-" : "+";
    const abs = Math.abs(minutes);
    return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
};

const csvCell = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const AdminReportsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === "admin";

    const [preset, setPreset] = useState("week");
    const [range, setRange] = useState(PRESETS.week());
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(true);
    const [toast, setToast] = useState(null);

    const load = useCallback(async () => {
        if (!range.from || !range.to || range.to < range.from) return;
        setLoading(true);
        try {
            const [fy, fm, fd] = range.from.split("-").map(Number);
            const [ty, tm, td] = range.to.split("-").map(Number);
            const from = new Date(fy, fm - 1, fd); // local midnight
            const to = new Date(ty, tm - 1, td + 1); // local midnight after the last day
            const query = new URLSearchParams({ from: from.toISOString(), to: to.toISOString(), tz: offsetString() });
            const response = await fetch(`${API_URL}?${query}`, { headers: { Authorization: `Bearer ${user?.token}` } });
            const data = await response.json();
            if (!response.ok) throw new Error(getMessage(data));
            setReport(data.data);
        } catch (error) {
            setToast({ message: error.message, severity: "error" });
        } finally {
            setLoading(false);
        }
    }, [range, user?.token]);

    useEffect(() => {
        if (isAdmin) load();
    }, [isAdmin, load]);

    const maxSales = useMemo(() => Math.max(1, ...(report?.byDay || []).map((day) => day.sales)), [report]);

    const downloadCsv = () => {
        if (!report) return;
        const lines = [
            ["Date", "Orders", "Sales (incl. GST)", "GST in sales", "Refunds", "Refunded amount"].map(csvCell).join(","),
            ...report.byDay.map((day) => [day.date, day.orders, day.sales, day.tax, day.refunds, day.refunded].map(csvCell).join(",")),
            "",
            ["Top products", "Barcode", "Units sold", "Revenue"].map(csvCell).join(","),
            ...report.topProducts.map((p) => ["", p.barcode, p.quantity, p.revenue].map(csvCell).join(",").replace('""', csvCell(p.name)))
        ];
        const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `sales-${range.from}-to-${range.to}.csv`;
        link.click();
        URL.revokeObjectURL(url);
    };

    if (!isAdmin) {
        return (
            <Box sx={{ minHeight: "100vh" }}>
                <TopBar title="Reports" backTo="/dashboard" />
                <Box sx={{ maxWidth: 480, mx: "auto", px: 3, py: 8, textAlign: "center" }}>
                    <Typography component="h2" variant="h5" gutterBottom>Admins only</Typography>
                    <Button variant="outlined" onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
                </Box>
            </Box>
        );
    }

    const summary = report?.summary;

    return (
        <Box sx={{ minHeight: "100vh" }}>
            <TopBar title="Reports" backTo="/dashboard" />
            <Box sx={{ maxWidth: 1040, mx: "auto", px: { xs: 2, sm: 3 }, pt: 3, pb: 8 }}>
                <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center", mb: 3 }}>
                    <ToggleButtonGroup
                        exclusive
                        size="small"
                        value={preset}
                        onChange={(event, value) => { if (value) { setPreset(value); setRange(PRESETS[value]()); } }}
                        aria-label="Period"
                    >
                        <ToggleButton value="today">Today</ToggleButton>
                        <ToggleButton value="week">7 days</ToggleButton>
                        <ToggleButton value="month">This month</ToggleButton>
                        <ToggleButton value="last30">30 days</ToggleButton>
                    </ToggleButtonGroup>
                    <TextField size="small" type="date" label="From" InputLabelProps={{ shrink: true }} value={range.from}
                        onChange={(event) => { setPreset(""); setRange((prev) => ({ ...prev, from: event.target.value })); }} />
                    <TextField size="small" type="date" label="To" InputLabelProps={{ shrink: true }} value={range.to}
                        onChange={(event) => { setPreset(""); setRange((prev) => ({ ...prev, to: event.target.value })); }} />
                    <Button startIcon={<Download />} onClick={downloadCsv} disabled={!report || loading} sx={{ ml: { sm: "auto" } }}>
                        Download CSV
                    </Button>
                </Box>

                {range.to < range.from && <Alert severity="warning" sx={{ mb: 2 }}>The end day is before the start day.</Alert>}

                {loading && !report ? (
                    <Box sx={{ textAlign: "center", py: 6 }}><CircularProgress aria-label="Loading the report" /></Box>
                ) : report && (
                    <Box sx={{ opacity: loading ? 0.5 : 1 }}>
                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(3, 1fr)" }, gap: 1.5, mb: 4 }}>
                            <Tile label="Sales (incl. GST)" value={<Money value={summary.sales} />} hint={`${summary.orders} paid ${summary.orders === 1 ? "order" : "orders"}`} />
                            <Tile label="Refunded" value={<Money value={summary.refunded} />} hint={`${summary.refunds} ${summary.refunds === 1 ? "refund" : "refunds"}`} tone={summary.refunds > 0 ? "warning" : undefined} />
                            <Tile label="Net sales" value={<Money value={summary.net} />} hint="Sales minus refunds" />
                            <Tile label="Average basket" value={<Money value={summary.averageBasket} />} />
                            <Tile label="GST in sales" value={<Money value={summary.tax} />} hint="Included and added" />
                        </Box>

                        <Typography component="h2" variant="h5" sx={{ mb: 1.5 }}>Sales by day</Typography>
                        <Box sx={{ mb: 4 }}>
                            {report.byDay.map((day) => (
                                <Box key={day.date} sx={{ display: "grid", gridTemplateColumns: { xs: "84px 1fr 84px", sm: "110px 1fr 120px" }, gap: 1.5, alignItems: "center", py: 0.5 }}>
                                    <Typography variant="body2" color="text.secondary">
                                        {new Date(`${day.date}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                                    </Typography>
                                    <Box sx={{ height: 14, borderRadius: "4px", backgroundColor: "action.hover", overflow: "hidden" }} aria-hidden="true">
                                        <Box sx={{ height: "100%", width: `${(day.sales / maxSales) * 100}%`, backgroundColor: tokens.forest || "primary.main", minWidth: day.sales > 0 ? 3 : 0 }} />
                                    </Box>
                                    <Typography variant="body2" sx={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                                        <Money value={day.sales} /> <span style={{ opacity: 0.6 }}>({day.orders})</span>
                                    </Typography>
                                </Box>
                            ))}
                        </Box>

                        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 4 }}>
                            <Box>
                                <Typography component="h2" variant="h5" sx={{ mb: 1.5 }}>Top products</Typography>
                                {report.topProducts.length === 0 ? (
                                    <Typography color="text.secondary">No sales in this period.</Typography>
                                ) : report.topProducts.map((product) => (
                                    <Box key={product.barcode} sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 1.25, borderTop: 1, borderColor: "divider" }}>
                                        <Typography sx={{ minWidth: 0 }}>{product.name}</Typography>
                                        <Typography sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                                            {product.quantity} sold · <Money value={product.revenue} />
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                            <Box>
                                <Typography component="h2" variant="h5" sx={{ mb: 1.5 }}>Running low</Typography>
                                {report.lowStock.length === 0 ? (
                                    <Typography color="text.secondary">No tracked product is running low.</Typography>
                                ) : report.lowStock.map((product) => (
                                    <Box key={product.barcode} sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 1.25, borderTop: 1, borderColor: "divider" }}>
                                        <Typography sx={{ minWidth: 0 }}>{product.name}</Typography>
                                        <Typography sx={{ color: "error.main", fontWeight: 700 }}>{product.stock} left</Typography>
                                    </Box>
                                ))}
                                {report.lowStock.length > 0 && (
                                    <Button sx={{ mt: 1 }} onClick={() => navigate("/admin/products?low=1")}>Restock in Products</Button>
                                )}
                            </Box>
                        </Box>
                    </Box>
                )}
            </Box>
            <Toast toast={toast} onClose={() => setToast(null)} />
        </Box>
    );
};

export default AdminReportsPage;
