import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ThemeProvider, CssBaseline } from "@mui/material";
import { Suspense, lazy } from "react";
import { CartProvider } from "./context/CartContext";
import { AuthProvider } from "./context/AuthContext";
import { SignInPromptProvider } from "./context/SignInPrompt";
import { OrderProvider } from "./context/OrderContext"; 
import ProtectedRoute from "./components/ProtectedRoute";
import LoadingSpinner from "./components/LoadingSpinner";
import { theme } from "./theme/theme";

// Lazy load all page components
const Dashboard = lazy(() => import("./pages/Dashboard"));
const CartPage = lazy(() => import("./pages/CartPage"));
const Checkout = lazy(() => import("./components/checkout"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const BarcodeScanner = lazy(() => import("./components/BarcodeScanner"));
const AccountPage = lazy(() => import("./components/AccountPage"));
const AdminProductsPage = lazy(() => import("./pages/AdminProductsPage"));
const VerifyExitPage = lazy(() => import("./pages/VerifyExitPage"));
const StaffOrdersPage = lazy(() => import("./pages/StaffOrdersPage"));
const AdminUsersPage = lazy(() => import("./pages/AdminUsersPage"));
const AdminSettingsPage = lazy(() => import("./pages/AdminSettingsPage"));
const AdminActivityPage = lazy(() => import("./pages/AdminActivityPage"));
const AdminReportsPage = lazy(() => import("./pages/AdminReportsPage"));

function App() {
    return (
        <ThemeProvider theme={theme}>
            <CssBaseline />
            <Router> 
                <AuthProvider>
                    <CartProvider>
                        <OrderProvider>
                          <SignInPromptProvider>
                            <Suspense fallback={<LoadingSpinner message="Loading page..." />}>
                                <Routes>
                                    {/* Open to everyone: the shop home (scan and fill a basket) and the basket. Signing in is asked for at checkout. */}
                                    <Route path="/" element={<Dashboard />} />
                                    <Route path="/login" element={<LoginPage />} />
                                    <Route path="/dashboard" element={<Dashboard />} />
                                    <Route path="/cart" element={<CartPage />} />
                                    <Route path="/checkout" element={<ProtectedRoute><Checkout /></ProtectedRoute>} />
                                    <Route path="/BarcodeScanner" element={<ProtectedRoute><BarcodeScanner /></ProtectedRoute>} />
                                    <Route path="/account" element={<ProtectedRoute><AccountPage /></ProtectedRoute>} />
                                    <Route path="/admin/products" element={<ProtectedRoute><AdminProductsPage /></ProtectedRoute>} />
                                    <Route path="/staff/verify" element={<ProtectedRoute><VerifyExitPage /></ProtectedRoute>} />
                                    <Route path="/staff/orders" element={<ProtectedRoute><StaffOrdersPage /></ProtectedRoute>} />
                                    <Route path="/admin/users" element={<ProtectedRoute><AdminUsersPage /></ProtectedRoute>} />
                                    <Route path="/admin/settings" element={<ProtectedRoute><AdminSettingsPage /></ProtectedRoute>} />
                                    <Route path="/admin/activity" element={<ProtectedRoute><AdminActivityPage /></ProtectedRoute>} />
                                    <Route path="/admin/reports" element={<ProtectedRoute><AdminReportsPage /></ProtectedRoute>} />
                                </Routes>
                            </Suspense>
                          </SignInPromptProvider>
                        </OrderProvider>
                    </CartProvider>
                </AuthProvider>
            </Router>
        </ThemeProvider>
    );
}

export default App;