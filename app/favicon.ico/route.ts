export function GET(request: Request) {
  return new Response(null, {
    status: 308,
    headers: {
      "cache-control": "public, max-age=86400",
      location: new URL("/favicon.svg", request.url).toString(),
    },
  });
}
