import type { Metadata, Viewport } from "next";

// App shell: page wrapper, title, and theme.
import "./tailwind.css";
import "./klh.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lesson Lab — Self-Evaluating Content Generator",
  description:
    "Agentic generate → evaluate → regenerate loop that builds a beginner lesson and decides on its own whether it is good enough to ship.",
  icons: { icon: "/icons/klh-favicon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

import { Agentation } from "agentation";

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>
        {children}
        {process.env.NODE_ENV === "development" && <Agentation />}
      </body>
    </html>
  );
}
