import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["argon2", "pdfkit", "nodemailer"],
};

export default nextConfig;
