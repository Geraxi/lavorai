import {
  BarChart3,
  Briefcase,
  CalendarCheck,
  Compass,
  FileStack,
  FileText,
  Gauge,
  Inbox,
  Mail,
  LayoutDashboard,
  ListChecks,
  MessageSquareText,
  Newspaper,
  Rocket,
  Send,
  Settings,
  SlidersHorizontal,
  Users,
  Zap,
  Flag,
  Activity,
  Circle,
  type LucideIcon,
} from "lucide-react";

/**
 * One distinct, quiet line icon per app section (the old set reused
 * "inbox" and "sparkles" for unrelated pages).
 */
const NAV_ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/discover": Compass,
  "/applications": Briefcase,
  "/inbox": Inbox,
  "/posta": Mail,
  "/materiali": FileStack,
  "/questions": ListChecks,
  "/jobs": Newspaper,
  "/analytics": BarChart3,
  "/interview": CalendarCheck,
  "/founder-coach": Rocket,
  "/preferences": SlidersHorizontal,
  "/cv": FileText,
  "/settings": Settings,
  "/feedback": MessageSquareText,
  "/admin": Gauge,
  "/admin/users": Users,
  "/admin/reports": Flag,
  "/admin/product": Activity,
  "/admin/traffic": BarChart3,
  "/admin/delivery": Send,
  "/admin/jobs": Briefcase,
  "/admin/automation": Zap,
};

export function navIcon(href: string): LucideIcon {
  return NAV_ICONS[href] ?? Circle;
}
