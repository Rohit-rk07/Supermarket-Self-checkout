import { 
    Container, 
    Typography, 
    List, 
    ListItem, 
    Divider, 
    Button, 
    Box, 
    Paper, 
    Grid,
    CircularProgress,
    Alert,
    ListItemText,
    ListItemSecondaryAction
} from "@mui/material";
import { 
    CheckCircle,
    AccountBalanceWallet
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";
import { useOrders } from "../context/OrderContext";
import { useAuth } from "../context/AuthContext";
import { useState, useEffect } from "react";
import { initializeRazorpayPayment } from "../services/RazorpayService";

// Every user, including the development demo user, authenticates with a JWT
const getAuthHeaders = () => ({
    'Authorization': `Bearer ${localStorage.getItem('token')}`
});

// Display only: the server calculates the real amount. Keep in sync with TAX_RATE in backend utils/pricing.js
const TAX_RATE = 0.18;

const paperSx = {
    p: 4,
    borderRadius: 2,
    backgroundColor: 'white',
    border: '1px solid #f1f5f9',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
};

const CheckoutPage = () => {
    const { cart, clearCart, cartReady } = useCart();
    const { createOrder, refreshOrders } = useOrders();
    const { user, loading: authLoading } = useAuth();
    const navigate = useNavigate();
    const [processing, setProcessing] = useState(false);
    const [success, setSuccess] = useState(false);
    const [paymentError, setPaymentError] = useState(null);
    const [pendingOrderId, setPendingOrderId] = useState(null);
    
    // Totals shown to the shopper (same formula as the server)
    const subtotal = cart.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);
    const tax = Math.round(subtotal * TAX_RATE * 100) / 100;
    const total = Math.round((subtotal + tax) * 100) / 100;

    // If cart is empty and not in success state, redirect to cart
    useEffect(() => {
        // Wait until the user and their saved cart have finished loading (matters after a page reload)
        if (cartReady && !authLoading && cart.length === 0 && !success) {
            navigate("/cart");
        }
    }, [cart, cartReady, authLoading, navigate, success]);

    // If user is not logged in, redirect to login
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

                        // 5. Refresh the order list so it shows as paid, then show success
                        await refreshOrders();
                        setProcessing(false);
                        setSuccess(true);

                        setTimeout(() => {
                            clearCart();
                            navigate("/account");
                        }, 1500);
                    } catch (error) {
                        setProcessing(false);
                        setPaymentError(`Payment verification failed: ${error.message}`);
                        console.error('Payment verification error:', error);
                    }
                },
                onFailure: function (error) {
                    setProcessing(false);
                    setPaymentError(`Payment failed: ${error.description || error.error?.description || 'Unknown error'}`);
                    console.error('Razorpay payment failed:', error);
                }
            });
        } catch (error) {
            setProcessing(false);
            setPaymentError(`Payment initialization failed: ${error.message}`);
            console.error('Razorpay payment error:', error);
        }
    };

    if (success) {
        return (
            <Box sx={{ 
                minHeight: '100vh', 
                backgroundColor: '#f8fafc',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                py: 4
            }}>
                <Container maxWidth="sm" sx={{ textAlign: "center" }}>
                    <Paper elevation={0} sx={{ ...paperSx, p: 6 }}>
                        <CheckCircle sx={{ fontSize: 80, mb: 3, color: '#10b981' }} />
                        <Typography variant="h3" fontWeight="700" gutterBottom sx={{ color: '#1e293b' }}>Purchase Successful!</Typography>
                        <Typography variant="h6" paragraph sx={{ color: '#64748b' }}>
                            Your payment was verified and your order is complete.
                        </Typography>
                        <CircularProgress size={32} sx={{ mt: 2, color: '#10b981' }} />
                        <Typography variant="body1" display="block" sx={{ mt: 2, fontWeight: 500, color: '#1e293b' }}>
                            Redirecting to your account...
                        </Typography>
                    </Paper>
                </Container>
            </Box>
        );
    }

    return (
    <Box sx={{ 
        minHeight: '100vh', 
        backgroundColor: '#f8fafc',
        py: 4
    }}>
        <Container maxWidth="lg">
            <Typography 
                variant="h3" 
                fontWeight="700" 
                gutterBottom 
                sx={{ textAlign: 'center', color: '#1e293b', mb: 4 }}
            >
                💳 Checkout
            </Typography>
            
            <Grid container spacing={4}>
                <Grid item xs={12} md={7}>
                    <Paper elevation={0} sx={paperSx}>
                    <Typography variant="h5" fontWeight="600" gutterBottom sx={{ color: '#1e293b' }}>
                        Review Your Items
                    </Typography>
                    <Divider sx={{ mb: 2, borderColor: '#f1f5f9' }} />
                    
                    {cart.length === 0 ? (
                        <Typography variant="body1" sx={{ py: 3, textAlign: "center", color: '#64748b' }}>
                            Your cart is empty. Please scan items before checkout.
                        </Typography>
                    ) : (
                        <List disablePadding>
                            {cart.map((item, idx) => (
                                <Box key={idx}>
                                    <ListItem sx={{ py: 1.5 }}>
                                        <ListItemText
                                            primary={<Typography variant="body1" fontWeight="500" sx={{ color: '#1e293b' }}>{item.name}</Typography>}
                                            secondary={item.category && <Typography variant="body2" sx={{ color: '#64748b' }}>{`Category: ${item.category}`}</Typography>}
                                        />
                                        <ListItemSecondaryAction>
                                            <Box sx={{ textAlign: "right" }}>
                                                <Typography variant="body2" sx={{ color: '#64748b' }}>
                                                    {item.quantity || 1} × ₹{item.price.toFixed(2)}
                                                </Typography>
                                                <Typography variant="body1" fontWeight="600" sx={{ color: '#10b981' }}>
                                                    ₹{((item.quantity || 1) * item.price).toFixed(2)}
                                                </Typography>
                                            </Box>
                                        </ListItemSecondaryAction>
                                    </ListItem>
                                    {idx < cart.length - 1 && <Divider sx={{ borderColor: '#f1f5f9' }} />}
                                </Box>
                            ))}
                        </List>
                    )}
                    
                    <Divider sx={{ mt: 2, mb: 2, borderColor: '#f1f5f9' }} />
                    
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 1 }}>
                        <Typography variant="body1" sx={{ color: '#64748b' }}>Subtotal</Typography>
                        <Typography variant="body1" sx={{ color: '#1e293b' }}>₹{subtotal.toFixed(2)}</Typography>
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 2 }}>
                        <Typography variant="body1" sx={{ color: '#64748b' }}>Tax (18%)</Typography>
                        <Typography variant="body1" sx={{ color: '#1e293b' }}>₹{tax.toFixed(2)}</Typography>
                    </Box>
                    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Typography variant="body1" sx={{ color: '#64748b' }}>Total</Typography>
                        <Typography variant="body1" fontWeight="700" sx={{ color: '#1e293b' }}>₹{total.toFixed(2)}</Typography>
                    </Box>
                    </Paper>
                </Grid>
                
                <Grid item xs={12} md={5}>
                    <Paper elevation={0} sx={paperSx}>
                        <Typography variant="h5" fontWeight="600" gutterBottom sx={{ color: '#1e293b' }}>
                            Payment
                        </Typography>
                        <Divider sx={{ mb: 3, borderColor: '#f1f5f9' }} />
                        
                        {paymentError && (
                            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
                                {paymentError}
                            </Alert>
                        )}
                        
                        {processing ? (
                            <Box sx={{ textAlign: "center", py: 4 }}>
                                <CircularProgress size={48} sx={{ mb: 2, color: '#10b981' }} />
                                <Typography variant="h6" gutterBottom sx={{ color: '#1e293b' }}>
                                    Processing Payment
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#64748b' }}>
                                    Please wait while we process your payment...
                                </Typography>
                            </Box>
                        ) : (
                            <Button
                                variant="outlined"
                                fullWidth
                                size="large"
                                sx={{ 
                                    py: 2, 
                                    justifyContent: "flex-start",
                                    borderRadius: 2,
                                    borderColor: '#e2e8f0',
                                    color: '#1e293b',
                                    "&:hover": { 
                                        borderColor: '#10b981',
                                        backgroundColor: '#f0fdf4'
                                    }
                                }}
                                onClick={handleRazorpayPayment}
                                disabled={cart.length === 0}
                            >
                                <AccountBalanceWallet sx={{ mr: 2, color: '#10b981' }} />
                                <Box sx={{ textAlign: "left" }}>
                                    <Typography variant="body1" fontWeight="600" sx={{ color: '#1e293b' }}>
                                        Pay with Razorpay
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: '#64748b' }}>
                                        UPI, Cards, Wallets & more
                                    </Typography>
                                </Box>
                            </Button>
                        )}
                    </Paper>
                </Grid>
            </Grid>
        </Container>
    </Box>
);
};

export default CheckoutPage;
