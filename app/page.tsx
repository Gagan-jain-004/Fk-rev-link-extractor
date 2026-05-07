import { ReviewBrowser } from '@/components/review-browser';

export default function Page() {
  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(14,165,233,0.12),transparent_34%),radial-gradient(circle_at_18%_24%,rgba(245,158,11,0.1),transparent_24%),radial-gradient(circle_at_82%_18%,rgba(16,185,129,0.12),transparent_26%)]" />
      <div className="absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.46),transparent)] dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.3),transparent)]" />
      <ReviewBrowser />
    </main>
  );
}
