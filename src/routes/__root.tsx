import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { CreatedWithGrokBanner } from "@/components/created-with-grok-banner";
import appCss from "../styles.css?url";

const APP_NAME = "Aether Bastion";
const host = import.meta.env.VITE_PUBLIC_HOSTNAME;
const ogImage = host ? `https://${host}/og.jpg` : undefined;
const xBanner = host ? `https://${host}/x-banner.jpg` : undefined;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "Layered tower defense — place elemental bastions, exploit strengths and weaknesses, survive the siege.",
      },
      ...(ogImage
        ? [
            { property: "og:image", content: ogImage },
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
          ]
        : []),
      ...(xBanner ? [{ property: "x:game:image", content: xBanner }] : []),
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  component: () => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="overflow-hidden">
        <CreatedWithGrokBanner />
        <Outlet />
        <Scripts />
      </body>
    </html>
  ),
});
