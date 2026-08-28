import type { Metadata } from "next";
import { ThemeProvider } from "@/components/shell/theme-provider";
// Self-hosted via @fontsource (bundled at build time, no runtime request) — this
// environment has no egress to Google Fonts, and v1 made the same "works with no
// network" call. Mono is deliberately NOT preference-driven ("IBM Plex Mono for every
// quantity" is a data-readability decision, not a personal taste one) — see globals.css.
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ASTU Teaching Feedback",
  description: "Adama Science and Technology University lecturer feedback system",
};

// Runs before hydration to avoid a light/dark flash — reads the same localStorage keys
// ThemeProvider persists to, and stamps the same attributes it would apply on mount.
const themeInitScript = `
(function () {
  try {
    var theme = localStorage.getItem("astu-theme") || "light";
    var size = localStorage.getItem("astu-font-size");
    var family = localStorage.getItem("astu-font-family");
    document.documentElement.setAttribute("data-theme", theme);
    if (size && size !== "normal") document.documentElement.setAttribute("data-font-size", size);
    if (family && family !== "sans") document.documentElement.setAttribute("data-font-family", family);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
