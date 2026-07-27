import TrackingClient from "./TrackingClient";

export default async function TrackingPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  return <TrackingClient orderId={orderId} />;
}
