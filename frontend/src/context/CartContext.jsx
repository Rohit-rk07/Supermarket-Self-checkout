import { createContext, useContext, useState, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";

const CartContext = createContext();

export const CartProvider = ({ children }) => {
    const { user } = useAuth();
    const [cart, setCart] = useState([]);
    const hasFetchedCart = useRef(false); // Flag to avoid first write
    // Which storage key the current cart was loaded from (lets pages wait until it matches the user)
    const [loadedKey, setLoadedKey] = useState(null);
    const currentKey = user ? `cart_${user.phoneNumber || user.email || user.id}` : 'cart_guest';

    // Load cart from localStorage on mount / when user changes
    useEffect(() => {
        const key = user ? `cart_${user.phoneNumber || user.email || user.id}` : 'cart_guest';
        try {
            const saved = localStorage.getItem(key);
            if (saved) {
                setCart(JSON.parse(saved));
            } else {
                setCart([]);
            }
        } catch (e) {
            console.error("Failed to load cart from storage", e);
            setCart([]);
        }
        hasFetchedCart.current = true;
        setLoadedKey(key);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.phoneNumber, user?.email, user?.id]);

    // Persist cart to localStorage whenever it changes (after first load)
    useEffect(() => {
        if (!hasFetchedCart.current) return;
        const key = user ? `cart_${user.phoneNumber || user.email || user.id}` : 'cart_guest';
        try {
            localStorage.setItem(key, JSON.stringify(cart));
        } catch (e) {
            console.error("Failed to save cart to storage", e);
        }
    }, [cart, user]);

    // Add item to cart
    const addToCart = (product) => {
        // Check if product already exists in cart
        const existingItem = cart.find(item => item.barcode === product.barcode);
        
        if (existingItem) {
            // Update quantity if product already exists
            setCart(prevCart => 
                prevCart.map(item => 
                    item.barcode === product.barcode
                    ? { ...item, quantity: (item.quantity || 1) + 1 } 
                        : item
                )
            );
        } else {
            // Add new product with quantity 1
            setCart(prevCart => [...prevCart, { ...product, quantity: 1 }]);
            
            
        }
        
    };

    // ✅ Remove item from cart
    const removeFromCart = (barcode) => {
        setCart(prevCart => prevCart.filter(item => item.barcode !== barcode));
    };
    

    // ✅ Update item quantity
    const updateQuantity = (barcode, newQuantity) => {
        if (newQuantity < 1) return;
    
        setCart(prevCart =>
            prevCart.map(item =>
                item.barcode === barcode
                    ? { ...item, quantity: newQuantity }
                    : item
            )
        );
    };
    

    // ✅ Clear cart
    const clearCart = () => {
        setCart([]);
    };

    // Calculate total items in cart
    const totalItems = cart.reduce((total, item) => total + (item.quantity || 1), 0);
    
    // Calculate subtotal
    const subtotal = cart.reduce((total, item) => total + ((item.price || 0) * (item.quantity || 1)), 0);

    return (
        <CartContext.Provider value={{ 
            cart, 
            addToCart, 
            removeFromCart,
            updateQuantity,
            clearCart,
            cartReady: loadedKey === currentKey,
            totalItems,
            subtotal
        }}>
            {children}
        </CartContext.Provider>
    );
};

export const useCart = () => {
    const context = useContext(CartContext);
    if (context === undefined) {
        throw new Error("useCart must be used within a CartProvider");
    }
    return context;
};

export default CartContext;