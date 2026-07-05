import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

// Documento HTML raiz do expo-router para web (renderizado no servidor/build).
// SERVER-ONLY: apenas markup estático — sem hooks, efeitos ou APIs de browser.
// O registro do service worker fica no app/_layout.tsx (roda no cliente).
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="pt-BR">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no"
        />

        {/* PWA — instalação */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#C97826" />
        <meta name="mobile-web-app-capable" content="yes" />

        {/* iOS: instalação depende exclusivamente destas meta tags + apple-touch-icon */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="MotoRoute" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <link rel="icon" href="/favicon.png" />

        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
