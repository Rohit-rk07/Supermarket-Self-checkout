import { Box, Typography, Button, Alert, CircularProgress } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useOrders } from "../context/OrderContext";
import { useAuth } from "../context/AuthContext";
import { useState, useEffect } from "react";
import { initializeRazorpayPayment } from "../services/RazorpayService";
import TopBar from "./ui/TopBar";
import Money from "./ui/Money";
import Receipt from "./ui/Receipt";
import { getBasketTotals, formatMoney } from "../utils/money";
import { fonts } from "../theme/theme";

// Every user, including the development demo user, authenticates with a JWT
const getAuthHeaders = () => ({
    'Authorization': `Bearer ${localStorage.getItem('token')}`
});

const CheckoutPage = () => {
    const { cart, clearCart, cartReady } = useCart();
    const { createOrder, refreshOrders } = useOrders();
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const [processing, setProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [paidOrder, setPaidOrder] = useState(null);
    const [paymentError, setPaymentError] = useState(null);
    const [pendingOrderId, setPendingOrderId] = useState(null);
    const [serverTotal, setServerTotal] = useState(null);

    // Shown to the shopper; the server calculates the real amount
    const { subtotal, tax, taxIncluded, total: basketTotal } = getBasketTotals(cart);
    // If the server prices the order differently (for example a price changed), it wins

    const total = serverTotal ?? basketTotal;

    // If the cart is empty and we are not in the success state, go back to the basket
    useEffect(() => {
        // Wait until the user and their saved cart have finished loading (matters after a page reload)
        if (cartReady && !authLoading && cart.length === 0 && !success) {
            navigate("/cart");
        }
    }, [cart, cartReady, authLoading, navigate, success]);

    // If the user is not logged in, go to the login page
    useEffect(() => {
        if (!authLoading && !user) {
            navigate("/login");
        }
    }, [user, authLoading, navigate]);

    const handleRazorpayPayment = async () => {
        try {
            setProcessing(true);
            setPaymentError(null);

            const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';

            // 1. Save the order as pending (the server prices it from the database).
            //    If the shopper retries after cancelling, reuse the same pending order.
            let orderId = pendingOrderId;
            if (!orderId) {
                orderId = await createOrder({ items: cart });
                if (!orderId) {
                    throw new Error('Could not save your order');
                }
                setPendingOrderId(orderId);
            }

            // 2. Create the Razorpay order for that saved order
            const response = await fetch(`${serverUrl}/api/v1/payments/create-order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...getAuthHeaders(),
                },
                body: JSON.stringify({ orderId }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || errorData.error || 'Failed to create payment');
            }

            const orderData = await response.json();

            // If prices changed since the items were scanned, show the new total and ask before charging
            if (serverTotal === null && Math.abs(orderData.amount - basketTotal) > 0.009) {
                setServerTotal(orderData.amount);
                setPaymentError(`Prices have changed since you scanned. Your total is now ${formatMoney(orderData.amount)}. Check it and press Pay again.`);
                setProcessing(false);
                return;
            }

            // 3. Open Razorpay Checkout
            await initializeRazorpayPayment({
                amount: Math.round(orderData.amount * 100), // Razorpay expects paise
                currency: orderData.currency,
                orderId: orderData.orderId,
                key: orderData.key,
                customerName: user?.name,
                customerEmail: user?.email,
                customerPhone: user?.phoneNumber,
                handler: async function (paymentResponse) {
                    try {
                        // 4. The server verifies the signature and marks the order paid
                        const verifyResponse = await fetch(`${serverUrl}/api/v1/payments/verify-payment`, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                ...getAuthHeaders(),
                            },
                            body: JSON.stringify({
                                razorpay_payment_id: paymentResponse.razorpay_payment_id,
                                razorpay_order_id: paymentResponse.razorpay_order_id,
                                razorpay_signature: paymentResponse.razorpay_signature
                            }),
                        });

                        if (!verifyResponse.ok) {
                            const errorData = await verifyResponse.json();
                            throw new Error(errorData.details || errorData.message || 'Payment verification failed');
                        }

                        const verified = await verifyResponse.json();

                        // 5. Show the paid receipt, then refresh the order list and empty the basket
                        setPaidOrder(verified.data);
                        setSuccess(true);
                        setProcessing(false);
                        clearCart();
                        await refreshOrders();
                    } catch (error) {
                        setProcessing(false);
                        setPaymentError(`Payment verification failed: ${error.message}`);
                        console.error('Payment verification error:', error);
                    }
                },
                onFailure: function (error) {
                    setProcessing(false);
                    setPaymentError(`Payment did not go through: ${error.description || error.error?.description || 'unknown reason'}`);
                    console.error('Razorpay payment failed:', error);
                }
            });
        } catch (error) {
            setProcessing(false);
            // An expired order cannot be paid; forget it so the next try saves a fresh one
            if (/expired/i.test(error.message)) setPendingOrderId(null);
            setPaymentError(`We could not start the payment: ${error.message}`);
            console.error('Razorpay payment error:', error);
        }
    };

    if (success) {
        return (
            <Box sx={{ minHeight: "100vh", pb: 8 }}>
                <TopBar hideAccount />
                <Box sx={{ maxWidth: 440, mx: "auto", px: 3, pt: { xs: 4, sm: 6 }, textAlign: "center" }}>
                    <Typography component="h1" variant="h3" sx={{ mb: 1 }}>
                        Purchase Successful!
                    </Typography>
                    <Typography color="text.secondary" sx={{ mb: 4 }}>
                        Your payment is confirmed. Show this receipt at the exit.
                    </Typography>

                    <Receipt order={paidOrder} animate />

                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mt: 5 }}>
                        <Button variant="contained" size="large" onClick={() => navigate("/dashboard")}>
                            Keep shopping
                        </Button>
                        <Box sx={{ display: "flex", gap: 1.5 }}>
                            <Button variant="outlined" fullWidth onClick={() => navigate("/account")}>
                                All receipts
                            </Button>
                            <Button variant="outlined" fullWidth onClick={() => window.print()}>
                                Print
                            </Button>
                        </Box>
                    </Box>
                </Box>
            </Box>
        );
    }

    return (
        <Box sx={{ minHeight: "100vh" }}>
            <TopBar title="Checkout" backTo="/cart" />

            <Box
                sx={{
                    maxWidth: 960,
                    mx: "auto",
                    px: { xs: 2, sm: 3 },
                    pt: 3,
                    pb: 6,
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "1fr 360px" },
                    gap: { xs: 4, md: 6 },
                    alignItems: "start",
                }}
            >
                {/* What you are paying for */}
                <Box component="section" aria-label="Items you are paying for">
                    <Typography component="h2" variant="h5" sx={{ mb: 1 }}>
                        Your items
                    </Typography>

                    {cart.length === 0 ? (
                        <Typography color="text.secondary" sx={{ py: 3, borderTop: 1, borderColor: "divider" }}>
                            Loading your basket...
                        </Typography>
                    ) : (
                        cart.map((item) => (
                            <Box
                                key={item.barcode}
                                sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 1.5, borderTop: 1, borderColor: "divider" }}
                            >
                                <Box sx={{ minWidth: 0 }}>
                                    <Typography fontWeight={600}>{item.name}</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {item.quantity || 1} × <Money value={item.price} />
                                    </Typography>
                                </Box>
                                <Money value={item.price * (item.quantity || 1)} sx={{ fontWeight: 600 }} />
                            </Box>
                        ))
                    )}

                    <Box sx={{ borderTop: 1, borderColor: "divider", pt: 2 }}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.75 }}>
                            <Typography color="text.secondary">Subtotal</Typography>
                            <Money value={subtotal} />
                        </Box>
                        {tax > 0 && (
                            <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                                <Typography color="text.secondary">GST added</Typography>
                                <Money value={tax} />
                            </Box>
                        )}
                        {taxIncluded > 0 && (
                            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                                Prices include GST of <Money value={taxIncluded} />
                            </Typography>
                        )}
                    </Box>
                </Box>

                {/* Pay */}
                <Box
                    component="section"
                    aria-label="Payment"
                    sx={{
                        position: { md: "sticky" },
                        top: { md: 84 },
                        backgroundColor: "background.paper",
                        border: 1,
                        borderColor: "divider",
                        borderRadius: "10px",
                        p: 3,
                    }}
                >
                    <Typography color="text.secondary">Amount to pay</Typography>
                    <Money value={total} sx={{ display: "block", fontFamily: fonts.serif, fontWeight: 700, fontSize: "2.5rem", lineHeight: 1.2, mb: 2.5 }} />

                    {paymentError && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {paymentError}
                        </Alert>
                    )}

                    <Button
                        variant="contained"
                        size="large"
                        fullWidth
                        onClick={handleRazorpayPayment}
                        disabled={cart.length === 0 || processing}
                    >
                        {processing ? (
                            <>
                                <CircularProgress size={20} color="inherit" sx={{ mr: 1.5 }} />
                                Waiting for payment
                            </>
                        ) : (
                            "Pay with Razorpay"
                        )}
                    </Button>

                    <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
                        Cards, netbanking and wallets. Razorpay processes the payment, so your card details never reach this store.
                    </Typography>
                </Box>
            </Box>
        </Box>
    );
};

export default CheckoutPage;

