"use client";
import { use } from "react";
import Slideshow from "@/components/Slideshow";
import { useEvent } from "@/lib/useEvent";

/** Live slideshow of signed portraits for a TV or second screen at the lounge. */
export default function WallPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const { event, photos, status } = useEvent(slug);
  if (status === "missing") return <div className="empty"><h3>No event at this link</h3></div>;
  return <Slideshow photos={photos} title={event?.title} />;
}
