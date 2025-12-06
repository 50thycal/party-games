import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Party Games",
  description: "Jackbox-style party game framework",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-900 text-white">
        {children}
      </body>
    </html>
  );
}
