import { lazy, Suspense, useState } from "react";
import { 
  Container, 
  Box, 
  Typography, 
  Card, 
  CardContent, 
  Grid, 
  Fab, 
  Badge,
  Paper,
  Avatar,
  IconButton
} from "@mui/material";
import { 
  QrCodeScanner as ScanIcon,
  ShoppingCart as CartIcon,
  Payment as CheckoutIcon,
  Person as PersonIcon,
  Inventory as InventoryIcon,
  TrendingUp as TrendingIcon,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCart } from "../context/CartContext";

const BarcodeScanner = lazy(() => import("../components/BarcodeScanner"));

const Dashboard = () => {
  const [scannerOpen, setScannerOpen] = useState(false);
  const { cart, addToCart, totalItems, subtotal } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();

  const fetchProduct = async (barcode) => {
    try {
      const SERVER_URL = import.meta.env.VITE_SERVER_URL;
      const response = await fetch(`${SERVER_URL}/api/v1/scan/${barcode}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Product not found");
      }

      const result = await response.json();
      
      // Handle new API response format
      const product = result.success ? result.data : result;
      addToCart(product);
    } catch (error) {
      console.error('Product fetch error:', error);
      alert(error.message || "Product not found");
    }
  };

  const quickActions = [
    {
      title: "Scan Product",
      icon: <ScanIcon sx={{ fontSize: 32 }} />,
      color: "#10b981",
      action: () => setScannerOpen(true),
      description: "Scan barcode to add items"
    },
    {
      title: "View Cart",
      icon: <CartIcon sx={{ fontSize: 32 }} />,
      color: "#3b82f6",
      action: () => navigate("/cart"),
      description: `${totalItems} items in cart`,
      badge: totalItems
    },
    {
      title: "Checkout",
      icon: <CheckoutIcon sx={{ fontSize: 32 }} />,
      color: "#f59e0b",
      action: () => navigate("/checkout"),
      description: `₹${subtotal.toFixed(2)} total`,
      disabled: cart.length === 0
    }
  ];

  const stats = [
    { label: "Items in Cart", value: totalItems, icon: <InventoryIcon />, color: "#10b981" },
    { label: "Cart Total", value: `₹${subtotal.toFixed(2)}`, icon: <TrendingIcon />, color: "#3b82f6" }
  ];

  return (
    <Box
      sx={{
        minHeight: '100vh',
        backgroundColor: '#f8fafc',
        pb: 4
      }}
    >
      {/* Header */}
      <Paper
        elevation={0}
        sx={{
          backgroundColor: 'white',
          borderBottom: '1px solid #f1f5f9',
          p: { xs: 2, sm: 3 },
          borderRadius: 0,
          mb: 3,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)'
        }}
      >
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box>
            <Typography variant="h4" fontWeight="700" sx={{ color: '#1e293b' }} gutterBottom>
              Smart Checkout
            </Typography>
            <Typography variant="body1" sx={{ color: '#64748b' }}>
              Welcome back, {user?.name || 'User'}!
            </Typography>
          </Box>
          <IconButton 
            onClick={() => navigate('/account')}
            sx={{ 
              bgcolor: '#f1f5f9', 
              '&:hover': { 
                bgcolor: '#e2e8f0',
                transform: 'scale(1.05)'
              },
              transition: 'all 0.2s ease-in-out'
            }}
          >
            <Avatar sx={{ bgcolor: '#1e293b', width: 40, height: 40 }}>
              <PersonIcon sx={{ color: 'white' }} />
            </Avatar>
          </IconButton>
        </Box>
      </Paper>

      <Container maxWidth="lg">
        {/* Stats Cards */}
        <Grid container spacing={3} sx={{ mb: 4 }}>
          {stats.map((stat, index) => (
            <Grid item xs={12} sm={6} key={index}>
              <Card
                elevation={0}
                sx={{
                  backgroundColor: 'white',
                  border: '1px solid #f1f5f9',
                  borderRadius: 2,
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': { 
                    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
                    transform: 'translateY(-2px)'
                  }
                }}
              >
                <CardContent sx={{ p: 3 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="h3" fontWeight="700" sx={{ color: '#1e293b', mb: 1 }}>
                        {stat.value}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#64748b', fontWeight: 500 }}>
                        {stat.label}
                      </Typography>
                    </Box>
                    <Box
                      sx={{
                        width: 48,
                        height: 48,
                        borderRadius: 2,
                        backgroundColor: `${stat.color}15`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: stat.color
                      }}
                    >
                      {stat.icon}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Quick Actions */}
        <Typography variant="h5" fontWeight="600" sx={{ color: '#1e293b', mb: 3 }}>
          Quick Actions
        </Typography>
        
        <Grid container spacing={3}>
          {quickActions.map((action, index) => (
            <Grid item xs={12} sm={6} md={4} key={index}>
              <Card
                elevation={0}
                sx={{
                  backgroundColor: 'white',
                  border: '1px solid #f1f5f9',
                  borderRadius: 2,
                  cursor: action.disabled ? 'not-allowed' : 'pointer',
                  opacity: action.disabled ? 0.6 : 1,
                  transition: 'all 0.2s ease-in-out',
                  '&:hover': action.disabled ? {} : { 
                    transform: 'translateY(-4px)',
                    boxShadow: '0 8px 25px rgba(0, 0, 0, 0.15)',
                    borderColor: '#e2e8f0'
                  }
                }}
                onClick={action.disabled ? undefined : action.action}
              >
                <CardContent sx={{ textAlign: 'center', p: 4 }}>
                  <Box sx={{ position: 'relative', display: 'inline-block', mb: 3 }}>
                    <Box
                      sx={{
                        width: 64,
                        height: 64,
                        borderRadius: 2,
                        backgroundColor: `${action.color}15`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: action.color,
                        mx: 'auto'
                      }}
                    >
                      {action.badge ? (
                        <Badge 
                          badgeContent={action.badge} 
                          sx={{
                            '& .MuiBadge-badge': {
                              backgroundColor: '#ef4444',
                              color: 'white'
                            }
                          }}
                        >
                          {action.icon}
                        </Badge>
                      ) : (
                        action.icon
                      )}
                    </Box>
                  </Box>
                  <Typography variant="h6" fontWeight="600" sx={{ color: '#1e293b', mb: 1 }}>
                    {action.title}
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#64748b' }}>
                    {action.description}
                  </Typography>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        {/* Recent Activity */}
        {cart.length > 0 && (
          <Box sx={{ mt: 4 }}>
            <Typography variant="h5" fontWeight="600" sx={{ color: '#1e293b', mb: 3 }}>
              Recent Items
            </Typography>
            <Card
              elevation={0}
              sx={{
                backgroundColor: 'white',
                border: '1px solid #f1f5f9',
                borderRadius: 2
              }}
            >
              <CardContent sx={{ p: 3 }}>
                {cart.slice(0, 3).map((item, index) => (
                  <Box 
                    key={index}
                    sx={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      py: 2,
                      borderBottom: index < 2 ? '1px solid #f1f5f9' : 'none'
                    }}
                  >
                    <Box>
                      <Typography variant="body1" fontWeight="600" sx={{ color: '#1e293b' }}>
                        {item.name || item.barcode}
                      </Typography>
                      <Typography variant="body2" sx={{ color: '#64748b' }}>
                        Qty: {item.quantity}
                      </Typography>
                    </Box>
                    <Typography variant="h6" fontWeight="600" sx={{ color: '#10b981' }}>
                      ₹{((item.price || 0) * (item.quantity || 1)).toFixed(2)}
                    </Typography>
                  </Box>
                ))}
              </CardContent>
            </Card>
          </Box>
        )}
      </Container>

      {/* Floating Action Button for Quick Scan */}
      <Fab
        size="large"
        sx={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          backgroundColor: '#10b981',
          color: 'white',
          boxShadow: '0 8px 25px rgba(16, 185, 129, 0.3)',
          '&:hover': {
            backgroundColor: '#059669',
            transform: 'scale(1.1)'
          },
          transition: 'all 0.2s ease-in-out'
        }}
        onClick={() => setScannerOpen(true)}
      >
        <ScanIcon />
      </Fab>

      {scannerOpen && (
        <Suspense fallback={null}>
          <BarcodeScanner onScan={fetchProduct} closeScanner={() => setScannerOpen(false)} />
        </Suspense>
      )}
    </Box>
  );
};

export default Dashboard;
