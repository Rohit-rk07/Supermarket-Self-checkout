import { lazy, Suspense, useState, useCallback, useRef } from "react";
import { Box, Typography, Button, TextField, ButtonBase } from "@mui/material";
import { QrCodeScanner as ScanIcon, ChevronRight } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCart } from "../../context/CartContext";
import { useOrders } from "../../context/OrderContext";
import TopBar from "../../components/ui/TopBar";
import Toast from "../../components/ui/Toast";
import Money from "../../components/ui/Money";
import { getBasketTotals, getTotals, formatDateTime } from "../../utils/money";
import { tokens } from "../../theme/theme";

const BarcodeScanner = lazy(() => import("../../components/BarcodeScanner"));

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

// The shopper's first page: scan, see the basket, pay. Staff and admins can also land here in "shop mode".
const ShopperHome = ({ onBackToDesk }) => {
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manual, setManual] = useState("");
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState(null);
  const { cart, addToCart, totalItems } = useCart();
  const { orders } = useOrders();
  const basketTotal = getBasketTotals(cart).total;
  const { user } = useAuth();
  const navigate = useNavigate();
  const firstName = (user?.name || "").trim().split(" ")[0];

  // Paid and refunded orders are receipts (a refunded one is marked so)
  const receipts = (orders || []).filter((order) => order.paymentStatus === "paid" || order.paymentStatus === "refunded").slice(0, 2);

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
        {onBackToDesk && (
          <Button size="small" onClick={onBackToDesk} sx={{ mb: 2 }}>
            {"←"} Back to the store desk
          </Button>
        )}

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

        {receipts.length > 0 && (
          <Box sx={{ mt: 6 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", mb: 1 }}>
              <Typography component="h2" variant="h5">Recent receipts</Typography>
              <Button variant="text" size="small" onClick={() => navigate("/account")}>All receipts</Button>
            </Box>
            {receipts.map((order) => (
              <ButtonBase
                key={order._id}
                onClick={() => navigate("/account")}
                sx={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", textAlign: "left", py: 1.5, borderTop: 1, borderColor: "divider" }}
              >
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={600} sx={{ fontFamily: "monospace" }} noWrap>{order.orderNumber}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {formatDateTime(order.paidAt || order.createdAt)}{order.paymentStatus === "refunded" ? " · Refunded" : ""}
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Money value={getTotals(order).total} sx={{ fontWeight: 600 }} />
                  <ChevronRight sx={{ color: "text.secondary" }} />
                </Box>
              </ButtonBase>
            ))}
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

export default ShopperHome;
