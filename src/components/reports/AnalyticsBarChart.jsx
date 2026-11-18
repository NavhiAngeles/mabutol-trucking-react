import {
  Bar,
  BarChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart';
import { formatShortAxisDate } from '@/lib/reportFormatters';
import { cn } from 'cn';

/**
 * Reusable Recharts BarChart supporting both vertical-bar time series
 * and horizontal-bar category comparisons.
 */
export default function AnalyticsBarChart({
  data = [],
  xKey = 'date',
  dataKey = 'value',
  color = '#0F2A52',
  config = {},
  layout = 'horizontal',
  xFormatter = formatShortAxisDate,
  valueFormatter,
  valueDomain,
  allowDecimals = true,
  yAxisWidth = 64,
  tooltipFormatter,
  labelFormatter,
  className,
  ariaLabel,
}) {
  const isVertical = layout === 'vertical';

  return (
    <ChartContainer
      config={config}
      className={cn('aspect-auto h-[250px] w-full', className)}
      role="img"
      aria-label={ariaLabel}
    >
      <BarChart
        data={data}
        layout={layout}
        margin={
          isVertical
            ? { top: 4, right: 20, left: 4, bottom: 0 }
            : { top: 10, right: 12, left: 0, bottom: 0 }
        }
      >
        <CartesianGrid
          horizontal={!isVertical}
          vertical={isVertical}
          strokeDasharray="3 3"
          stroke="#E2E8F0"
        />

        {isVertical ? (
          <>
            <XAxis
              type="number"
              domain={valueDomain}
              allowDecimals={allowDecimals}
              tickLine={false}
              axisLine={false}
              tickFormatter={valueFormatter}
              tick={{ fontSize: 11, fill: '#64748B' }}
            />
            <YAxis
              type="category"
              dataKey={xKey}
              tickLine={false}
              axisLine={false}
              width={yAxisWidth}
              tick={{ fontSize: 12, fill: '#475569' }}
            />
          </>
        ) : (
          <>
            <XAxis
              dataKey={xKey}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
              tickFormatter={xFormatter}
              tick={{ fontSize: 11, fill: '#64748B' }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={yAxisWidth}
              domain={valueDomain}
              allowDecimals={allowDecimals}
              tickFormatter={valueFormatter}
              tick={{ fontSize: 11, fill: '#64748B' }}
            />
          </>
        )}

        <ChartTooltip
          cursor={{ fill: '#F1F5F9' }}
          content={
            <ChartTooltipContent
              indicator="dot"
              labelFormatter={(value, payload) => {
                const raw = payload?.[0]?.payload?.[xKey] ?? value;
                if (labelFormatter) return labelFormatter(raw);
                return !isVertical && xFormatter ? xFormatter(raw) : raw;
              }}
              formatter={tooltipFormatter}
            />
          }
        />

        <Bar
          dataKey={dataKey}
          name={dataKey}
          fill={color}
          radius={isVertical ? [0, 4, 4, 0] : [4, 4, 0, 0]}
          maxBarSize={isVertical ? 22 : 28}
          isAnimationActive={false}
        />
      </BarChart>
    </ChartContainer>
  );
}
