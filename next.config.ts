import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // argon2 is a native module; pdfkit and nodemailer are CJS-heavy and read their own
  // files at runtime. Keeping them external stops any bundling step from breaking them.
  serverExternalPackages: ["argon2", "pdfkit", "nodemailer"],

  // pdfkit resolves its standard-font metrics as `__dirname + '/data/Helvetica.afm'`
  // (see node_modules/pdfkit/js/pdfkit.js). That dynamic concatenation is invisible to
  // static file tracing, so on a serverless deploy the .afm files can be left out of the
  // bundle and every PDF download fails with ENOENT. Pin them explicitly.
  outputFileTracingIncludes: {
    "/api/letters": ["./node_modules/pdfkit/js/data/**"],
  },
};

export default nextConfig;
