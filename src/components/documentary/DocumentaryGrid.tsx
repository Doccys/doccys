import type { Documentary } from "@/lib/types";
import DocumentaryCard from "@/components/documentary/DocumentaryCard";

export default function DocumentaryGrid({
  documentaries,
  progressBySlug,
}: {
  documentaries: Documentary[];
  /** slug → 0–1 for påbegyndte film ("Fortsæt se") — ellers intet resume */
  progressBySlug?: Record<string, number>;
}) {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
      {documentaries.map((doc) => (
        <DocumentaryCard
          key={doc.id}
          documentary={doc}
          progressRatio={progressBySlug?.[doc.slug]}
        />
      ))}
    </div>
  );
}