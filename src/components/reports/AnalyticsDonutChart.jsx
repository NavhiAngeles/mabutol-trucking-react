import { Cell, Pie, PieChart } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { cn } from 'cn';

/**
 * Recharts Donut Chart with centered KPI readout and accessible text+count legend.
 */
export default function AnalyticsDonutChart({
  data = [],
  config = {},
  centerValue,
  centerLabel,
  ariaLabel,
  className,
  showLegend = true,
  legendColumns = 2,
}) {
  const activeSlices = data.filter((d) => d.value > 0);
  const chartData = activeSlices.length
    ? activeSlices
    : [{ key: 'empty', label: 'No data', value: 1, color: '#E2E8F0', isEmpty: true }];

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="relative mx-auto h-[180px] w-[180px]">
        <ChartContainer
          config={config}
          className="aspect-square h-full w-full"
          role="img"
          aria-label={ariaLabel}
        >
          <PieChart>
            {activeSlices.length > 0 && (
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    hideLabel
                    nameKey="key"
                  />
                }
              />
            )}
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="key"
              innerRadius="66%"
              outerRadius="90%"
              paddingAngle={activeSlices.length > 1 ? 2 : 0}
              stroke="none"
              isAnimationActive={false}
            >
              {chartData.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
            {centerValue}
          </span>
          {centerLabel && (
            <span className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
              {centerLabel}
            </span>
          )}
        </div>
      </div>

      {showLegend && (
        <ul
          className={cn(
            'm-0 grid list-none gap-x-4 gap-y-2 border-t border-slate-100 p-0 pt-3 text-xs text-slate-700',
            legendColumns === 1 ? 'grid-cols-1' : 'grid-cols-2'
          )}
        >
          {data.map((item) => (
            <li key={item.key} className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="size-2.5 shrink-0 rounded-xs"
                  style={{ backgroundColor: item.color }}
                  aria-hidden="true"
                />
                <span className="truncate text-slate-600">{item.label}</span>
              </span>
              <span className="font-semibold text-slate-900 tabular-nums">
                {item.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
