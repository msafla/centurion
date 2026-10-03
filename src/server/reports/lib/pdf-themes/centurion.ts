import type { PdfcnTheme } from "../../types/pdf-themes";

import { defaultPrimitives } from "./primitives";

/** DESIGN.md brand tokens, reused by the PDF theme. */
export const centurionBrand = {
  primary: "#451DC7",
  deep: "#360058",
  accent: "#04F06A",
  ink: "#111111",
  surface: "#FFFFFF",
  border: "#E5E0F0",
  textSecondary: "#625B70",
  surfaceSoft: "#F7F5FC",
} as const;

/**
 * CENTURION PDF theme.
 *
 * Mirrors DESIGN.md: Poppins, brand violet `#451DC7`, deep `#360058`, accent
 * `#04F06A`, ink `#111111`, soft surface `#F7F5FC`, border `#E5E0F0`. Titles are
 * light (Poppins 300) as on the web application.
 */
export const centurionPdfTheme: PdfcnTheme = {
  name: "centurion",
  primitives: defaultPrimitives,
  colors: {
    accent: centurionBrand.accent,
    background: centurionBrand.surface,
    border: centurionBrand.border,
    destructive: "#B91C1C",
    foreground: centurionBrand.ink,
    info: centurionBrand.deep,
    muted: centurionBrand.surfaceSoft,
    mutedForeground: centurionBrand.textSecondary,
    primary: centurionBrand.primary,
    primaryForeground: centurionBrand.surface,
    success: "#15803D",
    warning: "#B45309",
  },
  typography: {
    body: {
      fontFamily: "Poppins",
      fontSize: 9,
      lineHeight: 1.5,
    },
    heading: {
      fontFamily: "Poppins",
      fontWeight: 300,
      lineHeight: 1.2,
      fontSize: {
        h1: 22,
        h2: 15,
        h3: 13,
        h4: 11,
        h5: 10,
        h6: 9,
      },
    },
  },
  spacing: {
    componentGap: 8,
    page: {
      marginBottom: 48,
      marginLeft: 36,
      marginRight: 36,
      marginTop: 52,
    },
    paragraphGap: 6,
    sectionGap: 18,
  },
  page: {
    orientation: "landscape",
    size: "A4",
  },
};
