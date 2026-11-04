import { Box, Typography, ButtonBase } from "@mui/material";
import { ChevronRight } from "@mui/icons-material";
import { tokens, fonts } from "../../theme/theme";

// One number on the home pages. With onClick it becomes a button that goes somewhere useful.
export const Tile = ({ label, value, hint, onClick, tone }) => {
  const toned = tone === "warning" ? tokens.warning : null;
  const content = (
    <Box
      sx={{
        width: "100%",
        textAlign: "left",
        p: 2,
        borderRadius: "10px",
        border: 1,
        borderColor: toned ? toned.fg : "divider",
        backgroundColor: toned ? toned.bg : "background.paper",
        color: toned ? toned.fg : "text.primary",
        height: "100%",
      }}
    >
      <Typography variant="body2" sx={{ color: toned ? "inherit" : "text.secondary" }}>{label}</Typography>
      <Typography
        component="div"
        sx={{ fontFamily: fonts.serif, fontWeight: 700, fontSize: { xs: "1.6rem", sm: "1.9rem" }, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </Typography>
      {hint && <Typography variant="caption" sx={{ color: toned ? "inherit" : "text.secondary" }}>{hint}</Typography>}
    </Box>
  );

  if (!onClick) return content;
  return (
    <ButtonBase onClick={onClick} sx={{ display: "block", width: "100%", borderRadius: "10px", textAlign: "left" }}>
      {content}
    </ButtonBase>
  );
};

// A big, obvious button to one of the store tools
export const ToolCard = ({ icon, title, description, onClick }) => (
  <ButtonBase
    onClick={onClick}
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 2,
      width: "100%",
      textAlign: "left",
      p: 2,
      borderRadius: "10px",
      border: 1,
      borderColor: "divider",
      backgroundColor: "background.paper",
      "&:hover": { borderColor: "primary.main" },
    }}
  >
    <Box sx={{ display: "grid", placeItems: "center", width: 44, height: 44, borderRadius: "10px", backgroundColor: tokens.forestTint, color: tokens.forest, flexShrink: 0 }}>
      {icon}
    </Box>
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography fontWeight={600}>{title}</Typography>
      <Typography variant="body2" color="text.secondary">{description}</Typography>
    </Box>
    <ChevronRight sx={{ color: "text.secondary" }} />
  </ButtonBase>
);

// Same spacing for every home page
export const HomeFrame = ({ children }) => (
  <Box sx={{ maxWidth: 960, mx: "auto", px: { xs: 2, sm: 3 }, pt: { xs: 3, sm: 5 }, pb: 8 }}>{children}</Box>
);
