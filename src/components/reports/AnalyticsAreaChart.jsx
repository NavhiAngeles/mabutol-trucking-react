import { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { formatShortAxisDate } from '@/lib/reportFormatters';
import { cn } from 'cn';

/**
 * Smooth monotone Recharts AreaChart with subtle SVG linear gradients,
 * dashed horizontal gridlines, horizontal X-axis ticks, and en-PH tooltips.
 */
export default function AnalyticsAreaChart({
  data = [],
  xKey = 'date',
  series = [],
  config = {},
  yAxisFormatter,
  yAxisWidth = 52,
  yDomain,
  allowDecimals = true,
  connectNulls = false,
  showDots = false,
  showLegend = false,
  tooltipFormatter,
  labelFormatter = formatShortAxisDate,
  className,
  ariaLabel,
}) {
  const uid = useId().replace(/:/g, '');

  return (
    <ChartContainer
      config={config}
      className={cn('aspect-auto h-[250px] w-full', className)}
      role="img"
      aria-label={ariaLabel}
    >
      <AreaChart
        data={data}
        margin={{ top: 10, right: 12, left: 0, bottom: 0 }}
      >
        <defs>
          {series.map((s) => {
            const fillId = `grad-${uid}-${s.key}`;
            return (
              <linearGradient key={fillId} id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={s.color} stopOpacity={0.18} />
                <stop offset="95%" stopColor={s.color} stopOpacity={0.0} />
              </linearGradient>
            );
          })}
        </defs>
        <CartesianGrid
          vertical={false}
          strokeDasharray="3 3"
          stroke="#E2E8F0"
        />
        <XAxis
          dataKey={xKey}
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={formatShortAxisDate}
          tick={{ fontSize: 11, fill: '#64748B' }}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={yAxisWidth}
          domain={yDomain}
          allowDecimals={allowDecimals}
          tickFormatter={yAxisFormatter}
          tick={{ fontSize: 11, fill: '#64748B' }}
        />
        <ChartTooltip
          cursor={{ stroke: '#CBD5E1', strokeDasharray: '3 3' }}
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={(value, payload) => {
                const raw = payload?.[0]?.payload?.[xKey] ?? value;
                return labelFormatter ? labelFormatter(raw) : raw;
              }}
              formatter={tooltipFormatter}
            />
          }
        />
        {showLegend && (
          <ChartLegend content={<ChartLegendContent />} />
        )}
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.key}
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.strokeDasharray}
            fill={`url(#grad-${uid}-${s.key})`}
            connectNulls={connectNulls}
            dot={showDots ? { r: 3, fill: s.color, stroke: '#FFFFFF', strokeWidth: 1.5 } : false}
            activeDot={{ r: 4, fill: s.color, stroke: '#FFFFFF', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}
