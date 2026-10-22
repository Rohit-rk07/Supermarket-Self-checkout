import { useEffect, useRef } from "react";
import { Html5QrcodeScanner,Html5QrcodeScanType } from "html5-qrcode";
import { Dialog, DialogTitle, DialogContent, Button, Box } from "@mui/material";

const BarcodeScanner = ({ onScan, closeScanner, title = "📸 Scan a Product" }) => {
    const scannerRef = useRef(null);

    useEffect(() => {
        const scannerId = "reader";

        // Wait until the modal is open
        const interval = setInterval(() => {
            const readerElement = document.getElementById(scannerId);
            if (readerElement && !scannerRef.current) {
                console.log("✅ Initializing scanner...");
                scannerRef.current = new Html5QrcodeScanner(scannerId, {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA, Html5QrcodeScanType.SCAN_TYPE_FILE] // 👈 Enable image upload
                });

                scannerRef.current.render(
                    (decodedText) => {
                        console.log("✅ Scanned:", decodedText);
                        onScan(decodedText); // Send scanned data to parent
                        closeScanner();
                    },
                    (error) => console.warn("⚠️ Scan Error:", error)
                );

                clearInterval(interval);
            }
        }, 200);

        return () => {
            clearInterval(interval);
            if (scannerRef.current) {
                console.log("🛑 Stopping scanner...");
                scannerRef.current.clear().catch((err) => console.warn("❌ Error clearing scanner:", err));
                scannerRef.current = null;
            }
        };
    }, [onScan, closeScanner]);

    return (
        <Dialog
            open
            onClose={closeScanner}
            fullWidth
            maxWidth="sm"
            disableEnforceFocus
        >
            <DialogTitle>{title}</DialogTitle>
            <DialogContent>
                <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
                    <div id="reader" style={{ width: "100%", height: "300px" }}></div>
                </Box>

                <Button variant="contained" color="error" fullWidth onClick={closeScanner} sx={{ mt: 2 }}>
                    ❌ Close Scanner
                </Button>
            </DialogContent>
        </Dialog>
    );
};

export default BarcodeScanner;
