import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Typography, Button, TextField, Slider, CircularProgress } from "@mui/material";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/ui/TopBar";
import Toast from "../components/ui/Toast";

const API_URL = `${import.meta.env.VITE_SERVER_URL}/api/v1/orders/settings/bag-check`;
const getMessage = (data) => data?.message || data?.details || data?.error || "Something went wrong";

const AdminSettingsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === "admin";

    const [saved, setSaved] = useState(null); // value on the server
    const [value, setValue] = useState(10); // value on screen
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);

    const headers = useCallback(() => ({
        "Content-Type": "application/json",
        Authorization: `Bearer ${user?.token}`
    }), [user?.token]);

    useEffect(() => {
        if (!isAdmin) return;
        (async () => {
            try {
                const response = await fetch(API_URL, { headers: headers() });
                const data = await response.json();
                if (!response.ok) throw new Error(getMessage(data));
                setSaved(data.data.percent);
                setValue(data.data.percent);
            } catch (error) {
                setToast({ message: error.message, severity: "error" });
            } finally {
                setLoading(false);
            }
        })();
    }, [isAdmin, headers]);

    const save = async () => {
        setSaving(true);
        try {
            const response = await fetch(API_URL, { method: "PUT", headers: headers(), body: JSON.stringify({ percent: value }) });
            const data = await response.json();
            if (!response.ok) throw new Error(getMessage(data));
            setSaved(data.data.percent);
            setValue(data.data.percent);
            setToast({ message: "Saved", severity: "success" });
        } catch (error) {
            setToast({ message: error.message, severity: "error" });
        } finally {
            setSaving(false);
        }
    };

    if (!isAdmin) {
        return (
            <Box sx={{ minHeight: "100vh" }}>
                <TopBar title="Store settings" backTo="/dashboard" />
                <Box sx={{ maxWidth: 480, mx: "auto", px: 3, py: 8, textAlign: "center" }}>
                    <Typography component="h2" variant="h5" gutterBottom>Admins only</Typography>
                    <Button variant="outlined" onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
                </Box>
            </Box>
        );
    }

    return (
        <Box sx={{ minHeight: "100vh" }}>
            <TopBar title="Store settings" backTo="/dashboard" />
            <Box sx={{ maxWidth: 640, mx: "auto", px: { xs: 2, sm: 3 }, pt: 3, pb: 8 }}>
                <Typography component="h2" variant="h5" sx={{ mb: 1 }}>Random bag checks</Typography>
                <Typography color="text.secondary" sx={{ mb: 3 }}>
                    Out of every 100 paid orders, this many are picked for staff to look inside the bag at the exit. 0 turns checks off, 100 checks everyone.
                </Typography>
                {loading ? (
                    <CircularProgress size={28} />
                ) : (
                    <>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 3, mb: 3 }}>
                            <Slider
                                value={value}
                                min={0}
                                max={100}
                                step={5}
                                onChange={(event, next) => setValue(next)}
                                aria-label="Bag check percent"
                                sx={{ flex: 1 }}
                            />
                            <TextField
                                size="small"
                                type="number"
                                value={value}
                                onChange={(event) => setValue(Math.min(100, Math.max(0, Number(event.target.value) || 0)))}
                                inputProps={{ min: 0, max: 100, "aria-label": "Percent" }}
                                sx={{ width: 90 }}
                            />
                        </Box>
                        <Button variant="contained" onClick={save} disabled={saving || value === saved}>
                            {saving ? "Saving..." : "Save"}
                        </Button>
                    </>
                )}
            </Box>
            <Toast toast={toast} onClose={() => setToast(null)} />
        </Box>
    );
};

export default AdminSettingsPage;
