import { useEffect, useState } from "react";

// Today's shop numbers for the staff and admin home pages (sales, awaiting exit, low stock, webhook status).
// "Today" starts when the viewer's day started, so the shop's own timezone is used. Refreshes every minute.
export const useTodayStats = (token) => {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) return undefined;
    let cancelled = false;

    const load = async () => {
      try {
        const since = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
        const response = await fetch(
          `${import.meta.env.VITE_SERVER_URL}/api/v1/orders/stats?since=${encodeURIComponent(since)}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "Could not load today's numbers");
        if (!cancelled) {
          setData({ today: body.data.today, payments: body.data.payments });
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    load();
    const timer = setInterval(load, 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [token]);

  return { today: data?.today || null, payments: data?.payments || null, failed, loading: !data && !failed };
};
