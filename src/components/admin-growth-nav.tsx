import Link from "next/link";
import { Activity, BarChart3, CircleDollarSign, Gauge, UsersRound, Trophy } from "lucide-react";

const items = [
  { href: "/admin", label: "Overview", icon: Gauge },
  { href: "/admin/growth", label: "Growth", icon: BarChart3 },
  { href: "/admin/users", label: "Users", icon: UsersRound },
  { href: "/admin/product", label: "Product", icon: Activity },
  { href: "/admin/revenue", label: "Revenue", icon: CircleDollarSign },
  { href: "/admin/outcomes", label: "Outcomes", icon: Trophy },
];

export function AdminGrowthNav({ active }: { active: string }) {
  return <nav aria-label="Aree amministrative" style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
    {items.map((item) => {
      const Icon = item.icon;
      const selected = active === item.href;
      return <Link key={item.href} href={item.href} className="adm-btn" style={{ background: selected ? "hsl(var(--primary) / .14)" : undefined, borderColor: selected ? "hsl(var(--primary) / .38)" : undefined, color: selected ? "hsl(var(--primary))" : undefined }}><Icon size={13} />{item.label}</Link>;
    })}
  </nav>;
}
