# Recharts Usage Guide - HMD System

## Overview

The HMD System uses **Recharts 3.6.0** for all data visualization needs. Recharts is a composable charting library built on React components and D3, providing a declarative API for creating responsive, animated charts.

**Official Documentation:** https://recharts.org/

## Why Recharts?

### Advantages
- **React-native:** Built specifically for React
- **Composable:** Charts built from reusable components
- **Declarative:** JSX syntax for chart configuration
- **Responsive:** Automatic resizing with ResponsiveContainer
- **Customizable:** Full control over styling and behavior
- **Lightweight:** ~50KB gzipped
- **Type-safe:** TypeScript support

### Use Cases in HMD
- Deviation trend analysis (line charts)
- Performance comparisons (bar charts)
- Distribution breakdowns (pie charts)
- Capacity utilization (area charts)
- Multi-metric views (composed charts)

## Installation

Already included in project dependencies:

```json
{
  "dependencies": {
    "recharts": "^3.6.0"
  }
}
```

## Core Concepts

### Chart Structure

All Recharts charts follow this pattern:

```javascript
<ResponsiveContainer width="100%" height={400}>
  <ChartType data={data}>
    <CartesianGrid />
    <XAxis />
    <YAxis />
    <Tooltip />
    <Legend />
    <DataSeries />
  </ChartType>
</ResponsiveContainer>
```

### Responsive Container

**Always wrap charts in ResponsiveContainer** for automatic sizing:

```javascript
import { ResponsiveContainer } from 'recharts'

<ResponsiveContainer width="100%" height={400}>
  {/* Chart components */}
</ResponsiveContainer>
```

**Why:**
- Adapts to parent container size
- Handles window resize automatically
- Prevents fixed-size overflow issues

### Data Format

Recharts expects data as array of objects:

```javascript
const data = [
  { date: '2024-01-01', trips: 10, deviation: 5 },
  { date: '2024-01-02', trips: 12, deviation: 3 },
  { date: '2024-01-03', trips: 8, deviation: 7 },
]
```

**Requirements:**
- Each object represents one data point
- Keys become dataKey in chart components
- Values should be numbers (except category keys)

## Chart Types

### 1. Line Chart

**Use Case:** Trend analysis over time (deviation trends, trip volume)

**Basic Implementation:**
```javascript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const data = [
  { month: 'Jan', trips: 65, completed: 60 },
  { month: 'Feb', trips: 72, completed: 70 },
  { month: 'Mar', trips: 80, completed: 78 },
]

<ResponsiveContainer width="100%" height={300}>
  <LineChart data={data}>
    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.04)" />
    <XAxis dataKey="month" />
    <YAxis />
    <Tooltip />
    <Legend />
    <Line type="monotone" dataKey="trips" stroke="#3b82f6" strokeWidth={2} />
    <Line type="monotone" dataKey="completed" stroke="#10b981" strokeWidth={2} />
  </LineChart>
</ResponsiveContainer>
```

**Line Types:**
- `monotone` - Smooth curved line
- `linear` - Straight line between points
- `step` - Step function
- `stepBefore` / `stepAfter` - Step variations

**Styling Options:**
- `stroke` - Line color
- `strokeWidth` - Line thickness (default: 1)
- `strokeDasharray` - Dashed line pattern
- `dot` - Show/hide data point dots
- `activeDot` - Highlighted dot on hover

**With Data Points:**
```javascript
<Line
  type="monotone"
  dataKey="trips"
  stroke="#3b82f6"
  strokeWidth={2}
  dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
  activeDot={{ r: 6 }}
/>
```

### 2. Bar Chart

**Use Case:** Comparisons between categories (producer vs consumer, shift analysis)

**Basic Implementation:**
```javascript
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const data = [
  { producer: 'BF1', planned: 120, actual: 115 },
  { producer: 'BF2', planned: 100, actual: 105 },
  { producer: 'BF3', planned: 90, actual: 88 },
]

<ResponsiveContainer width="100%" height={300}>
  <BarChart data={data}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="producer" />
    <YAxis />
    <Tooltip />
    <Legend />
    <Bar dataKey="planned" fill="#3b82f6" />
    <Bar dataKey="actual" fill="#10b981" />
  </BarChart>
</ResponsiveContainer>
```

**Variations:**

**Stacked Bar Chart:**
```javascript
<Bar dataKey="planned" fill="#3b82f6" stackId="a" />
<Bar dataKey="actual" fill="#10b981" stackId="a" />
```

**Horizontal Bar Chart:**
```javascript
<BarChart data={data} layout="vertical">
  <XAxis type="number" />
  <YAxis type="category" dataKey="producer" />
  <Bar dataKey="value" fill="#3b82f6" />
</BarChart>
```

**With Custom Labels:**
```javascript
<Bar dataKey="trips" fill="#3b82f6">
  <LabelList dataKey="trips" position="top" />
</Bar>
```

### 3. Area Chart

**Use Case:** Cumulative metrics, capacity utilization

**Basic Implementation:**
```javascript
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const data = [
  { date: '01/01', capacity: 120, used: 100 },
  { date: '01/02', capacity: 120, used: 110 },
  { date: '01/03', capacity: 120, used: 105 },
]

<ResponsiveContainer width="100%" height={300}>
  <AreaChart data={data}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="date" />
    <YAxis />
    <Tooltip />
    <Area
      type="monotone"
      dataKey="used"
      stroke="#3b82f6"
      fill="#3b82f6"
      fillOpacity={0.3}
    />
  </AreaChart>
</ResponsiveContainer>
```

**Stacked Area Chart:**
```javascript
<Area type="monotone" dataKey="producer1" stackId="1" stroke="#3b82f6" fill="#3b82f6" />
<Area type="monotone" dataKey="producer2" stackId="1" stroke="#10b981" fill="#10b981" />
```

### 4. Pie Chart

**Use Case:** Distribution breakdown, percentage analysis

**Basic Implementation:**
```javascript
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const data = [
  { name: 'On-Time', value: 65 },
  { name: 'Warning', value: 20 },
  { name: 'Alert', value: 10 },
  { name: 'Critical', value: 5 },
]

const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#dc2626']

<ResponsiveContainer width="100%" height={300}>
  <PieChart>
    <Pie
      data={data}
      cx="50%"
      cy="50%"
      labelLine={false}
      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
      outerRadius={80}
      fill="#8884d8"
      dataKey="value"
    >
      {data.map((entry, index) => (
        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
      ))}
    </Pie>
    <Tooltip />
    <Legend />
  </PieChart>
</ResponsiveContainer>
```

**Donut Chart:**
```javascript
<Pie
  data={data}
  cx="50%"
  cy="50%"
  innerRadius={60}
  outerRadius={80}
  fill="#8884d8"
  dataKey="value"
>
  {/* Cells */}
</Pie>
```

### 5. Composed Chart

**Use Case:** Multiple chart types in one view (bars + lines)

**Basic Implementation:**
```javascript
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const data = [
  { month: 'Jan', trips: 65, avgDeviation: 12 },
  { month: 'Feb', trips: 72, avgDeviation: 8 },
  { month: 'Mar', trips: 80, avgDeviation: 10 },
]

<ResponsiveContainer width="100%" height={300}>
  <ComposedChart data={data}>
    <CartesianGrid strokeDasharray="3 3" />
    <XAxis dataKey="month" />
    <YAxis yAxisId="left" />
    <YAxis yAxisId="right" orientation="right" />
    <Tooltip />
    <Legend />
    <Bar yAxisId="left" dataKey="trips" fill="#3b82f6" />
    <Line yAxisId="right" type="monotone" dataKey="avgDeviation" stroke="#ef4444" strokeWidth={2} />
  </ComposedChart>
</ResponsiveContainer>
```

## Theme-Aware Charts

### Problem: Light/Dark Mode Support

Recharts doesn't automatically adapt to theme changes. You must explicitly style charts for each theme.

### Solution: useTheme Hook

```javascript
import { useTheme } from '../context/ThemeContext'

const MyChart = ({ data }) => {
  const { theme } = useTheme()
  const isDarkMode = theme === 'dark'

  const chartColors = {
    axisText: isDarkMode ? '#94a3b8' : '#64748b',
    gridStroke: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    tooltipBg: isDarkMode ? 'hsl(0 0% 8%)' : 'white',
    tooltipBorder: isDarkMode ? 'hsl(0 0% 16%)' : 'hsl(214 32% 91%)',
    tooltipText: isDarkMode ? 'hsl(0 0% 92%)' : 'hsl(215 25% 15%)',
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={data}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={chartColors.gridStroke}
        />
        <XAxis
          dataKey="date"
          stroke={chartColors.axisText}
          tick={{ fill: chartColors.axisText }}
        />
        <YAxis
          stroke={chartColors.axisText}
          tick={{ fill: chartColors.axisText }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: chartColors.tooltipBg,
            border: `1px solid ${chartColors.tooltipBorder}`,
            color: chartColors.tooltipText,
            borderRadius: '8px',
          }}
        />
        <Legend wrapperStyle={{ color: chartColors.axisText }} />
        <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} />
      </LineChart>
    </ResponsiveContainer>
  )
}
```

## Custom Tooltips

### Default Tooltip
```javascript
<Tooltip />
```

### Custom Tooltip Component
```javascript
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: 'white',
        padding: '12px',
        border: '1px solid #e2e8f0',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
      }}>
        <p style={{ fontWeight: 600, marginBottom: '8px' }}>{label}</p>
        {payload.map((entry, index) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    )
  }
  return null
}

<Tooltip content={<CustomTooltip />} />
```

### Formatted Tooltip
```javascript
<Tooltip
  formatter={(value, name) => [`${value} trips`, name]}
  labelFormatter={(label) => `Date: ${label}`}
/>
```

## Custom Legends

### Position Control
```javascript
<Legend
  verticalAlign="top"
  height={36}
  align="center"
/>
```

### Custom Legend Component
```javascript
const CustomLegend = ({ payload }) => {
  return (
    <ul style={{ display: 'flex', gap: '16px', listStyle: 'none', padding: 0 }}>
      {payload.map((entry, index) => (
        <li key={index} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '16px',
            height: '16px',
            backgroundColor: entry.color,
            borderRadius: '4px'
          }} />
          <span>{entry.value}</span>
        </li>
      ))}
    </ul>
  )
}

<Legend content={<CustomLegend />} />
```

## Axis Formatting

### Number Formatting
```javascript
<YAxis
  tickFormatter={(value) => `${value.toFixed(0)} trips`}
/>
```

### Date Formatting
```javascript
import { format } from 'date-fns'

<XAxis
  dataKey="date"
  tickFormatter={(date) => format(new Date(date), 'MMM dd')}
/>
```

### Custom Tick Component
```javascript
const CustomTick = ({ x, y, payload }) => {
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={16} textAnchor="middle" fill="#666">
        {payload.value}
      </text>
    </g>
  )
}

<XAxis dataKey="date" tick={<CustomTick />} />
```

## Responsive Breakpoints

### Different Heights for Mobile/Desktop
```javascript
import { useState, useEffect } from 'react'

const MyChart = ({ data }) => {
  const [chartHeight, setChartHeight] = useState(400)

  useEffect(() => {
    const handleResize = () => {
      setChartHeight(window.innerWidth < 768 ? 250 : 400)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      {/* Chart */}
    </ResponsiveContainer>
  )
}
```

## Animation Control

### Disable Animation (Performance)
```javascript
<Line isAnimationActive={false} />
```

### Custom Animation Duration
```javascript
<Line animationDuration={300} />
```

### Animation Easing
```javascript
<Line animationEasing="ease-in-out" />
```

## Real-World Examples from HMD

### 1. Deviation Trend Chart (DeviationAnalytics.jsx)

```javascript
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useTheme } from '../context/ThemeContext'

const DeviationTrendChart = ({ data }) => {
  const { theme } = useTheme()
  const isDarkMode = theme === 'dark'

  return (
    <div style={{
      background: 'hsl(var(--card-bg))',
      padding: '24px',
      borderRadius: '16px',
      border: '1px solid hsl(var(--border-color))'
    }}>
      <h3 style={{ marginBottom: '16px', color: 'hsl(var(--text-main))' }}>
        Deviation Trends Over Time
      </h3>
      <ResponsiveContainer width="100%" height={400}>
        <LineChart data={data}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke={isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}
          />
          <XAxis
            dataKey="date"
            stroke={isDarkMode ? '#94a3b8' : '#64748b'}
            tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 12 }}
          />
          <YAxis
            label={{ value: 'Deviation (minutes)', angle: -90, position: 'insideLeft' }}
            stroke={isDarkMode ? '#94a3b8' : '#64748b'}
            tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b', fontSize: 12 }}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: isDarkMode ? 'hsl(0 0% 8%)' : 'white',
              border: `1px solid ${isDarkMode ? 'hsl(0 0% 16%)' : 'hsl(214 32% 91%)'}`,
              color: isDarkMode ? 'hsl(0 0% 92%)' : 'hsl(215 25% 15%)',
              borderRadius: '8px',
            }}
          />
          <Legend wrapperStyle={{ color: isDarkMode ? '#94a3b8' : '#64748b' }} />
          <Line
            type="monotone"
            dataKey="avgDeviation"
            stroke="#3b82f6"
            strokeWidth={2}
            name="Average Deviation"
          />
          <Line
            type="monotone"
            dataKey="maxDeviation"
            stroke="#ef4444"
            strokeWidth={2}
            name="Max Deviation"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
```

### 2. Route Performance Bar Chart (Statistics.jsx)

```javascript
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts'
import { useTheme } from '../context/ThemeContext'

const RoutePerformanceChart = ({ data }) => {
  const { theme } = useTheme()
  const isDarkMode = theme === 'dark'

  const getBarColor = (value) => {
    if (value >= 95) return '#10b981' // Green
    if (value >= 85) return '#f59e0b' // Yellow
    return '#ef4444' // Red
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data}>
        <CartesianGrid
          strokeDasharray="3 3"
          stroke={isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)'}
        />
        <XAxis
          dataKey="route"
          stroke={isDarkMode ? '#94a3b8' : '#64748b'}
          tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b' }}
        />
        <YAxis
          stroke={isDarkMode ? '#94a3b8' : '#64748b'}
          tick={{ fill: isDarkMode ? '#94a3b8' : '#64748b' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: isDarkMode ? 'hsl(0 0% 8%)' : 'white',
            border: `1px solid ${isDarkMode ? 'hsl(0 0% 16%)' : 'hsl(214 32% 91%)'}`,
            color: isDarkMode ? 'hsl(0 0% 92%)' : 'hsl(215 25% 15%)',
            borderRadius: '8px',
          }}
        />
        <Bar dataKey="completion" name="Completion Rate (%)">
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={getBarColor(entry.completion)} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
```

### 3. Status Distribution Pie Chart (Reports.jsx)

```javascript
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const STATUS_COLORS = {
  'On-Time': '#10b981',
  'Warning': '#f59e0b',
  'Alert': '#ef4444',
  'Critical': '#dc2626',
  'Early': '#3b82f6'
}

const StatusDistributionChart = ({ data }) => {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
          outerRadius={100}
          fill="#8884d8"
          dataKey="count"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={STATUS_COLORS[entry.status]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  )
}
```

## Common Patterns

### Empty State Handling
```javascript
const MyChart = ({ data }) => {
  if (!data || data.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px', color: 'hsl(var(--text-muted))' }}>
        <p>No data available</p>
      </div>
    )
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      {/* Chart */}
    </ResponsiveContainer>
  )
}
```

### Loading State
```javascript
const MyChart = ({ data, isLoading }) => {
  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '40px' }}>
        <p>Loading chart...</p>
      </div>
    )
  }

  return <ResponsiveContainer>{/* Chart */}</ResponsiveContainer>
}
```

### Error Boundary
```javascript
import { Component } from 'react'

class ChartErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return <div>Failed to load chart</div>
    }
    return this.props.children
  }
}

// Usage
<ChartErrorBoundary>
  <MyChart data={data} />
</ChartErrorBoundary>
```

## Performance Tips

1. **Memoize Data Processing**
   ```javascript
   const chartData = useMemo(() =>
     processData(rawData),
     [rawData]
   )
   ```

2. **Limit Data Points**
   - Show max 30-50 points for smooth animation
   - Use data aggregation for large datasets

3. **Disable Animations for Large Datasets**
   ```javascript
   <Line isAnimationActive={data.length < 100} />
   ```

4. **Use ResponsiveContainer Wisely**
   - Always specify height (avoids 0-height container)
   - Use percentage width for flexibility

## Accessibility

### Add Labels
```javascript
<XAxis label="Date" />
<YAxis label="Trips" />
```

### Provide Alternative Text
```javascript
<div role="img" aria-label="Line chart showing deviation trends over time">
  <ResponsiveContainer>{/* Chart */}</ResponsiveContainer>
</div>
```

### Ensure Color Contrast
- Use distinct colors for different data series
- Don't rely solely on color to convey information
- Add text labels when possible

## Common Issues

### Issue: Chart Not Rendering
**Cause:** ResponsiveContainer has no height
**Solution:** Always specify height explicitly

### Issue: Tooltip Cut Off
**Cause:** Overflow hidden on parent
**Solution:** Add `wrapperStyle={{ position: 'relative' }}` to ResponsiveContainer

### Issue: Axis Labels Overlapping
**Solution:** Rotate labels or reduce tick count
```javascript
<XAxis angle={-45} textAnchor="end" height={80} />
<XAxis interval="preserveStartEnd" />
```

## Related Documentation

- [Frontend Overview](../FRONTEND_OVERVIEW.md) - Complete architecture
- [Statistics Page](../../developer-docs/docs/frontend/pages/04-statistics.md) - Chart usage
- [Deviation Analytics](../../developer-docs/docs/frontend/pages/05-deviation-analytics.md) - Advanced charts
- [Theming Guide](../styling/theming.md) - Dark mode support

---

**Last Updated:** January 2026
**Recharts Version:** 3.6.0
**React Version:** 19.2.0
