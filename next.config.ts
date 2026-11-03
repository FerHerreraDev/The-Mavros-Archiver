import type { NextConfig } from "next";

// Headers de seguridad para todas las respuestas (OPS-07)
const securityHeaders = [
  // Nadie puede incrustar la app en un iframe (clickjacking)
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Pantalla completa y PiP del reproductor (y del tráiler de YouTube, CAT-09) sí; cámara, micro, ubicación, etc. no
  {
    key: "Permissions-Policy",
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), fullscreen=(self "https://www.youtube-nocookie.com"), picture-in-picture=(self "https://www.youtube-nocookie.com")',
  },
  // Solo tiene efecto en HTTPS; en localhost el navegador lo ignora
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Las pruebas E2E construyen en otra carpeta para no pisar el build normal
  distDir: process.env.NEXT_DIST_DIR || ".next",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
