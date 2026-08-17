import WebcamGrid from "@/components/webcams/WebcamGrid";
import { webcams } from "@/data/webcams";

export default function WebcamsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <header>
        <h1 className="text-2xl font-bold">Webcams</h1>
        <p className="text-sm text-gray-500">See what&apos;s actually happening, not just the forecast. Live images refresh every minute.</p>
      </header>
      <WebcamGrid webcams={webcams} />
    </div>
  );
}
