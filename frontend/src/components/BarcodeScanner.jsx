import { useEffect, useRef } from "react";
import { Html5QrcodeScanner, Html5QrcodeScanType } from "html5-qrcode";
import { Dialog, DialogTitle, DialogContent, Button, Box, Typography } from "@mui/material";

const BarcodeScanner = ({ onScan, closeScanner, title = "Scan a product", hint }) => {
    const scannerRef = useRef(null);

    useEffect(() => {
        const scannerId = "reader";

        // Wait until the dialog has put the camera area on the page
        const interval = setInterval(() => {
            const readerElement = document.getElementById(scannerId);
            if (readerElement && !scannerRef.current) {
                scannerRef.current = new Html5QrcodeScanner(scannerId, {
                    fps: 10,
                    qrbox: { width: 250, height: 250 },
                    showTorchButtonIfSupported: true,
                    supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA, Html5QrcodeScanType.SCAN_TYPE_FILE]
                });

                scannerRef.current.render(
                    (decodedText) => {
                        onScan(decodedText); // Send what was scanned to the page
                        closeScanner();
                    },
                    () => {
                        // Frames without a readable code are normal; ignore them
                    }
                );

                clearInterval(interval);
            }
        }, 200);

        return () => {
            clearInterval(interval);
            if (scannerRef.current) {
                scannerRef.current.clear().catch(() => {});
                scannerRef.current = null;
            }
        };
    }, [onScan, closeScanner]);

    return (
        <Dialog open onClose={closeScanner} fullWidth maxWidth="sm" disableEnforceFocus>
            <DialogTitle>{title}</DialogTitle>
            <DialogContent>
                <Typography color="text.secondary" sx={{ mb: 2 }}>
                    {hint || "Hold the barcode inside the frame. If the camera does not work, close this and type the barcode number instead."}
                </Typography>

                <Box sx={{ display: "flex", justifyContent: "center" }}>
                    <div id="reader" style={{ width: "100%", minHeight: "300px" }}></div>
                </Box>

                <Button variant="outlined" fullWidth onClick={closeScanner} sx={{ mt: 2 }}>
                    Close
                </Button>
            </DialogContent>
        </Dialog>
    );
};

export default BarcodeScanner;
