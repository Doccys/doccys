import type { Documentary } from "@/lib/types";
import DocumentaryCard from "@/components/documentary/DocumentaryCard";

export default function DocumentaryGrid({ documentaries }: { documentaries: Documentary[] }) {
  return (
    <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
      {documentaries.map((doc) => (
        <DocumentaryCard key={doc.id} documentary={doc} />
      ))}
    </div>
  );
}