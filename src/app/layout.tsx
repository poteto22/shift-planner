import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ตารางกะสตูดิโอ · Studio Shift Planner",
  description: "ระบบวางแผนกะการทำงานของสตูดิโอสถานีโทรทัศน์",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body className="antialiased min-h-screen">{children}</body>
    </html>
  );
}
