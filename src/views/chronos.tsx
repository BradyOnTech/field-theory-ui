import { Fragment, useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { fetchMonthlyBreakdown, fetchStats } from "@/lib/api";
import type {
  MonthlyBreakdownEntry,
  Stats,
} from "@/lib/types";
import { formatNumber, truncateText } from "@/lib/utils";
import { formatTweetText, decodeEntities } from "@/lib/tweet-text";
import { SimplePagination } from "@/components/simple-pagination";
import { ErrorRetry } from "@/components/error-retry";

// Distinct colors for stacked area domains
const DOMAIN_COLORS: Record<string, string> = {
  ai: "#22c55e",
  web: "#22d3ee",
  devops: "#eab308",
  security: "#ef4444",
  data: "#6bc5e8",
  mobile: "#f97316",
  cloud: "#8bcaef",
  gaming: "#a855f7",
  finance: "#84cc16",
  education: "#ec4899",
};

const DEFAULT_COLORS = [
  "#22c55e", "#22d3ee", "#eab308", "#ef4444", "#6bc5e8",
  "#f97316", "#8bcaef", "#a855f7", "#84cc16", "#ec4899",
  "#c4a35a", "#5ac4c4", "#c45a8b", "#8bc45a", "#5a8bc4",
];

function getDomainColor(domain: string, index: number): string {
  if (domain === "Other") return "#3f3f46";
  return DOMAIN_COLORS[domain] || DEFAULT_COLORS[index % DEFAULT_COLORS.length] || "#22c55e";
}

function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split("-");
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const idx = parseInt(monthNum!, 10) - 1;
  return `${monthNames[idx]} ${year}`;
}

function formatMonthShort(month: string): string {
  const [year, monthNum] = month.split("-");
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const idx = parseInt(monthNum!, 10) - 1;
  return `${monthNames[idx]} '${year!.slice(2)}`;
}

interface DriftEvent {
  month: string;
  domain: string;
  type: "new_domain" | "domain_drop";
  share: number;
  description: string;
}

function detectInterestDrift(data: MonthlyBreakdownEntry[]): DriftEvent[] {
  const drifts: DriftEvent[] = [];
  const seenDomains = new Set<string>();

  for (let i = 0; i < data.length; i++) {
    const entry = data[i]!;
    const totalForMonth = entry.count;
    if (totalForMonth === 0) continue;

    for (const d of entry.domains) {
      const share = d.count / totalForMonth;

      // New domain appearing with >5% share
      if (!seenDomains.has(d.domain) && share > 0.05) {
        drifts.push({
          month: entry.month,
          domain: d.domain,
          type: "new_domain",
          share,
          description: `${d.domain} first appears with ${Math.round(share * 100)}% share`,
        });
      }
    }

    // Check for domain drops: domains that were >10% in previous month and dropped below 3%
    if (i > 0) {
      const prevEntry = data[i - 1]!;
      const prevTotal = prevEntry.count;
      if (prevTotal > 0) {
        for (const prevDomain of prevEntry.domains) {
          const prevShare = prevDomain.count / prevTotal;
          if (prevShare > 0.1) {
            const currentDomain = entry.domains.find((d) => d.domain === prevDomain.domain);
            const currentShare = currentDomain ? currentDomain.count / totalForMonth : 0;
            if (currentShare < 0.03) {
              drifts.push({
                month: entry.month,
                domain: prevDomain.domain,
                type: "domain_drop",
                share: currentShare,
                description: `${prevDomain.domain} dropped from ${Math.round(prevShare * 100)}% to ${Math.round(currentShare * 100)}%`,
              });
            }
          }
        }
      }
    }

    // Mark all domains as seen
    for (const d of entry.domains) {
      seenDomains.add(d.domain);
    }
  }

  return drifts;
}

interface ChartDataPoint {
  month: string;
  monthLabel: string;
  total: number;
  [domain: string]: string | number;
}



interface CategoryShift {
  category: string;
  change: number;
  direction: "grew" | "shrank";
}

function computeCategoryShift(
  current: MonthlyBreakdownEntry,
  previous: MonthlyBreakdownEntry | undefined,
): CategoryShift[] {
  if (!previous) return [];

  const prevMap = new Map(previous.categories.map((c) => [c.category, c.count]));
  const shifts: CategoryShift[] = [];

  for (const cat of current.categories) {
    const prevCount = prevMap.get(cat.category) || 0;
    const change = cat.count - prevCount;
    if (change !== 0) {
      shifts.push({
        category: cat.category,
        change: Math.abs(change),
        direction: change > 0 ? "grew" : "shrank",
      });
    }
  }

  // Also check categories that existed in previous but not in current
  for (const [category, prevCount] of prevMap) {
    if (!current.categories.find((c) => c.category === category) && prevCount > 0) {
      shifts.push({
        category,
        change: prevCount,
        direction: "shrank",
      });
    }
  }

  return shifts.sort((a, b) => b.change - a.change).slice(0, 5);
}

interface CustomTooltipProps {
  active?: boolean;
  label?: string;
  payload?: Array<{ name: string; value: number; color: string }>;
  monthlyData: MonthlyBreakdownEntry[];
}

function ChronosTooltip({ active, label, payload, monthlyData }: CustomTooltipProps) {
  if (!active || !label || !payload) return null;

  const monthEntry = monthlyData.find((m) => m.month === label);
  if (!monthEntry) return null;

  const prevIndex = monthlyData.findIndex((m) => m.month === label) - 1;
  const prevEntry = prevIndex >= 0 ? monthlyData[prevIndex] : undefined;
  const categoryShifts = computeCategoryShift(monthEntry, prevEntry);

  return (
    <div className="max-w-xs rounded-card border border-border bg-card px-4 py-3 shadow-lg">
      <p className="mb-2 font-semibold text-foreground">
        {formatMonthLabel(label)} — {formatNumber(monthEntry.count)} bookmarks
      </p>

      {/* Domain breakdown from payload */}
      <div className="mb-2">
        {payload
          .filter((p) => p.value > 0)
          .sort((a, b) => b.value - a.value)
          .slice(0, 5)
          .map((p) => (
            <div key={p.name} className="flex items-center gap-2 text-xs">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: p.color }}
              />
              <span className="text-muted">{p.name}</span>
              <span className="font-mono text-foreground">{p.value}</span>
            </div>
          ))}
      </div>

      {/* Top bookmarks */}
      {monthEntry.notableBookmarks.length > 0 && (
        <div className="mb-2 border-t border-border pt-2">
          <p className="mb-1 text-xs font-semibold text-muted">Top bookmarks:</p>
          {monthEntry.notableBookmarks.slice(0, 2).map((b) => (
            <p key={b.id} className="text-xs text-foreground">
              {truncateText(decodeEntities(b.text), 60)}
            </p>
          ))}
        </div>
      )}

      {/* New authors */}
      {monthEntry.newAuthors.length > 0 && (
        <div className="mb-2 border-t border-border pt-2">
          <p className="mb-1 text-xs font-semibold text-muted">
            New authors: {monthEntry.newAuthors.length}
          </p>
          <p className="text-xs text-foreground">
            {monthEntry.newAuthors.slice(0, 3).join(", ")}
            {monthEntry.newAuthors.length > 3 && "…"}
          </p>
        </div>
      )}

      {/* Category shift */}
      {categoryShifts.length > 0 && (
        <div className="border-t border-border pt-2">
          <p className="mb-1 text-xs font-semibold text-muted">Category shift:</p>
          {categoryShifts.slice(0, 3).map((s) => (
            <div key={s.category} className="flex items-center gap-1 text-xs">
              <span className={s.direction === "grew" ? "text-success" : "text-error"}>
                {s.direction === "grew" ? "↑" : "↓"}
              </span>
              <span className="text-foreground">{s.category}</span>
              <span className="text-muted">
                ({s.direction === "grew" ? "+" : "-"}{s.change})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

type SortColumn = "month" | "count" | "domain" | "category" | "author";
type SortDir = "asc" | "desc";

function getTopValue(arr: { count: number }[], key: string): string {
  const first = arr[0] as Record<string, unknown> | undefined;
  return first ? String(first[key] ?? "") : "";
}

function matchesSearch(entry: MonthlyBreakdownEntry, q: string): boolean {
  const lower = q.toLowerCase();
  if (formatMonthLabel(entry.month).toLowerCase().includes(lower)) return true;
  if (entry.domains.some((d) => d.domain.toLowerCase().includes(lower))) return true;
  if (entry.categories.some((c) => c.category.toLowerCase().includes(lower))) return true;
  if (entry.topAuthors.some((a) => a.author_handle.toLowerCase().includes(lower))) return true;
  if (entry.notableBookmarks.some((b) => b.text.toLowerCase().includes(lower))) return true;
  return false;
}

function sortEntries(data: MonthlyBreakdownEntry[], col: SortColumn, dir: SortDir): MonthlyBreakdownEntry[] {
  const sorted = [...data].sort((a, b) => {
    let cmp = 0;
    switch (col) {
      case "month": cmp = a.month.localeCompare(b.month); break;
      case "count": cmp = a.count - b.count; break;
      case "domain": cmp = getTopValue(a.domains, "domain").localeCompare(getTopValue(b.domains, "domain")); break;
      case "category": cmp = getTopValue(a.categories, "category").localeCompare(getTopValue(b.categories, "category")); break;
      case "author": cmp = getTopValue(a.topAuthors, "author_handle").localeCompare(getTopValue(b.topAuthors, "author_handle")); break;
    }
    return dir === "asc" ? cmp : -cmp;
  });
  return sorted;
}

function ExpandedRowDetail({
  entry,
  driftEvents,
  onNavigate,
}: {
  entry: MonthlyBreakdownEntry;
  driftEvents: DriftEvent[];
  onNavigate: (path: string) => void;
}) {
  const monthDrifts = driftEvents.filter((d) => d.month === entry.month);

  return (
    <td colSpan={6} className="border-t border-border bg-card/50 px-6 py-4">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div>
          <p className="mb-2 text-xs font-semibold text-muted">Categories</p>
          <div className="flex flex-wrap gap-1.5">
            {entry.categories.map((cat) => (
              <button
                key={cat.category}
                type="button"
                onClick={(e) => { e.stopPropagation(); onNavigate(`/stream?category=${encodeURIComponent(cat.category)}`); }}
                className="cursor-pointer rounded-badge bg-surface px-2 py-0.5 text-xs text-muted transition-colors hover:bg-surface/80 hover:text-foreground"
              >
                {cat.category} ({cat.count})
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-muted">Authors</p>
          <div className="flex flex-wrap gap-1.5">
            {entry.topAuthors.map((a) => (
              <button
                key={a.author_handle}
                type="button"
                onClick={(e) => { e.stopPropagation(); onNavigate(`/stream?author=${encodeURIComponent(a.author_handle)}`); }}
                className="cursor-pointer rounded-badge border border-border px-2 py-0.5 text-xs text-muted transition-colors hover:border-foreground/30 hover:text-foreground"
              >
                @{a.author_handle} ({a.count})
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-2 text-xs font-semibold text-muted">Domains</p>
          <div className="flex flex-wrap gap-1.5">
            {entry.domains.map((d) => (
              <button
                key={d.domain}
                type="button"
                onClick={(e) => { e.stopPropagation(); onNavigate(`/stream?domain=${encodeURIComponent(d.domain)}`); }}
                className="cursor-pointer rounded-badge bg-surface px-2 py-0.5 text-xs text-muted transition-colors hover:bg-surface/80 hover:text-foreground"
              >
                {d.domain} ({d.count})
              </button>
            ))}
          </div>
        </div>
      </div>

      {monthDrifts.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {monthDrifts.map((drift, i) => (
            <span
              key={i}
              data-testid="drift-annotation"
              className={`rounded-badge px-2 py-1 text-xs font-medium ${
                drift.type === "new_domain" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
              }`}
            >
              {drift.description}
            </span>
          ))}
        </div>
      )}

      {entry.notableBookmarks.length > 0 && (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-2 text-xs font-semibold text-muted">Notable Bookmarks</p>
          <div className="flex flex-col gap-2">
            {entry.notableBookmarks.map((b) => (
              <p key={b.id} className="text-xs leading-relaxed text-foreground">
                {formatTweetText(b.text, { maxLength: 200 })}
                <span className="ml-1 text-disabled">-- @{b.author_handle}</span>
              </p>
            ))}
          </div>
        </div>
      )}
    </td>
  );
}

export function ChronosView() {
  const navigate = useNavigate();
  const [monthlyData, setMonthlyData] = useState<MonthlyBreakdownEntry[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortColumn, setSortColumn] = useState<SortColumn>("month");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [expandedMonth, setExpandedMonth] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [breakdown, statsData] = await Promise.all([
        fetchMonthlyBreakdown(),
        fetchStats(),
      ]);

      setMonthlyData(breakdown);
      if (statsData) setStats(statsData);
      setError(null);
    } catch {
      setError("Failed to load data. Is the server running?");
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Filter by date range
  const filteredData = useMemo(() => {
    let data = monthlyData;
    if (dateFrom) {
      data = data.filter((m) => m.month >= dateFrom);
    }
    if (dateTo) {
      data = data.filter((m) => m.month <= dateTo);
    }
    return data;
  }, [monthlyData, dateFrom, dateTo]);

  // Number of top domains to show individually (rest grouped as "Other")
  const TOP_N_DOMAINS = 12;

  // Extract all unique domains across all filtered months, sorted by total count
  // Domains beyond top N are grouped into "Other" so the chart represents 100% of bookmarks
  const { allDomains, hasOther } = useMemo(() => {
    const domainTotals = new Map<string, number>();
    for (const entry of filteredData) {
      for (const d of entry.domains) {
        domainTotals.set(d.domain, (domainTotals.get(d.domain) || 0) + d.count);
      }
    }
    const sorted = Array.from(domainTotals.entries()).sort((a, b) => b[1] - a[1]);
    const topDomains = sorted.slice(0, TOP_N_DOMAINS).map(([domain]) => domain);
    const otherExists = sorted.length > TOP_N_DOMAINS;
    return {
      allDomains: otherExists ? [...topDomains, "Other"] : topDomains,
      hasOther: otherExists,
    };
  }, [filteredData]);

  // Build chart data, including "Other" aggregation if needed
  const chartData = useMemo(() => {
    const topDomains = hasOther ? allDomains.slice(0, -1) : allDomains;
    const topDomainSet = new Set(topDomains);

    return filteredData.map((entry) => {
      const point: ChartDataPoint = {
        month: entry.month,
        monthLabel: formatMonthShort(entry.month),
        total: entry.count,
      };
      let otherCount = 0;
      for (const d of entry.domains) {
        if (topDomainSet.has(d.domain)) {
          point[d.domain] = d.count;
        } else {
          otherCount += d.count;
        }
      }
      // Ensure all top domains have a value (0 if missing)
      for (const domain of topDomains) {
        if (!(domain in point)) {
          point[domain] = 0;
        }
      }
      if (hasOther) {
        point["Other"] = otherCount;
      }
      return point;
    });
  }, [filteredData, allDomains, hasOther]);

  // Detect interest drift from the FULL unfiltered dataset,
  // then filter to show only drift points within the selected date range
  const driftEvents = useMemo(() => {
    const allDrifts = detectInterestDrift(monthlyData);
    // Filter to show only drifts within the selected date range
    return allDrifts.filter((drift) => {
      if (dateFrom && drift.month < dateFrom) return false;
      if (dateTo && drift.month > dateTo) return false;
      return true;
    });
  }, [monthlyData, dateFrom, dateTo]);

  // Total bookmarks in filtered data
  const filteredTotal = useMemo(
    () => filteredData.reduce((sum, m) => sum + m.count, 0),
    [filteredData],
  );

  // Table: search -> sort -> paginate
  const tableFiltered = useMemo(() => {
    if (!searchQuery.trim()) return filteredData;
    return filteredData.filter((e) => matchesSearch(e, searchQuery.trim()));
  }, [filteredData, searchQuery]);

  const tableSorted = useMemo(
    () => sortEntries(tableFiltered, sortColumn, sortDir),
    [tableFiltered, sortColumn, sortDir],
  );

  const totalPages = Math.max(1, Math.ceil(tableSorted.length / perPage));
  const tablePage = useMemo(
    () => tableSorted.slice(page * perPage, (page + 1) * perPage),
    [tableSorted, page, perPage],
  );

  const toggleSort = useCallback((col: SortColumn) => {
    if (sortColumn === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDir("desc");
    }
    setPage(0);
  }, [sortColumn]);

  // Date range bounds
  const minMonth = monthlyData.length > 0 ? monthlyData[0]!.month : "";
  const maxMonth = monthlyData.length > 0 ? monthlyData[monthlyData.length - 1]!.month : "";

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Chronos</h1>
        <p className="mt-1 text-sm text-muted">
          Time machine — interest evolution over time
        </p>
      </div>

      {/* Error State */}
      {error && (
        <ErrorRetry message={error} onRetry={() => { setError(null); void loadData(); }} />
      )}

      {/* Date Range Selector */}
      <div className="mb-6 flex flex-wrap items-end gap-4 rounded-card border border-border bg-card p-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="date-from" className="text-xs font-medium text-muted">
            From
          </label>
          <input
            id="date-from"
            type="month"
            value={dateFrom}
            min={minMonth}
            max={dateTo || maxMonth}
            onChange={(e) => setDateFrom(e.target.value)}
            className="min-h-[44px] rounded-button border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-zinc-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="date-to" className="text-xs font-medium text-muted">
            To
          </label>
          <input
            id="date-to"
            type="month"
            value={dateTo}
            min={dateFrom || minMonth}
            max={maxMonth}
            onChange={(e) => setDateTo(e.target.value)}
            className="min-h-[44px] rounded-button border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-zinc-500 focus:outline-none"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
            }}
            className="min-h-[44px] rounded-button border border-border px-3 py-2 text-sm text-muted hover:text-foreground transition-colors"
          >
            Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-muted">
            Showing: <span className="font-mono text-foreground">{formatNumber(filteredTotal)}</span> bookmarks
          </span>
          {stats && (
            <span className="text-xs text-disabled">
              (Total: {formatNumber(stats.totalBookmarks)})
            </span>
          )}
        </div>
      </div>

      {/* Stacked Area Chart */}
      <div className="mb-8 rounded-card border border-border bg-card p-5">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Domain Distribution Over Time
        </h2>
        <div className="h-80">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  {allDomains.map((domain, i) => (
                    <linearGradient
                      key={domain}
                      id={`gradient-${domain}`}
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="5%"
                        stopColor={getDomainColor(domain, i)}
                        stopOpacity={0.6}
                      />
                      <stop
                        offset="95%"
                        stopColor={getDomainColor(domain, i)}
                        stopOpacity={0.1}
                      />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1c1c1e" />
                <XAxis
                  dataKey="month"
                  tick={{ fill: "#71717a", fontSize: 14 }}
                  tickLine={false}
                  axisLine={{ stroke: "#1c1c1e" }}
                  tickFormatter={formatMonthShort}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fill: "#71717a", fontSize: 14 }}
                  tickLine={false}
                  axisLine={{ stroke: "#1c1c1e" }}
                  width={50}
                  label={{
                    value: "Bookmarks",
                    angle: -90,
                    position: "insideLeft",
                    style: { fill: "#3f3f46", fontSize: 14 },
                  }}
                />
                <Tooltip
                  content={
                    <ChronosTooltip monthlyData={filteredData} />
                  }
                />
                {allDomains.map((domain, i) => (
                  <Area
                    key={domain}
                    type="monotone"
                    dataKey={domain}
                    stackId="1"
                    stroke={getDomainColor(domain, i)}
                    fill={`url(#gradient-${domain})`}
                    strokeWidth={1.5}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="text-sm text-disabled">Loading chart data…</span>
            </div>
          )}
        </div>

        {/* Legend */}
        {allDomains.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-3">
            {allDomains.map((domain, i) => (
              <div key={domain} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-sm"
                  style={{ backgroundColor: getDomainColor(domain, i) }}
                />
                <span className="text-xs text-muted">{domain}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Interest Drift Detection */}
      {driftEvents.length > 0 && (
        <div className="mb-8 rounded-card border border-border bg-card p-5">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Interest Drift
          </h2>
          <div className="flex flex-col gap-2">
            {driftEvents.map((drift, i) => (
              <div
                key={i}
                data-testid="drift-annotation"
                className={`flex items-center gap-3 rounded-badge px-3 py-2 ${
                  drift.type === "new_domain"
                    ? "bg-success/10 border border-success/30"
                    : "bg-warning/10 border border-warning/30"
                }`}
              >
                <span className="text-lg">
                  {drift.type === "new_domain" ? "🆕" : "📉"}
                </span>
                <div>
                  <span className="text-sm font-medium text-foreground">
                    {formatMonthLabel(drift.month)}
                  </span>
                  <span className="ml-2 text-sm text-muted">
                    {drift.description}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monthly Breakdown Table */}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Monthly Breakdown</h2>
          <p className="text-sm text-muted">
            {tableFiltered.length} months{searchQuery ? ` matching "${searchQuery}"` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(0); }}
            placeholder="Search months..."
            className="h-10 w-56 rounded-button border border-border bg-background px-3 text-sm text-foreground placeholder:text-disabled focus:border-[#333] focus:outline-none"
          />
          <select
            value={perPage}
            onChange={(e) => { setPerPage(Number(e.target.value)); setPage(0); }}
            className="h-10 rounded-button border border-border bg-background px-2 text-sm text-foreground focus:outline-none"
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-card border border-border">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-border bg-card">
              {([
                ["month", "Month"],
                ["count", "Count"],
                ["domain", "Top Domain"],
                ["category", "Top Category"],
                ["author", "Top Author"],
              ] as [SortColumn, string][]).map(([col, label]) => (
                <th
                  key={col}
                  onClick={() => toggleSort(col)}
                  className="cursor-pointer px-4 py-3 text-left text-xs font-semibold text-muted transition-colors hover:text-foreground select-none"
                >
                  {label}
                  {sortColumn === col && (
                    <span className="ml-1 text-foreground">{sortDir === "asc" ? "↑" : "↓"}</span>
                  )}
                </th>
              ))}
              <th className="w-10 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {tablePage.map((entry) => {
              const isExpanded = expandedMonth === entry.month;
              return (
                <Fragment key={entry.month}>
                  <tr
                    onClick={() => setExpandedMonth(isExpanded ? null : entry.month)}
                    className="cursor-pointer border-b border-border transition-colors hover:bg-surface"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{formatMonthLabel(entry.month)}</td>
                    <td className="px-4 py-3 font-mono text-foreground">{formatNumber(entry.count)}</td>
                    <td className="px-4 py-3 text-muted">{entry.domains[0]?.domain ?? "--"}</td>
                    <td className="px-4 py-3 text-muted">{entry.categories[0]?.category ?? "--"}</td>
                    <td className="px-4 py-3 text-muted">
                      {entry.topAuthors[0] ? `@${entry.topAuthors[0].author_handle}` : "--"}
                    </td>
                    <td className="px-4 py-3 text-center text-disabled">{isExpanded ? "−" : "+"}</td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <ExpandedRowDetail entry={entry} driftEvents={driftEvents} onNavigate={navigate} />
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {tablePage.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted">
                  {monthlyData.length === 0 ? "Loading monthly data..." : "No months match your search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Pagination */}
      <SimplePagination
        page={page + 1}
        totalPages={totalPages}
        onPageChange={(p) => setPage(p - 1)}
      />
    </div>
  );
}
