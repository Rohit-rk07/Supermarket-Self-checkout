import { Box, Typography, Button } from "@mui/material";
import { QrCodeScanner, ReceiptLong, ShoppingBasket } from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import TopBar from "../../components/ui/TopBar";
import { Tile, ToolCard, HomeFrame } from "./Parts";
import { useTodayStats } from "./useTodayStats";

// The staff member's first page: the exit desk. One big button, and the two numbers that matter at the door.
const StaffHome = ({ onShop }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { today, loading } = useTodayStats(user?.token);
  const firstName = (user?.name || "").trim().split(" ")[0];

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <TopBar />
      <HomeFrame>
        <Typography component="h1" variant="h2" sx={{ mb: 0.5 }}>
          Exit desk{firstName ? `, ${firstName}` : ""}.
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Scan each shopper's receipt before they leave.
        </Typography>

        <Button
          variant="contained"
          size="large"
          fullWidth
          startIcon={<QrCodeScanner />}
          onClick={() => navigate("/staff/verify")}
          sx={{ minHeight: 72, fontSize: "1.25rem", mb: 3 }}
        >
          Scan a receipt
        </Button>

        <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5, mb: 4 }}>
          <Tile label="Awaiting exit" value={loading ? "..." : today?.awaitingExit ?? 0} hint="Paid, not yet through the door" />
          <Tile label="Exited today" value={loading ? "..." : today?.exited ?? 0} />
        </Box>

        <Box sx={{ mb: 4 }}>
          <ToolCard icon={<ReceiptLong />} title="All orders" description="Look up an order or check a payment" onClick={() => navigate("/staff/orders")} />
        </Box>

        <Button startIcon={<ShoppingBasket />} variant="outlined" onClick={onShop}>
          Shop as a customer
        </Button>
      </HomeFrame>
    </Box>
  );
};

export default StaffHome;
