import { lazy, Suspense, useState } from "react";
import { useAuth } from "../context/AuthContext";
import LoadingSpinner from "../components/LoadingSpinner";

const ShopperHome = lazy(() => import("./home/ShopperHome"));
const StaffHome = lazy(() => import("./home/StaffHome"));
const AdminHome = lazy(() => import("./home/AdminHome"));

const SHOP_MODE_KEY = "shopMode";

// Staff and admins can step into "shop mode" to scan and pay like a customer. Remembered in this browser only.
const readShopMode = () => {
  try {
    return localStorage.getItem(SHOP_MODE_KEY) === "1";
  } catch {
    return false;
  }
};

// Each role gets its own first page: shoppers scan and pay, staff run the exit desk, admins see how the shop is doing
const Dashboard = () => {
  const { user, loading } = useAuth();
  const [shopMode, setShopModeState] = useState(readShopMode);

  const setShopMode = (value) => {
    setShopModeState(value);
    try {
      if (value) localStorage.setItem(SHOP_MODE_KEY, "1");
      else localStorage.removeItem(SHOP_MODE_KEY);
    } catch {
      // Not remembering the choice is fine
    }
  };

  // Wait for the saved sign-in to be checked, so a signed-in admin does not flash the shopper page first
  if (loading) return <LoadingSpinner message="Loading..." />;

  const role = user?.role;
  const isStore = role === "admin" || role === "staff";

  let page;
  if (isStore && !shopMode) {
    page = role === "admin" ? <AdminHome onShop={() => setShopMode(true)} /> : <StaffHome onShop={() => setShopMode(true)} />;
  } else {
    page = <ShopperHome onBackToDesk={isStore ? () => setShopMode(false) : undefined} />;
  }

  return <Suspense fallback={<LoadingSpinner message="Loading..." />}>{page}</Suspense>;
};

export default Dashboard;
