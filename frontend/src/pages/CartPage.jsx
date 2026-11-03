import { Box, Typography, Button, IconButton } from "@mui/material";
import { Add, Remove, QrCodeScanner } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import TopBar from "../components/ui/TopBar";
import Money from "../components/ui/Money";
import { getBasketTotals } from "../utils/money";
import { fonts } from "../theme/theme";

const Stepper = ({ item, onChange }) => {
    const quantity = item.quantity || 1;
    return (
        <Box sx={{ display: "inline-flex", alignItems: "center", border: 1, borderColor: "divider", borderRadius: "6px", backgroundColor: "background.paper" }}>
            <IconButton size="small" aria-label={`Decrease quantity of ${item.name}`} onClick={() => onChange(quantity - 1)}>
                <Remove fontSize="small" />
            </IconButton>
            <Typography className="num" sx={{ minWidth: 28, textAlign: "center", fontWeight: 600 }} aria-live="polite">
                {quantity}
            </Typography>
            <IconButton size="small" aria-label={`Increase quantity of ${item.name}`} onClick={() => onChange(quantity + 1)}>
                <Add fontSize="small" />
            </IconButton>
        </Box>
    );
};

const CartPage = () => {
    const { cart, cartReady, removeFromCart, updateQuantity, clearCart } = useCart();
    const navigate = useNavigate();

    const itemCount = cart.reduce((count, item) => count + (item.quantity || 1), 0);
    const { subtotal, tax, taxIncluded, total } = getBasketTotals(cart);

    // After a reload the saved basket loads a moment later; show nothing rather than "empty" until it has
    if (!cartReady) {
        return (
            <Box sx={{ minHeight: "100vh" }}>
                <TopBar title="Your basket" backTo="/dashboard" />
            </Box>
        );
    }

    if (cart.length === 0) {
        return (
            <Box sx={{ minHeight: "100vh" }}>
                <TopBar title="Your basket" backTo="/dashboard" />
                <Box sx={{ maxWidth: 480, mx: "auto", px: 3, pt: 10, textAlign: "center" }}>
                    <Typography component="h2" variant="h3" sx={{ mb: 1.5 }}>
                        Your basket is empty
                    </Typography>
                    <Typography color="text.secondary" sx={{ mb: 4 }}>
                        Scan an item, or type its barcode, and it will appear here.
                    </Typography>
                    <Button variant="contained" size="large" startIcon={<QrCodeScanner />} onClick={() => navigate("/dashboard")}>
                        Scan an item
                    </Button>
                </Box>
            </Box>
        );
    }

    return (
        <Box sx={{ minHeight: "100vh" }}>
            <TopBar title="Your basket" backTo="/dashboard" />

            <Box
                sx={{
                    maxWidth: 960,
                    mx: "auto",
                    px: { xs: 2, sm: 3 },
                    pt: 3,
                    pb: 3,
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "1fr 340px" },
                    gap: { xs: 3, md: 6 },
                    alignItems: "start",
                }}
            >
                {/* Items */}
                <Box component="section" aria-label="Items in your basket">
                    <Typography component="h2" variant="h5" sx={{ mb: 1 }}>
                        {itemCount} {itemCount === 1 ? "item" : "items"}
                    </Typography>

                    {cart.map((item) => (
                        <Box
                            key={item.barcode}
                            sx={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 2, py: 2, borderTop: 1, borderColor: "divider" }}
                        >
                            <Box sx={{ minWidth: 0 }}>
                                <Typography fontWeight={600}>{item.name}</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.25 }}>
                                    {item.category ? `${item.category} · ` : ""}
                                    <Money value={item.price} /> each
                                </Typography>
                                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                    <Stepper item={item} onChange={(quantity) => updateQuantity(item.barcode, quantity)} />
                                    <Button variant="text" size="small" color="error" onClick={() => removeFromCart(item.barcode)}>
                                        Remove
                                    </Button>
                                </Box>
                            </Box>
                            <Money value={item.price * (item.quantity || 1)} sx={{ fontWeight: 600, fontSize: "1.0625rem" }} />
                        </Box>
                    ))}
                    <Box sx={{ borderTop: 1, borderColor: "divider" }} />

                    <Box sx={{ display: "flex", gap: 1.5, mt: 2.5 }}>
                        <Button variant="outlined" startIcon={<QrCodeScanner />} onClick={() => navigate("/dashboard")}>
                            Scan more
                        </Button>
                        <Button variant="text" color="error" onClick={clearCart}>
                            Clear basket
                        </Button>
                    </Box>
                </Box>

                {/* Summary: pinned to the bottom of the screen on a phone */}
                <Box
                    component="section"
                    aria-label="Order summary"
                    sx={{
                        position: "sticky",
                        bottom: { xs: 0, md: "auto" },
                        top: { xs: "auto", md: 84 },
                        backgroundColor: "background.paper",
                        border: 1,
                        borderColor: "divider",
                        borderRadius: "10px",
                        p: 3,
                    }}
                >
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                        <Typography color="text.secondary">Subtotal</Typography>
                        <Money value={subtotal} />
                    </Box>
                    {tax > 0 && (
                        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                            <Typography color="text.secondary">GST added</Typography>
                            <Money value={tax} />
                        </Box>
                    )}
                    {taxIncluded > 0 && (
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            Prices include GST of <Money value={taxIncluded} />
                        </Typography>
                    )}
                    <Box sx={{ mb: 1 }} />
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", pt: 2, borderTop: 1, borderColor: "divider" }}>
                        <Typography fontWeight={600}>Total</Typography>
                        <Money value={total} sx={{ fontFamily: fonts.serif, fontWeight: 700, fontSize: "1.75rem" }} />
                    </Box>

                    <Button variant="contained" size="large" fullWidth sx={{ mt: 2.5 }} onClick={() => navigate("/checkout")}>
                        Pay <Money value={total} sx={{ ml: 0.75 }} />
                    </Button>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, textAlign: "center" }}>
                        Check that everything in your bag is on this list before you pay.
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
};

export default CartPage;

