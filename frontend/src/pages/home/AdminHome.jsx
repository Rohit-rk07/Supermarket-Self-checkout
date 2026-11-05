import { Box, Typography, Button, Alert } from "@mui/material";
import {
  QrCodeScanner,
  ReceiptLong,
  Inventory2,
  Group,
  History,
  Tune,
  ShoppingBasket,
} from "@mui/icons-material";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import TopBar from "../../components/ui/TopBar";
import Money from "../../components/ui/Money";
import { Tile, ToolCard, HomeFrame } from "./Parts";
import { useTodayStats } from "./useTodayStats";

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
};

// The admin's first page: how the shop is doing today, what needs attention, and the tools
const AdminHome = ({ onShop }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { today, payments, failed, loading } = useTodayStats(user?.token);
  const firstName = (user?.name || "").trim().split(" ")[0];

  return (
    <Box sx={{ minHeight: "100vh" }}>
      <TopBar />
      <HomeFrame>
        <Typography component="h1" variant="h2" sx={{ mb: 0.5 }}>
          {greeting()}{firstName ? `, ${firstName}` : ""}.
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
        </Typography>

        {/* Things that need attention come first */}
        {payments && !payments.webhookConfigured && (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            Payment webhook is off. A shopper who closes the browser right after paying stays Unpaid until staff use Check payment.
          </Alert>
        )}
        {payments?.webhookConfigured && !payments.lastWebhookAt && (
          <Alert severity="info" sx={{ mb: 1.5 }}>Payment webhook is on, but no call has arrived yet.</Alert>
        )}
        {today?.refundsFailed > 0 && (
          <Alert
            severity="error"
            sx={{ mb: 1.5 }}
            action={<Button color="inherit" size="small" onClick={() => navigate("/staff/orders?show=refundFailed")}>See them</Button>}
          >
            Razorpay could not complete {today.refundsFailed} {today.refundsFailed === 1 ? "refund" : "refunds"}. The shopper has not got their money back yet.
          </Alert>
        )}
        {today?.bagMismatches > 0 && (
          <Alert
            severity="warning"
            sx={{ mb: 1.5 }}
            action={<Button color="inherit" size="small" onClick={() => navigate("/staff/orders?show=bagMismatch")}>See them</Button>}
          >
            {today.bagMismatches} bag {today.bagMismatches === 1 ? "check" : "checks"} found a mismatch today.
          </Alert>
        )}
        {today?.lowStock > 0 && (
          <Alert
            severity="warning"
            sx={{ mb: 1.5 }}
            action={<Button color="inherit" size="small" onClick={() => navigate("/admin/products?low=1")}>See them</Button>}
          >
            {today.lowStock} {today.lowStock === 1 ? "product is" : "products are"} running low on stock.
          </Alert>
        )}
        {failed && <Alert severity="error" sx={{ mb: 1.5 }}>Could not load today's numbers. They will retry in a minute.</Alert>}

        <Typography component="h2" variant="h5" sx={{ mt: 2, mb: 1.5 }}>Today</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(3, 1fr)" }, gap: 1.5, mb: 4 }}>
          <Tile label="Sales (incl. GST)" value={loading ? "..." : <Money value={today?.sales || 0} />} hint={`${today?.paidOrders ?? 0} paid ${today?.paidOrders === 1 ? "order" : "orders"}`} />
          <Tile
            label="Awaiting exit"
            value={loading ? "..." : today?.awaitingExit ?? 0}
            hint="Paid, not yet through the door"
            onClick={() => navigate("/staff/verify")}
          />
          <Tile label="Exited today" value={loading ? "..." : today?.exited ?? 0} />
          <Tile
            label="Bag checks today"
            value={loading ? "..." : today?.bagChecked ?? 0}
            hint={today?.bagMismatches > 0 ? `${today.bagMismatches} mismatch` : "no mismatches"}
            tone={today?.bagMismatches > 0 ? "warning" : undefined}
            onClick={() => navigate("/staff/orders?show=bagMismatch")}
          />
          <Tile
            label="Low stock"
            value={loading ? "..." : today?.lowStock ?? 0}
            tone={today?.lowStock > 0 ? "warning" : undefined}
            onClick={() => navigate("/admin/products?low=1")}
          />
          <Tile
            label="Refunds today"
            value={loading ? "..." : today?.refunds ?? 0}
            hint={today?.refunds > 0 ? <Money value={today.refundedAmount} /> : undefined}
            onClick={() => navigate("/staff/orders")}
          />
        </Box>

        <Typography component="h2" variant="h5" sx={{ mb: 1.5 }}>Store tools</Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 1.5, mb: 4 }}>
          <ToolCard icon={<QrCodeScanner />} title="Verify a receipt" description="Check a shopper's QR code at the exit" onClick={() => navigate("/staff/verify")} />
          <ToolCard icon={<ReceiptLong />} title="All orders" description="Sales, payments, exits and refunds" onClick={() => navigate("/staff/orders")} />
          <ToolCard icon={<Inventory2 />} title="Products" description="Add, edit, price and import the catalog" onClick={() => navigate("/admin/products")} />
          <ToolCard icon={<Group />} title="Staff" description="Roles, and switching accounts on or off" onClick={() => navigate("/admin/users")} />
          <ToolCard icon={<History />} title="Activity log" description="Who changed what, and when" onClick={() => navigate("/admin/activity")} />
          <ToolCard icon={<Tune />} title="Settings" description="Random bag check and other shop rules" onClick={() => navigate("/admin/settings")} />
        </Box>

        <Button startIcon={<ShoppingBasket />} variant="outlined" onClick={onShop}>
          Shop as a customer
        </Button>
      </HomeFrame>
    </Box>
  );
};

export default AdminHome;
