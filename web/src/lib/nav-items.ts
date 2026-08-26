import {
  BarChart3,
  BriefcaseBusiness,
  CalendarClock,
  Compass,
  FolderOpen,
  Layers3,
  LayoutDashboard,
  MessagesSquare,
  Radar,
  SearchCheck,
  Settings,
  UsersRound,
} from "lucide-react";
import type { ComponentType, SVGProps } from "react";

// Single source of truth for the app's primary destinations — shared by the
// desktop sidebar and the mobile nav so they can never drift.
export type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  section: "Workspace" | "Workflow" | "Organize" | "Insights";
  chip?: string;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: LayoutDashboard, section: "Workspace" },
  { href: "/pipeline", label: "Jobs", icon: BriefcaseBusiness, section: "Workspace" },
  { href: "/explore", label: "Discover", icon: Compass, section: "Workflow", chip: "New" },
  { href: "/jobs", label: "Batch", icon: Layers3, section: "Workflow" },
  { href: "/portals", label: "Sources", icon: Radar, section: "Workflow" },
  { href: "/searches", label: "Searches & alerts", icon: SearchCheck, section: "Organize" },
  { href: "/followups", label: "Planner", icon: CalendarClock, section: "Organize" },
  { href: "/contacts", label: "Contacts", icon: UsersRound, section: "Organize" },
  { href: "/interviews", label: "Interview prep", icon: MessagesSquare, section: "Organize" },
  { href: "/library", label: "Library", icon: FolderOpen, section: "Organize" },
  { href: "/analytics", label: "Analytics", icon: BarChart3, section: "Insights" },
  { href: "/config", label: "Settings", icon: Settings, section: "Insights" },
];

export function isActivePath(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
