import { useState } from "react";
import {
    Container,
    Typography,
    Button,
    Box,
    Paper,
    Grid,
    Divider,
    Avatar,
    Chip,
    Tab,
    Tabs,
    Card,
    CardContent,
    List,
    ListItem,
    ListItemText,
    ListItemIcon,
    IconButton,
    useTheme,
    useMediaQuery,
    Fab,
    Stack,
    Badge,
    CircularProgress,
    Alert,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Collapse
} from "@mui/material";
import { 
    Person, 
    History, 
    Receipt, 
    ShoppingCart, 
    DateRange, 
    ArrowBack,
    Phone,
    Logout,
    Print,
    ExpandMore,
    ExpandLess,
    Store,
    QrCode
} from "@mui/icons-material";
import { useAuth } from "../context/AuthContext";
import { useOrders } from "../context/OrderContext";
import { useNavigate } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";

const AccountPage = () => {
    const { user, logout } = useAuth();
    const { orders, loading, error } = useOrders();
    const [activeTab, setActiveTab] = useState(0);
    const [selectedPurchase, setSelectedPurchase] = useState(null);
    const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
    const [expandedPurchase, setExpandedPurchase] = useState(null);
    const navigate = useNavigate();
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('md'));

    const handleTabChange = (event, newValue) => {
        setActiveTab(newValue);
    };

    const handleLogout = async () => {
        await logout();
        navigate("/login");
    };

    const handlePurchaseClick = (purchase) => {
        setExpandedPurchase(expandedPurchase === purchase._id ? null : purchase._id);
    };

    const handlePrintReceipt = (purchase) => {
        setSelectedPurchase(purchase);
        setReceiptDialogOpen(true);
    };

    const printReceipt = () => {
        const receiptContent = document.getElementById('receipt-content');
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
            <html>
                <head>
                    <title>Purchase Receipt</title>
                    <style>
                        body { font-family: monospace; margin: 20px; }
                        .receipt { max-width: 300px; margin: 0 auto; }
                        .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; }
                        .item { display: flex; justify-content: space-between; margin: 5px 0; }
                        .total { border-top: 2px solid #000; padding-top: 10px; font-weight: bold; }
                    </style>
                </head>
                <body>
                    ${receiptContent.innerHTML}
                </body>
            </html>
        `);
        printWindow.document.close();
        printWindow.print();
        setReceiptDialogOpen(false);
    };

    // Helpers to compute totals with GST (18%) and proper rounding
    const round2 = (n) => Math.round(n * 100) / 100;
    const getTotals = (order) => {
        const items = (order?.items || []);
        const subtotal = items.reduce((sum, it) => sum + ((it.price || 0) * (it.quantity || 1)), 0);
        const tax = (typeof order?.tax === 'number') ? round2(order.tax) : round2(subtotal * 0.18);
        // Always compute total as subtotal + tax to avoid using pre-tax backend "total"
        const total = round2(subtotal + tax);
        return { subtotal: round2(subtotal), tax, total };
    };

    // If user is not logged in, redirect to login
    if (!user) {
        navigate("/login");
        return null;
    }

    return (
        <Box sx={{ 
            minHeight: '100vh', 
            backgroundColor: '#f8fafc',
            py: 4
        }}>
            <Container maxWidth="lg">
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 4 }}>
                    <Avatar sx={{ bgcolor: '#1e293b', mr: 2, width: 56, height: 56 }}>
                        <Store sx={{ fontSize: 32, color: 'white' }} />
                    </Avatar>
                    <Typography 
                        variant="h3" 
                        fontWeight="700" 
                        sx={{ 
                            color: '#1e293b'
                        }}
                    >
                        My Account
                    </Typography>
                </Box>
                <Grid container spacing={3}>
                    {/* Sidebar */}
                    <Grid item xs={12} md={4} lg={3}>
                        <Card 
                            elevation={0}
                            sx={{ 
                                borderRadius: 2,
                                backgroundColor: 'white',
                                border: '1px solid #f1f5f9',
                                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                            }}
                        >
                            <CardContent sx={{ textAlign: 'center', p: 3 }}>
                                <Avatar 
                                    sx={{ 
                                        width: 80, 
                                        height: 80, 
                                        bgcolor: '#1e293b',
                                        fontSize: 32,
                                        mb: 2,
                                        mx: 'auto',
                                        color: 'white'
                                    }}
                                >
                                    {user.name ? user.name[0].toUpperCase() : "U"}
                                </Avatar>
                                <Typography variant="h6" fontWeight="600" sx={{ color: '#1e293b' }} gutterBottom>
                                    {user.name || "User"}
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#64748b', mb: 3 }}>
                                    {user.email || user.phoneNumber}
                                </Typography>
                                
                                <Divider sx={{ my: 2, borderColor: '#f1f5f9' }} />
                                
                                <Tabs
                                    orientation="vertical"
                                    value={activeTab}
                                    onChange={handleTabChange}
                                    sx={{ 
                                        '& .MuiTab-root': {
                                            alignItems: 'flex-start',
                                            textAlign: 'left',
                                            minHeight: 48,
                                            color: '#64748b',
                                            '&.Mui-selected': {
                                                color: '#1e293b'
                                            }
                                        },
                                        '& .MuiTabs-indicator': {
                                            backgroundColor: '#10b981'
                                        }
                                    }}
                                >
                                    <Tab 
                                        icon={<Person sx={{ mr: 1, color: 'inherit' }} />} 
                                        label="Profile" 
                                        iconPosition="start"
                                    />
                                    <Tab 
                                        icon={<Receipt sx={{ mr: 1, color: 'inherit' }} />} 
                                        label="Purchase History" 
                                        iconPosition="start"
                                    />
                                </Tabs>
                                
                                <Button
                                    variant="contained"
                                    fullWidth
                                    startIcon={<Logout />}
                                    onClick={handleLogout}
                                    sx={{ 
                                        mt: 3,
                                        borderRadius: 2,
                                        py: 1.2,
                                        backgroundColor: '#ef4444',
                                        '&:hover': {
                                            backgroundColor: '#dc2626'
                                        }
                                    }}
                                >
                                    Logout
                                </Button>
                            </CardContent>
                        </Card>
                    </Grid>
                    
                    {/* Main Content */}
                    <Grid item xs={12} md={8} lg={9}>
                        {/* Profile Tab */}
                        {activeTab === 0 && (
                            <Card 
                                elevation={0} 
                                sx={{ 
                                    borderRadius: 2,
                                    backgroundColor: 'white',
                                    border: '1px solid #f1f5f9',
                                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                                }}
                            >
                                <CardContent sx={{ p: 4 }}>
                                <Typography variant="h5" fontWeight="600" sx={{ mb: 3, color: '#1e293b' }}>
                                    <Person sx={{ mr: 1, verticalAlign: "middle", color: '#10b981' }} />
                                    My Profile
                                </Typography>
                                
                                <Grid container spacing={3}>
                                    <Grid item xs={12} sm={6}>
                                        <Typography variant="subtitle2" sx={{ color: '#64748b', mb: 1 }}>
                                            Full Name
                                        </Typography>
                                        <Typography variant="body1" fontWeight="500" sx={{ mb: 3, color: '#1e293b' }}>
                                            {user.name || "Not set"}
                                        </Typography>
                                        
                                        <Typography variant="subtitle2" sx={{ color: '#64748b', mb: 1 }}>
                                            Phone Number
                                        </Typography>
                                        <Typography variant="body1" fontWeight="500" sx={{ mb: 3, color: '#1e293b', display: 'flex', alignItems: 'center' }}>
                                            <Phone sx={{ mr: 1, fontSize: 16, color: '#10b981' }} />
                                            {user.phoneNumber}
                                        </Typography>
                                        
                                        {user.email && (
                                            <>
                                                <Typography variant="subtitle2" sx={{ color: '#64748b', mb: 1 }}>
                                                    Email Address
                                                </Typography>
                                                <Typography variant="body1" fontWeight="500" sx={{ mb: 3, color: '#1e293b' }}>
                                                    {user.email}
                                                </Typography>
                                            </>
                                        )}
                                    </Grid>
                                    
                                    <Grid item xs={12} sm={6}>
                                        <Typography variant="subtitle2" sx={{ color: '#64748b', mb: 1 }}>
                                            Account Type
                                        </Typography>
                                        <Typography variant="body1" fontWeight="500" sx={{ mb: 3, color: '#1e293b' }}>
                                            Phone Authentication
                                        </Typography>
                                        
                                        <Typography variant="subtitle2" sx={{ color: '#64748b', mb: 1 }}>
                                            Total Orders
                                        </Typography>
                                        <Typography variant="body1" fontWeight="500" sx={{ color: '#1e293b' }}>
                                            {loading ? <CircularProgress size={16} /> : orders.length}
                                        </Typography>
                                    </Grid>
                                </Grid>
                                </CardContent>
                            </Card>
                        )}
                        
                        {/* Purchase History Tab */}
                        {activeTab === 1 && (
                            <Card 
                                elevation={0} 
                                sx={{ 
                                    borderRadius: 2,
                                    backgroundColor: 'white',
                                    border: '1px solid #f1f5f9',
                                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
                                }}
                            >
                                <CardContent sx={{ p: 4 }}>
                                <Typography variant="h5" fontWeight="600" sx={{ mb: 3, color: '#1e293b' }}>
                                    <Receipt sx={{ mr: 1, verticalAlign: "middle", color: '#10b981' }} />
                                    Purchase History
                                </Typography>
                                
                                {error && (
                                    <Alert severity="error" sx={{ mb: 3, borderRadius: 2 }}>
                                        {error}
                                    </Alert>
                                )}
                                
                                {loading ? (
                                    <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
                                        <CircularProgress sx={{ color: '#10b981' }} />
                                    </Box>
                                ) : orders.length === 0 ? (
                                    <Box sx={{ p: 3, textAlign: "center" }}>
                                        <ShoppingCart sx={{ fontSize: 48, color: "#94a3b8", mb: 2 }} />
                                        <Typography variant="h6" gutterBottom sx={{ color: '#1e293b' }}>
                                            No Purchases Yet
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: '#64748b' }} paragraph>
                                            You haven't made any purchases yet.
                                        </Typography>
                                        <Button 
                                            variant="contained" 
                                            onClick={() => navigate("/")} 
                                            sx={{ 
                                                mt: 1,
                                                backgroundColor: '#10b981',
                                                '&:hover': {
                                                    backgroundColor: '#059669'
                                                }
                                            }}
                                        >
                                            Start Shopping
                                        </Button>
                                    </Box>
                                ) : (
                                    <List disablePadding>
                                        {orders.map((order, index) => (
                                            <Card key={order._id} sx={{ mb: 3, borderRadius: 2, border: '1px solid #f1f5f9' }}>
                                                <CardContent sx={{ p: 3 }}>
                                                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 2 }}>
                                                        <Typography variant="h6" fontWeight="600" sx={{ color: '#1e293b' }}>
                                                            Purchase #{order._id.slice(-6).toUpperCase()}
                                                        </Typography>
                                                        <Chip 
                                                            label={order.status} 
                                                            sx={{
                                                                backgroundColor: order.status === "completed" ? '#dcfce7' : '#dbeafe',
                                                                color: order.status === "completed" ? '#166534' : '#1e40af',
                                                                fontWeight: 500
                                                            }}
                                                            size="small"
                                                        />
                                                    </Box>
                                                    
                                                    <Box sx={{ display: "flex", gap: 2, mb: 2, flexWrap: "wrap" }}>
                                                        <Box sx={{ display: "flex", alignItems: "center" }}>
                                                            <DateRange fontSize="small" sx={{ mr: 0.5, color: "#64748b" }} />
                                                            <Typography variant="body2" sx={{ color: '#64748b' }}>
                                                                {order.createdAt ? new Date(order.createdAt).toLocaleDateString() : 'N/A'}
                                                            </Typography>
                                                        </Box>
                                                        <Box sx={{ display: "flex", alignItems: "center" }}>
                                                            <ShoppingCart fontSize="small" sx={{ mr: 0.5, color: "#64748b" }} />
                                                            <Typography variant="body2" sx={{ color: '#64748b' }}>
                                                                {order.items ? order.items.length : 0} {(order.items && order.items.length === 1) ? "item" : "items"}
                                                            </Typography>
                                                        </Box>
                                                    </Box>
                                                    
                                                    <Divider sx={{ mb: 2, borderColor: '#f1f5f9' }} />
                                                    
                                                    {/* Always show the items table at the top */}
                                                    <CardContent sx={{ p: 2, pt: 0 }}>
                                                        <Typography variant="h6" fontWeight="600" sx={{ mb: 2, color: '#1e293b' }}>
                                                            Items
                                                        </Typography>
                                                        <TableContainer>
                                                            <Table size="small">
                                                                <TableHead>
                                                                    <TableRow>
                                                                        <TableCell sx={{ fontWeight: 600, color: '#64748b' }}>Item</TableCell>
                                                                        <TableCell align="right" sx={{ fontWeight: 600, color: '#64748b' }}>Quantity</TableCell>
                                                                        <TableCell align="right" sx={{ fontWeight: 600, color: '#64748b' }}>Price</TableCell>
                                                                        <TableCell align="right" sx={{ fontWeight: 600, color: '#64748b' }}>Total</TableCell>
                                                                    </TableRow>
                                                                </TableHead>
                                                                <TableBody>
                                                                    {order.items.map((item, index) => (
                                                                        <TableRow key={index}>
                                                                            <TableCell sx={{ color: '#1e293b' }}>{item.name}</TableCell>
                                                                            <TableCell align="right" sx={{ color: '#1e293b' }}>{item.quantity}</TableCell>
                                                                            <TableCell align="right" sx={{ color: '#1e293b' }}>₹{item.price ? item.price.toFixed(2) : '0.00'}</TableCell>
                                                                            <TableCell align="right" sx={{ color: '#10b981', fontWeight: 600 }}>₹{((item.quantity || 1) * (item.price || 0)).toFixed(2)}</TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </TableContainer>
                                                    </CardContent>
                                                    
                                                    <Box sx={{ display: "flex", gap: 2, mt: 3 }}>
                                                        <Button 
                                                            variant="outlined" 
                                                            onClick={() => handlePurchaseClick(order)} 
                                                            startIcon={expandedPurchase === order._id ? <ExpandLess /> : <ExpandMore />}
                                                            sx={{
                                                                borderColor: '#e2e8f0',
                                                                color: '#64748b',
                                                                '&:hover': {
                                                                    borderColor: '#1e293b',
                                                                    backgroundColor: '#f8fafc'
                                                                }
                                                            }}
                                                        >
                                                            {expandedPurchase === order._id ? 'Hide Details' : 'View Details'}
                                                        </Button>
                                                        <Button 
                                                            variant="contained" 
                                                            onClick={() => handlePrintReceipt(order)} 
                                                            startIcon={<Print />}
                                                            sx={{
                                                                backgroundColor: '#10b981',
                                                                '&:hover': {
                                                                    backgroundColor: '#059669'
                                                                }
                                                            }}
                                                        >
                                                            Print Receipt
                                                        </Button>
                                                    </Box>
                                                    
                                                    {/* Show summary with taxes under the buttons */}
                                                    <Collapse in={expandedPurchase === order._id} timeout="auto" unmountOnExit>
                                                        <>
                                                            <List dense>
                                                                {(order.items || []).slice(0, 3).map((item, idx) => (
                                                                    <ListItem key={idx} disableGutters>
                                                                        <ListItemText
                                                                            primary={<Typography variant="body2" sx={{ color: '#1e293b', fontWeight: 500 }}>{item.name}</Typography>}
                                                                            secondary={<Typography variant="caption" sx={{ color: '#64748b' }}>{`${item.quantity || 1} × ₹${item.price ? item.price.toFixed(2) : '0.00'}`}</Typography>}
                                                                        />
                                                                        <Typography variant="body2" fontWeight="600" sx={{ color: '#10b981' }}>
                                                                            ₹{((item.quantity || 1) * (item.price || 0)).toFixed(2)}
                                                                        </Typography>
                                                                    </ListItem>
                                                                ))}
                                                                {(order.items && order.items.length > 3) && (
                                                                    <Typography variant="body2" sx={{ color: '#64748b', mt: 1 }}>
                                                                        +{order.items.length - 3} more items
                                                                    </Typography>
                                                                )}
                                                            </List>
                                                            
                                                            <Divider sx={{ my: 2, borderColor: '#f1f5f9' }} />
                                                            
                                                            {(() => { const t = getTotals(order); return (
                                                                <>
                                                                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                                                                        <Typography variant="subtitle2" sx={{ color: '#64748b' }}>Subtotal</Typography>
                                                                        <Typography variant="subtitle2" sx={{ color: '#1e293b' }}>₹{t.subtotal.toFixed(2)}</Typography>
                                                                    </Box>
                                                                    <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                                                                        <Typography variant="subtitle2" sx={{ color: '#64748b' }}>GST (18%)</Typography>
                                                                        <Typography variant="subtitle2" sx={{ color: '#1e293b' }}>₹{t.tax.toFixed(2)}</Typography>
                                                                    </Box>
                                                                    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                                                                        <Typography variant="subtitle2" sx={{ color: '#64748b' }}>Total</Typography>
                                                                        <Typography variant="subtitle1" fontWeight="700" sx={{ color: '#1e293b' }}>₹{t.total.toFixed(2)}</Typography>
                                                                    </Box>
                                                                </>
                                                            ); })()}
                                                        </>
                                                    </Collapse>
                                                </CardContent>
                                            </Card>
                                        ))}
                                    </List>
                                )}
                                </CardContent>
                            </Card>
                        )}
                    </Grid>
                </Grid>
                
                {/* Floating Back Button */}
                <Fab
                    sx={{
                        position: 'fixed',
                        bottom: 24,
                        left: 24,
                        backgroundColor: '#1e293b',
                        color: 'white',
                        '&:hover': {
                            backgroundColor: '#334155',
                            transform: 'scale(1.1)'
                        },
                        transition: 'all 0.2s ease-in-out'
                    }}
                    onClick={() => navigate('/dashboard')}
                >
                    <ArrowBack />
                </Fab>
                
                {/* Receipt Dialog */}
                <Dialog
                    open={receiptDialogOpen}
                    onClose={() => setReceiptDialogOpen(false)}
                    maxWidth="sm"
                    fullWidth
                    PaperProps={{
                        sx: {
                            borderRadius: 2,
                            border: '1px solid #f1f5f9'
                        }
                    }}
                >
                    <DialogTitle sx={{ color: '#1e293b', fontWeight: 600 }}>Print Receipt</DialogTitle>
                    <DialogContent dividers sx={{ borderColor: '#f1f5f9' }}>
                        {selectedPurchase && (
                            <div id="receipt-content" style={{ width: '300px', margin: '0 auto' }}>
                                <div className="header">
                                    <Typography variant="h6" fontWeight="600" sx={{ mb: 1, color: '#1e293b' }}>
                                        Purchase Receipt
                                    </Typography>
                                    <Typography variant="body2" sx={{ color: '#64748b' }}>
                                        {selectedPurchase.orderNumber || selectedPurchase._id.slice(-6).toUpperCase()}
                                    </Typography>
                                </div>
                                
                                {/* Exit pass: only paid orders get a QR code that staff can scan */}
                                <div style={{ textAlign: 'center', margin: '12px 0' }}>
                                    {selectedPurchase.paymentStatus === 'paid' ? (
                                        <>
                                            <QRCodeSVG value={selectedPurchase.orderNumber || ''} size={140} />
                                            <div style={{ fontWeight: 700, fontSize: 12, marginTop: 6, color: '#166534' }}>
                                                PAID - show this code at the exit
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ fontWeight: 700, fontSize: 12, color: '#b91c1c' }}>
                                            UNPAID - no exit pass
                                        </div>
                                    )}
                                </div>

                                <div className="items">
                                    {selectedPurchase.items && selectedPurchase.items.map((item, index) => (
                                        <div key={index} className="item">
                                            <Typography variant="body2" sx={{ color: '#1e293b' }}>
                                                {item.name}
                                            </Typography>
                                            <Typography variant="body2" fontWeight="600" sx={{ color: '#10b981' }}>
                                                ₹{((item.quantity || 1) * (item.price || 0)).toFixed(2)}
                                            </Typography>
                                        </div>
                                    ))}
                                </div>
                                
                                {(() => { const t = getTotals(selectedPurchase || {}); return (
                                    <div className="total">
                                        <Typography variant="body2" sx={{ color: '#1e293b' }}>
                                            Subtotal: ₹{t.subtotal.toFixed(2)}
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: '#1e293b' }}>
                                            GST (18%): ₹{t.tax.toFixed(2)}
                                        </Typography>
                                        <Typography variant="h6" fontWeight="700" sx={{ color: '#1e293b' }}>
                                            Total: ₹{t.total.toFixed(2)}
                                        </Typography>
                                    </div>
                                ); })()}
                            </div>
                        )}
                    </DialogContent>
                    <DialogActions>
                        <Button 
                            onClick={() => setReceiptDialogOpen(false)}
                            sx={{ color: '#64748b' }}
                        >
                            Cancel
                        </Button>
                        <Button 
                            onClick={printReceipt} 
                            disabled={!selectedPurchase}
                            sx={{
                                backgroundColor: '#10b981',
                                color: 'white',
                                '&:hover': {
                                    backgroundColor: '#059669'
                                }
                            }}
                        >
                            Print
                        </Button>
                    </DialogActions>
                </Dialog>
            </Container>
        </Box>
    );
};

export default AccountPage;