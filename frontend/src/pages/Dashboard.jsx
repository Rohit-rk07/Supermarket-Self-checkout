import { lazy, Suspense, useState, useCallback, useRef, useEffect } from "react";
import { Box, Typography, Button, TextField, ButtonBase, Alert } from "@mui/material";
import { QrCodeScanner as ScanIcon, ChevronRight } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";
import TopBar from "../components/ui/TopBar";
import Toast from "../components/ui/Toast";
import Money from "../components/ui/Money";
import { getBasketTotals } from "../utils/money";
import { tokens } from "../theme/theme";

const BarcodeScanner = lazy(() => import("../components/BarcodeScanner"));

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

const ToolRow = ({ title, description, onClick }) => (
  <ButtonBase
    onClick={onClick}
    sx={{
      width: "100%",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      textAlign: "left",
      py: 1.75,
      borderTop: 1,
      borderColor: "divider",
      "&:hover": { backgroundColor: "rgba(20, 32, 26, 0.04)" },
    }}
  >
    <Box>
      <Typography fontWeight={600}>{title}</Typography>
      <Typography variant="body2" color="text.secondary">{description}</Typography>
    </Box>
    <ChevronRight sx={{ color: "text.secondary" }} />
  </ButtonBase>
);

const Dashboard = () => {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manual, setManual] = useState("");
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState(null);
  const [payments, setPayments] = useState(null); // webhook status, admins only
  const { cart, addToCart, totalItems } = useCart();
  const basketTotal = getBasketTotals(cart).total;
  const { user } = useAuth();
  const navigate = useNavigate();

  const isStaff = user?.role === "admin" || user?.role === "staff";
  const isAdmin = user?.role === "admin";
  const firstName = (user?.name || "").trim().split(" ")[0];

  // Admins see whether the payment webhook is on and when it last called
  useEffect(() => {
    if (!isAdmin || !user?.token) return undefined;
    let cancelled = false;
    fetch(`${import.meta.env.VITE_SERVER_URL}/api/v1/orders/stats`, { headers: { Authorization: `Bearer ${user.token}` } })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => { if (!cancelled && body?.data?.payments) setPayments(body.data.payments); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAdmin, user?.token]);

  // Look a barcode up on the server and put the product in the basket
  const addByBarcode = async (raw) => {
    const barcode = String(raw || "").trim();
    if (!barcode) return false;

    try {
      const SERVER_URL = import.meta.env.VITE_SERVER_URL;
      const response = await fetch(`${SERVER_URL}/api/v1/scan/${encodeURIComponent(barcode)}`, {
        headers: { Authorization: `Bearer ${user?.token}` },
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error || body.message || "We could not find that product.");
      }

      const product = body.success ? body.data : body;
      addToCart(product);
      setToast({ severity: "success", message: `${product.name} added to your basket.` });
      return true;
    } catch (error) {
      setToast({ severity: "error", message: error.message || "We could not find that product." });
      return false;
    }
  };

  // The scanner restarts if its callbacks change, so keep them stable
  const addRef = useRef(addByBarcode);
  addRef.current = addByBarcode;
  const handleScan = useCallback((text) => addRef.current(text), []);
  const closeScanner = useCallback(() => setScannerOpen(false), []);

  const handleManualSubmit = async (event) => {
    event.preventDefault();
    setAdding(true);
    const added = await addByBarcode(manual);
    if (added) setManual("");
    setAdding(false);
  };

  return (
    <Box sx={{ minHeight: "100vh", pb: totalItems > 0 ? 14 : 6 }}>
      <TopBar />

      <Box sx={{ maxWidth: 640, mx: "auto", px: { xs: 2, sm: 3 }, pt: { xs: 4, sm: 6 } }}>
        <Typography component="h1" variant="h2" sx={{ mb: 1 }}>
          {greeting()}{firstName ? `, ${firstName}` : ""}.
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 4 }}>
          Scan each item as you shop. Pay when you are done.
        </Typography>

        <Button
          variant="contained"
          size="large"
          fullWidth
          startIcon={<ScanIcon />}
          onClick={() => setScannerOpen(true)}
          sx={{ minHeight: 64, fontSize: "1.125rem" }}
        >
          Scan an item
        </Button>

        <Box component="form" onSubmit={handleManualSubmit} sx={{ mt: 2.5, display: "flex", gap: 1.5 }}>
          <TextField
            fullWidth
            size="small"
            label="Or type the barcode number"
            value={manual}
            onChange={(event) => setManual(event.target.value)}
            inputProps={{ inputMode: "numeric", "aria-label": "Barcode number" }}
          />
          <Button type="submit" variant="outlined" disabled={!manual.trim() || adding} sx={{ flexShrink: 0 }}>
            Add
          </Button>
        </Box>

        {cart.length > 0 && (
          <Box sx={{ mt: 6 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 1 }}>
              <Typography component="h2" variant="h5">Your basket</Typography>
              <Button variant="text" size="small" onClick={() => navigate("/cart")}>Open basket</Button>
            </Box>
            {cart.slice(0, 5).map((item) => (
              <Box
                key={item.barcode}
                sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 1.5, borderTop: 1, borderColor: "divider" }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={600} noWrap>{item.name || item.barcode}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {item.quantity || 1} × <Money value={item.price || 0} />
                  </Typography>
                </Box>
                <Money value={(item.price || 0) * (item.quantity || 1)} sx={{ fontWeight: 600 }} />
              </Box>
            ))}
            {cart.length > 5 && (
              <Typography variant="body2" color="text.secondary" sx={{ pt: 1.5, borderTop: 1, borderColor: "divider" }}>
                and {cart.length - 5} more
              </Typography>
            )}
          </Box>
        )}

        {isStaff && (
          <Box sx={{ mt: 7 }}>
            <Typography component="h2" variant="h5" sx={{ mb: 1 }}>Store tools</Typography>
            <ToolRow title="Verify a receipt" description="Check a shopper's QR code at the exit" onClick={() => navigate("/staff/verify")} />
            <ToolRow title="All orders" description="Sales, payments and exits" onClick={() => navigate("/staff/orders")} />
            {isAdmin && (
              <>
                <ToolRow title="Manage products" description="Add, edit and import the catalog" onClick={() => navigate("/admin/products")} />
                <ToolRow title="Manage staff" description="Give people staff or admin access" onClick={() => navigate("/admin/users")} />
              </>
            )}
            <Box sx={{ borderTop: 1, borderColor: "divider" }} />
            {isAdmin && payments && (
              <Alert severity={payments.webhookConfigured ? "success" : "warning"} sx={{ mt: 2 }}>
                {!payments.webhookConfigured
                  ? "Payment webhook is off. A shopper who closes the browser right after paying stays Unpaid until staff use Check payment."
                  : payments.lastWebhookAt
                    ? `Payment webhook is on. Last call received ${new Date(payments.lastWebhookAt).toLocaleString()}.`
                    : "Payment webhook is on, but no call has arrived yet."}
              </Alert>
            )}
          </Box>
        )}
      </Box>

      {/* Basket bar: always in reach once something is scanned */}
      {totalItems > 0 && (
        <Box
          sx={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: tokens.forest,
            color: tokens.surface,
            zIndex: 20,
          }}
        >
          <Box sx={{ maxWidth: 640, mx: "auto", px: { xs: 2, sm: 3 }, py: 1.75, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}>
            <Box>
              <Typography sx={{ color: "rgba(255,255,255,0.8)", fontSize: "0.8125rem" }}>
                {totalItems} {totalItems === 1 ? "item" : "items"} in your basket
              </Typography>
              <Money value={basketTotal} sx={{ fontWeight: 700, fontSize: "1.25rem" }} />
              <Typography component="span" sx={{ color: "rgba(255,255,255,0.8)", fontSize: "0.8125rem", ml: 1 }}>
                total
              </Typography>
            </Box>
            <Button
              onClick={() => navigate("/cart")}
              sx={{ backgroundColor: tokens.paper, color: tokens.ink, "&:hover": { backgroundColor: tokens.surface }, px: 3 }}
            >
              Review and pay
            </Button>
          </Box>
        </Box>
      )}

      <Toast toast={toast} onClose={() => setToast(null)} offset={totalItems > 0 ? 72 : 0} />

      {scannerOpen && (
        <Suspense fallback={null}>
          <BarcodeScanner onScan={handleScan} closeScanner={closeScanner} />
        </Suspense>
      )}
    </Box>
  );
};

export default Dashboard;


