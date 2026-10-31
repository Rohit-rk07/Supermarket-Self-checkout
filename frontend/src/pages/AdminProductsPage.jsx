import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
    Box,
    Typography,
    Button,
    TablePagination,
    IconButton,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Tooltip,
    Checkbox,
    FormControlLabel,
    MenuItem
} from "@mui/material";
import { Add, Edit, Delete, UploadFile, Download } from "@mui/icons-material";
import InputAdornment from "@mui/material/InputAdornment";
import { useAuth } from "../context/AuthContext";
import TopBar from "../components/ui/TopBar";
import Money from "../components/ui/Money";
import Toast from "../components/ui/Toast";
import Sheet from "../components/ui/Sheet";
import ResponsiveRows from "../components/ui/ResponsiveRows";

const API_URL = `${import.meta.env.VITE_SERVER_URL}/api/v1/products`;
const EMPTY_FORM = { barcode: "", name: "", price: "", category: "General", stock: "", trackStock: true, gstRate: "5", taxInclusive: true };
const GST_RATES = [0, 5, 12, 18, 28];
const LOW_STOCK_LEVEL = 5; // same level the server uses for the low-stock list

// Minimal CSV parser: handles quoted fields, escaped quotes and Windows line endings
const parseCsv = (text) => {
    const rows = [];
    let row = [];
    let field = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (inQuotes) {
            if (char === '"' && text[i + 1] === '"') {
                field += '"';
                i++;
            } else if (char === '"') {
                inQuotes = false;
            } else {
                field += char;
            }
        } else if (char === '"') {
            inQuotes = true;
        } else if (char === ",") {
            row.push(field);
            field = "";
        } else if (char === "\n" || char === "\r") {
            if (char === "\r" && text[i + 1] === "\n") i++;
            row.push(field);
            field = "";
            rows.push(row);
            row = [];
        } else {
            field += char;
        }
    }

    if (field !== "" || row.length > 0) {
        row.push(field);
        rows.push(row);
    }

    return rows.filter((cells) => cells.some((cell) => cell.trim() !== ""));
};

// Turn parsed CSV rows into product objects; blank optional cells are left out
// Header (lower case) -> field name
const CSV_COLUMNS = { barcode: "barcode", name: "name", price: "price", category: "category", stock: "stock", trackstock: "trackStock", gstrate: "gstRate", taxinclusive: "taxInclusive" };

const csvToProducts = (rows) => {
    const [header, ...body] = rows;
    const columns = header.map((name) => name.trim().toLowerCase());
    const missing = ["barcode", "name", "price"].filter((name) => !columns.includes(name));
    if (missing.length > 0) throw new Error(`Missing column(s): ${missing.join(", ")}`);

    return body.map((cells) => {
        const product = {};
        columns.forEach((column, index) => {
            const value = (cells[index] ?? "").trim();
            if (CSV_COLUMNS[column] && value !== "") product[CSV_COLUMNS[column]] = value;
        });
        return product;
    });
};

// Use the most specific message the server sent
const getMessage = (data) => data?.message || data?.details || data?.error || "Something went wrong";

const AdminProductsPage = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const isAdmin = user?.role === "admin";

    const [products, setProducts] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [loading, setLoading] = useState(true);
    const [lowStockOnly, setLowStockOnly] = useState(false);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingBarcode, setEditingBarcode] = useState(null); // null = adding a new product
    const [form, setForm] = useState(EMPTY_FORM);
    const [errors, setErrors] = useState({});
    const [saving, setSaving] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [toast, setToast] = useState(null);

    // CSV import: importPlan = file waiting for confirmation, importResult = server summary
    const fileInputRef = useRef(null);
    const [importPlan, setImportPlan] = useState(null);
    const [importResult, setImportResult] = useState(null);
    const [importing, setImporting] = useState(false);
    const [lookingUp, setLookingUp] = useState(false);

    const notify = (message, severity = "success") => setToast({ message, severity });

    const authHeaders = useCallback(() => ({
        "Content-Type": "application/json",
        "Authorization": `Bearer ${user?.token}`
    }), [user?.token]);

    const fetchProducts = useCallback(async () => {
        setLoading(true);
        try {
            const lowStockQuery = lowStockOnly ? "&lowStock=true" : "";
            const response = await fetch(`${API_URL}?page=${page + 1}&limit=${rowsPerPage}${lowStockQuery}`, {
                headers: authHeaders()
            });
            const data = await response.json();
            if (!response.ok) throw new Error(getMessage(data));

            setProducts(data.data.products);
            setTotal(data.data.pagination.total);
        } catch (error) {
            setToast({ message: error.message, severity: "error" });
        } finally {
            setLoading(false);
        }
    }, [page, rowsPerPage, lowStockOnly, authHeaders]);

    useEffect(() => {
        if (isAdmin) fetchProducts();
    }, [isAdmin, fetchProducts]);

    const openAddDialog = () => {
        setEditingBarcode(null);
        setForm(EMPTY_FORM);
        setErrors({});
        setDialogOpen(true);
    };

    const openEditDialog = (product) => {
        setEditingBarcode(product.barcode);
        setForm({
            barcode: product.barcode,
            name: product.name,
            price: String(product.price),
            category: product.category || "General",
            stock: String(product.stock ?? 0),
            trackStock: product.trackStock === true,
            // Products saved before tax settings existed were sold at 18% added on top
            gstRate: String(product.gstRate ?? 18),
            taxInclusive: product.taxInclusive ?? false
        });
        setErrors({});
        setDialogOpen(true);
    };

    const handleChange = (field) => (event) => {
        setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

    // Same rules as the server (the server checks again)
    const validate = () => {
        const nextErrors = {};
        const barcode = form.barcode.trim();
        const price = Number(form.price);
        const stock = Number(form.stock);

        if (barcode.length < 8 || barcode.length > 20) nextErrors.barcode = "Barcode must be 8 to 20 characters";
        if (!form.name.trim()) nextErrors.name = "Name is required";
        if (form.price === "" || Number.isNaN(price) || price < 0 || price > 10000) {
            nextErrors.price = "Price must be between 0 and 10000";
        }
        if (form.trackStock && (form.stock === "" || !Number.isInteger(stock) || stock < 0)) nextErrors.stock = "Stock must be a whole number, 0 or more";

        setErrors(nextErrors);
        return Object.keys(nextErrors).length === 0;
    };

    const handleSave = async () => {
        if (!validate()) return;

        setSaving(true);
        const body = {
            barcode: form.barcode.trim(),
            name: form.name.trim(),
            price: Number(form.price),
            category: form.category.trim() || "General",
            stock: Number(form.stock) || 0,
            trackStock: form.trackStock,
            gstRate: Number(form.gstRate),
            taxInclusive: form.taxInclusive
        };

        try {
            const url = editingBarcode ? `${API_URL}/${encodeURIComponent(editingBarcode)}` : API_URL;
            const response = await fetch(url, {
                method: editingBarcode ? "PUT" : "POST",
                headers: authHeaders(),
                body: JSON.stringify(body)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(getMessage(data));

            notify(editingBarcode ? "Product updated" : "Product added");
            setDialogOpen(false);
            fetchProducts();
        } catch (error) {
            notify(error.message, "error");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        try {
            const response = await fetch(`${API_URL}/${encodeURIComponent(deleteTarget.barcode)}`, {
                method: "DELETE",
                headers: authHeaders()
            });
            const data = await response.json();
            if (!response.ok) throw new Error(getMessage(data));

            notify("Product deleted");
            setDeleteTarget(null);

            // If the last item on this page was deleted, go back one page
            if (products.length === 1 && page > 0) {
                setPage(page - 1);
            } else {
                fetchProducts();
            }
        } catch (error) {
            notify(error.message, "error");
        }
    };

    const handleFileChosen = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = ""; // lets the same file be chosen again
        if (!file) return;

        try {
            const text = (await file.text()).replace(/^\uFEFF/, "");
            const rows = csvToProducts(parseCsv(text));
            if (rows.length === 0) throw new Error("The file has no product rows");
            if (rows.length > 500) throw new Error("Please import at most 500 products at a time");
            setImportPlan({ fileName: file.name, products: rows });
        } catch (error) {
            notify(error.message, "error");
        }
    };

    const runImport = async () => {
        setImporting(true);
        try {
            const response = await fetch(`${API_URL}/import`, {
                method: "POST",
                headers: authHeaders(),
                body: JSON.stringify({ products: importPlan.products })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(getMessage(data));

            setImportPlan(null);
            setImportResult(data.data);
            fetchProducts();
        } catch (error) {
            notify(error.message, "error");
        } finally {
            setImporting(false);
        }
    };

    // Ask the server to suggest a name and category from a public food-product database.
    // It never fills the price, and it never overwrites what the admin already typed.
    const handleLookup = async () => {
        const barcode = form.barcode.trim();
        if (!/^\d{8,14}$/.test(barcode)) {
            notify("Enter the 8 to 14 digit barcode first", "error");
            return;
        }

        setLookingUp(true);
        try {
            const response = await fetch(`${API_URL}/lookup/${encodeURIComponent(barcode)}`, {
                headers: authHeaders()
            });
            const data = await response.json();
            if (!response.ok) throw new Error(getMessage(data));

            setForm((prev) => ({
                ...prev,
                name: prev.name.trim() ? prev.name : data.data.name,
                category: prev.category && prev.category !== "General" ? prev.category : (data.data.category || prev.category)
            }));
            notify(`Found: ${data.data.name}. Please enter the price.`);
        } catch (error) {
            notify(error.message, "error");
        } finally {
            setLookingUp(false);
        }
    };

    const downloadTemplate = () => {
        const sample = "barcode,name,price,category,stock,trackStock,gstRate,taxInclusive\n1234567890123,Apple,120,Fruits,100,yes,5,yes\n2345678901234,Banana,60,Fruits,150,no,0,yes\n";
        const url = URL.createObjectURL(new Blob([sample], { type: "text/csv" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = "products-template.csv";
        link.click();
        URL.revokeObjectURL(url);
    };

    if (!isAdmin) {
        return (
            <Box sx={{ minHeight: "100vh" }}>
                <TopBar title="Manage products" backTo="/dashboard" />
                <Box sx={{ maxWidth: 480, mx: "auto", px: 3, py: 8, textAlign: "center" }}>
                    <Typography component="h2" variant="h5" gutterBottom>Admins only</Typography>
                    <Typography color="text.secondary" sx={{ mb: 3 }}>
                        Your account does not have permission to manage products.
                    </Typography>
                    <Button variant="outlined" onClick={() => navigate("/dashboard")}>Back to dashboard</Button>
                </Box>
            </Box>
        );
    }

    const columns = [
        {
            label: "Name",
            primary: true,
            render: (product) => (
                <>
                    {product.name}
                    <Typography component="span" variant="body2" color="text.secondary" sx={{ display: "block", fontFamily: "monospace" }}>
                        {product.barcode}
                    </Typography>
                </>
            )
        },
        { label: "Category", render: (product) => product.category },
        {
            label: "GST",
            render: (product) => `${product.gstRate ?? 18}% ${(product.taxInclusive ?? false) ? "included" : "added"}`
        },
        { label: "Price", align: "right", render: (product) => <Money value={product.price} /> },
        {
            label: "Stock",
            align: "right",
            render: (product) => {
                if (product.trackStock !== true) return <Typography component="span" variant="body2" color="text.secondary">Not tracked</Typography>;
                const stock = product.stock ?? 0;
                const low = stock <= LOW_STOCK_LEVEL;
                return (
                    <Typography component="span" sx={{ fontVariantNumeric: "tabular-nums", color: low ? "error.main" : "inherit", fontWeight: low ? 700 : 400 }}>
                        {stock}{low ? " (low)" : ""}
                    </Typography>
                );
            }
        },
        {
            label: "Actions",
            align: "right",
            actions: true,
            render: (product) => (
                <>
                    <Tooltip title="Edit">
                        <IconButton aria-label={`Edit ${product.name}`} onClick={() => openEditDialog(product)}>
                            <Edit fontSize="small" />
                        </IconButton>
                    </Tooltip>
                    <Tooltip title="Delete">
                        <IconButton aria-label={`Delete ${product.name}`} color="error" onClick={() => setDeleteTarget(product)}>
                            <Delete fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </>
            )
        }
    ];

    return (
        <Box sx={{ minHeight: "100vh" }}>
            <TopBar title="Manage products" backTo="/dashboard" />

            <Box sx={{ maxWidth: 1040, mx: "auto", px: { xs: 2, sm: 3 }, pt: 3, pb: 8 }}>
                <Box sx={{ display: "flex", gap: 1, mb: 2, flexWrap: "wrap", alignItems: "center" }}>
                    <Button variant="contained" startIcon={<Add />} onClick={openAddDialog}>
                        Add product
                    </Button>
                    <input ref={fileInputRef} type="file" accept=".csv,text/csv" hidden onChange={handleFileChosen} />
                    <Button variant="outlined" startIcon={<UploadFile />} onClick={() => fileInputRef.current?.click()}>
                        Import CSV
                    </Button>
                    <Button startIcon={<Download />} onClick={downloadTemplate}>
                        Template
                    </Button>
                    <FormControlLabel
                        sx={{ ml: { sm: "auto" } }}
                        control={
                            <Checkbox
                                checked={lowStockOnly}
                                onChange={(event) => {
                                    setLowStockOnly(event.target.checked);
                                    setPage(0);
                                }}
                            />
                        }
                        label="Low stock only"
                    />
                </Box>

                <ResponsiveRows
                    columns={columns}
                    rows={products}
                    rowKey={(product) => product.barcode}
                    loading={loading}
                    emptyText={lowStockOnly ? "No tracked product is running low." : "No products yet. Add the first one."}
                    footer={
                        <TablePagination
                            component="div"
                            count={total}
                            page={page}
                            onPageChange={(event, newPage) => setPage(newPage)}
                            rowsPerPage={rowsPerPage}
                            onRowsPerPageChange={(event) => {
                                setRowsPerPage(parseInt(event.target.value, 10));
                                setPage(0);
                            }}
                            rowsPerPageOptions={[10, 25, 50]}
                        />
                    }
                />
            </Box>

            {/* Add / edit */}
            <Sheet open={dialogOpen} onClose={() => !saving && setDialogOpen(false)}>
                <DialogTitle>{editingBarcode ? "Edit product" : "Add product"}</DialogTitle>
                <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
                    <TextField
                        label="Barcode"
                        value={form.barcode}
                        onChange={handleChange("barcode")}
                        error={!!errors.barcode}
                        helperText={errors.barcode || "The digits printed under the barcode (8 to 20 characters)"}
                        InputProps={{
                            endAdornment: editingBarcode ? undefined : (
                                <InputAdornment position="end">
                                    <Button size="small" onClick={handleLookup} disabled={lookingUp}>
                                        {lookingUp ? "Looking..." : "Look up"}
                                    </Button>
                                </InputAdornment>
                            )
                        }}
                        disabled={!!editingBarcode}
                        required
                    />
                    <TextField
                        label="Name"
                        value={form.name}
                        onChange={handleChange("name")}
                        error={!!errors.name}
                        helperText={errors.name}
                        required
                    />
                    <TextField
                        label={"Shelf price (₹)"}
                        type="number"
                        value={form.price}
                        onChange={handleChange("price")}
                        error={!!errors.price}
                        helperText={errors.price || (form.taxInclusive ? "The price printed on the shelf, GST included" : "The price before GST. GST is added at checkout")}
                        required
                    />
                    <TextField
                        label="Category"
                        value={form.category}
                        onChange={handleChange("category")}
                    />
                    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
                        <TextField
                            select
                            label="GST rate"
                            value={form.gstRate}
                            onChange={handleChange("gstRate")}
                        >
                            {GST_RATES.map((rate) => (
                                <MenuItem key={rate} value={String(rate)}>{rate}%</MenuItem>
                            ))}
                        </TextField>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={form.taxInclusive}
                                    onChange={(event) => setForm((prev) => ({ ...prev, taxInclusive: event.target.checked }))}
                                />
                            }
                            label="Shelf price includes GST"
                        />
                    </Box>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={form.trackStock}
                                onChange={(event) => setForm((prev) => ({ ...prev, trackStock: event.target.checked }))}
                            />
                        }
                        label="Track stock for this product"
                    />
                    <TextField
                        label="Units in stock"
                        type="number"
                        value={form.stock}
                        onChange={handleChange("stock")}
                        disabled={!form.trackStock}
                        error={!!errors.stock}
                        helperText={errors.stock || (form.trackStock ? "Shoppers cannot buy more than this. Stock drops when an order is paid." : "Turn on tracking to limit how many can be sold")}
                    />
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
                    <Button variant="contained" onClick={handleSave} disabled={saving}>
                        {saving ? "Saving..." : "Save"}
                    </Button>
                </DialogActions>
            </Sheet>

            {/* CSV import: preview and confirm */}
            <Sheet open={!!importPlan} onClose={() => !importing && setImportPlan(null)}>
                <DialogTitle>Import products?</DialogTitle>
                <DialogContent>
                    <Typography sx={{ mb: 2 }}>
                        {importPlan?.products.length} rows found in {importPlan?.fileName}. New barcodes are added; barcodes that already exist are updated with the name, price, category, stock and tax settings in the file.
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
                        First {Math.min(5, importPlan?.products.length || 0)} rows
                    </Typography>
                    {importPlan?.products.slice(0, 5).map((row, index) => (
                        <Box key={index} sx={{ display: "flex", justifyContent: "space-between", gap: 2, py: 0.75, borderTop: 1, borderColor: "divider" }}>
                            <Typography variant="body2" noWrap sx={{ minWidth: 0 }}>
                                <span style={{ fontFamily: "monospace" }}>{row.barcode}</span> {"·"} {row.name}
                            </Typography>
                            <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                                {"₹"}{row.price}
                            </Typography>
                        </Box>
                    ))}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setImportPlan(null)} disabled={importing}>Cancel</Button>
                    <Button variant="contained" onClick={runImport} disabled={importing}>
                        {importing ? "Importing..." : "Import"}
                    </Button>
                </DialogActions>
            </Sheet>

            {/* CSV import: result */}
            <Sheet open={!!importResult} onClose={() => setImportResult(null)}>
                <DialogTitle>Import finished</DialogTitle>
                <DialogContent>
                    <Typography>
                        {importResult?.created} added, {importResult?.updated} updated, {importResult?.failed} skipped.
                    </Typography>
                    {importResult?.errors?.length > 0 && (
                        <Box component="ul" sx={{ mt: 2, pl: 3 }}>
                            {importResult.errors.slice(0, 20).map((rowError) => (
                                <li key={rowError.row}>
                                    Row {rowError.row}{rowError.barcode ? ` (${rowError.barcode})` : ""}: {rowError.message}
                                </li>
                            ))}
                            {importResult.errors.length > 20 && (
                                <li>and {importResult.errors.length - 20} more</li>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setImportResult(null)}>Close</Button>
                </DialogActions>
            </Sheet>

            {/* Delete confirmation */}
            <Sheet open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
                <DialogTitle>Delete product?</DialogTitle>
                <DialogContent>
                    <Typography>
                        {deleteTarget?.name} ({deleteTarget?.barcode}) will no longer be scannable. Past orders are not affected.
                    </Typography>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
                    <Button color="error" variant="contained" onClick={handleDelete}>Delete</Button>
                </DialogActions>
            </Sheet>

            <Toast toast={toast} onClose={() => setToast(null)} />
        </Box>
    );
};

export default AdminProductsPage;
