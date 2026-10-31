import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "./AuthContext";

const OrderContext = createContext();

const buildHeaders = (token) => {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
    };
};

export const OrderProvider = ({ children }) => {
    const { user } = useAuth();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Load the user's orders (also used to refresh after a payment)
    const fetchOrders = useCallback(async () => {
        if (!user || !user.token) {
            setOrders([]);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/v1/orders/my-orders`, {
                headers: buildHeaders(user.token)
            });

            if (!response.ok) {
                throw new Error('Failed to fetch purchases');
            }

            const data = await response.json();
            setOrders(data.data.orders || []);
        } catch (err) {
            console.error("Error fetching purchases:", err);
            setError("Failed to load purchase history. Please try again later.");
        } finally {
            setLoading(false);
        }
    }, [user]);

    // Fetch orders when user changes
    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    // Save a new order. It starts as pending/unpaid and is priced by the server,
    // so only barcodes and quantities are sent. Returns the new order id.
    // If the server refuses (for example an item is out of stock) this throws with the server's message.
    const createOrder = async (orderData) => {
        if (!user || !user.token) return null;

        const response = await fetch(`${import.meta.env.VITE_SERVER_URL}/api/v1/orders`, {
            method: 'POST',
            headers: buildHeaders(user.token),
            body: JSON.stringify({
                items: orderData.items.map(item => ({
                    barcode: item.barcode,
                    quantity: item.quantity || 1
                })),
                notes: orderData.notes || 'Self checkout'
            })
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.message || data.details || data.error || 'Failed to create order');
        }

        const newOrder = data.data;
        setOrders(prevOrders => [newOrder, ...prevOrders]);
        return newOrder._id;
    };

    return (
        <OrderContext.Provider value={{
            orders,
            loading,
            error,
            createOrder,
            refreshOrders: fetchOrders
        }}>
            {children}
        </OrderContext.Provider>
    );
};

export const useOrders = () => {
    const context = useContext(OrderContext);
    if (context === undefined) {
        throw new Error("useOrders must be used within an OrderProvider");
    }
    return context;
};

export default OrderContext;
