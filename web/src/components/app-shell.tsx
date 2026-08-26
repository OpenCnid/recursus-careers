"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Radar } from "lucide-react";
import { cn } from "@/lib/cn";
import { CoMark } from "@/components/co-mark";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { JobsProvider } from "@/components/jobs/job-store";
import { PipelineProvider } from "@/components/pipeline/pipeline-provider";
import { ApplyProvider } from "@/components/apply/apply-provider";
import { ExploreProvider } from "@/components/explore/explore-provider";
import { FirstScoreView } from "@/components/explore/first-score-view";
import { BetaBanner } from "@/components/beta/beta-banner";
import { NAV_ITEMS, isActivePath } from "@/lib/nav-items";

const NAV_SECTIONS = ["Workspace", "Workflow", "Organize", "Insights"] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <JobsProvider>
      <PipelineProvider>
      <ApplyProvider>
      <ExploreProvider>
      <MobileNav />
      <div className="min-h-screen bg-background">
        <header className="sticky top-0 z-40 hidden h-16 items-center justify-between border-b border-border bg-background/95 px-5 backdrop-blur md:flex">
          <Link href="/" className="flex items-center gap-3" aria-label="Recursus Careers overview">
            <CoMark size={34} />
            <span>
              <strong className="block text-sm font-semibold text-foreground">Recursus Careers</strong>
              <span className="block text-[11px] text-faint">Your jobs, from discovery to outcome</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle className="mr-1" />
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition hover:border-brand/45 hover:bg-surface-hover"
            >
              <Radar className="size-4 text-brand" /> Scan portals
            </Link>
            <Link
              href="/pipeline"
              className="inline-flex items-center gap-2 rounded-lg border border-brand-secondary/60 bg-brand-secondary/20 px-3 py-2 text-sm font-medium text-foreground transition hover:bg-brand-secondary/30"
            >
              <Plus className="size-4 text-brand-secondary" /> Add job
            </Link>
          </div>
        </header>

        <div className="flex min-h-[calc(100vh-4rem)]">
          <aside className="sticky top-16 hidden h-[calc(100vh-4rem)] w-52 shrink-0 flex-col overflow-y-auto border-r border-border bg-surface/35 px-3 py-5 md:flex">
            <nav className="flex flex-col">
              {NAV_SECTIONS.map((section) => (
                <div key={section} className="mb-3">
                  <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">{section}</p>
                  <div className="flex flex-col gap-1">
                    {NAV_ITEMS.filter((item) => item.section === section).map(({ href, label, icon: Icon, chip }) => {
                      const active = isActivePath(href, pathname);
                      return (
                        <Link
                          key={href}
                          href={href}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                            active
                              ? "bg-brand-soft text-brand-text"
                              : "text-muted hover:bg-surface-hover hover:text-foreground",
                          )}
                        >
                          <Icon className="size-4" />
                          {label}
                          {chip && (
                            <span className="ml-auto rounded-full border border-brand-secondary/40 bg-brand-secondary/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-secondary">
                              {chip}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </nav>

            <div className="mt-auto border-t border-border pt-4">
              <div className="px-2 text-xs text-faint">
                <span className="block font-medium text-muted">Tracker connected</span>
                <span>local-first · source of truth intact</span>
              </div>
            </div>
          </aside>
          <main className="min-w-0 flex-1 overflow-x-hidden">{children}</main>
          <FirstScoreView />
          <BetaBanner />
        </div>
      </div>
      </ExploreProvider>
      </ApplyProvider>
      </PipelineProvider>
    </JobsProvider>
  );
}
