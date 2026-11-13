import { createContext, useContext, useState, useEffect } from "react";

// Create context
const AuthContext = createContext(null);

const API = import.meta.env.VITE_SERVER_URL;

// The shape of the signed-in person used all over the app. `id` and `_id` are the same value.
const toUser = (person, token) => ({
    id: person.id || person._id,
    _id: person._id || person.id,
    name: person.name,
    email: person.email,
    phoneNumber: person.phoneNumber,
    picture: person.picture,
    role: person.role,
    token
});

// Create provider component
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    // True when a saved sign-in was refused by the server (expired or revoked), so the login page can say why
    const [sessionExpired, setSessionExpired] = useState(false);

    // The user details saved at login, used only when the server cannot be asked right now
    const readSavedUser = (token) => {
        try {
            const saved = JSON.parse(localStorage.getItem('user') || 'null');
            return saved ? { ...saved, token } : null;
        } catch {
            return null;
        }
    };

    // Check for existing token on app load
    useEffect(() => {
        const checkAuthState = async () => {
            const token = localStorage.getItem('token') || localStorage.getItem('authToken');
            if (token) {
                try {
                    // Verify token with backend
                    const response = await fetch(`${API}/api/auth/profile`, {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        }
                    });

                    if (response.ok) {
                        const data = await response.json();
                        setUser(toUser(data.data, token));
                    } else if (response.status === 401 || response.status === 403) {
                        // The server says this token is not valid (expired or revoked): sign out
                        localStorage.removeItem('authToken');
                        localStorage.removeItem('token');
                        setUser(null);
                        setSessionExpired(true);
                    } else {
                        // The server is busy or rate limiting (429, 5xx). The token may still be fine,
                        // so stay signed in with the details saved at login instead of throwing the shopper out.
                        setUser(readSavedUser(token));
                    }
                } catch (error) {
                    // No network right now: keep the session; the next request will tell us if the token is bad
                    console.error('Auth check error:', error);
                    setUser(readSavedUser(token));
                }
            }
            setLoading(false);
        };

        checkAuthState();
    }, []);

    // Sign in with the credential Google's button hands back
    const loginWithGoogle = async (credential) => {
        try {
            setError("");
            const response = await fetch(`${API}/api/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential })
            });
            const data = await response.json();
            if (!response.ok) {
                // While developing, the server also says why it failed (data.detail); the live site never sends it
                const why = import.meta.env.DEV && data.detail ? ` (${data.detail})` : "";
                throw new Error((data.message || "Sign-in failed. Please try again.") + why);
            }

            const signedIn = toUser(data.data.user, data.data.token);
            localStorage.setItem('token', data.data.token);
            localStorage.setItem('user', JSON.stringify(data.data.user));
            setSessionExpired(false);
            setUser(signedIn);
            return signedIn;
        } catch (error) {
            setError(error.message || "Sign-in failed. Please try again.");
            throw error;
        }
    };

    // Logout
    const logout = async () => {
        try {
            localStorage.removeItem('authToken');
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            setUser(null);
            setSessionExpired(false);
        } catch (error) {
            console.error("Logout error:", error.message);
            setError("⚠️ Failed to log out. Please try again.");
        }
    };

    // Update user profile (name, and an optional contact number)
    const updateProfile = async (profileData) => {
        try {
            setError("");
            const response = await fetch(`${API}/api/auth/profile`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${user.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(profileData)
            });

            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.message || "Could not save your profile");
            }

            setUser((current) => ({ ...current, ...toUser(data.data, current.token) }));
            return data;
        } catch (error) {
            console.error("Update profile error:", error);
            throw error;
        }
    };

    // Context value
    const value = {
        user,
        loading,
        error,
        sessionExpired,
        loginWithGoogle,
        updateProfile,
        logout
    };

    // Return provider
    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

// Export hook
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === null) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};

// Default export for the context
export default AuthContext;
