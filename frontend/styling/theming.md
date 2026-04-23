# Theming and CSS Variables Guide

## Overview

The HMD System uses a CSS custom properties-based theming system with support for both light and dark modes. This guide covers the theming architecture, CSS variables, best practices, and implementation patterns.

## Theming Architecture

### Theme Storage
- **Light Mode:** Default theme
- **Dark Mode:** Premium gaming style with golden accents
- **Persistence:** Stored in `localStorage` under key `hmd_theme`
- **Default Behavior:** Falls back to light mode if no preference set

### Theme Context

**File:** `src/context/ThemeContext.jsx`

**API:**
```javascript
import { useTheme } from '../context/ThemeContext'

const { theme, toggleTheme } = useTheme()
// theme: 'light' | 'dark'
// toggleTheme: () => void
```

**Implementation:**
```javascript
const { theme, toggleTheme } = useTheme()
const isDarkMode = theme === 'dark'

// Use in component
<div style={{ background: isDarkMode ? '#0a0a0a' : '#f8fafc' }}>
  {/* Content */}
</div>

// Toggle button
<button onClick={toggleTheme}>
  {isDarkMode ? 'Light Mode' : 'Dark Mode'}
</button>
```

## CSS Custom Properties

### Light Mode (Default)

**File:** `src/index.css`

```css
:root {
  /* Primary Colors */
  --primary: 224 71% 4%;           /* #020617 - Deep midnight */
  --primary-text: 215 25% 15%;     /* #1e293b */
  --accent: 217 91% 60%;            /* #3b82f6 - Electric Blue */
  --accent-soft: 217 91% 95%;       /* Light blue tint */

  /* Status Colors */
  --success: 142 71% 40%;           /* #15803d - Forest Green */
  --warning: 38 92% 50%;            /* #f59e0b - Amber */
  --danger: 0 84% 60%;              /* #ef4444 - Red */

  /* Chart Colors */
  --chart-purple: 263 70% 50%;      /* Purple */
  --chart-cyan: 186 94% 42%;        /* Cyan */
  --chart-gray: 220 9% 46%;         /* Gray */

  /* Backgrounds */
  --sidebar-bg: 0 0% 100%;          /* White */
  --main-bg: 210 40% 98%;           /* #f8fafc - Light gray */
  --card-bg: 0 0% 100%;             /* White */

  /* Text Colors */
  --text-main: 215 25% 15%;         /* #0f172a - Dark slate */
  --text-muted: 215 16% 47%;        /* #64748b - Muted slate */

  /* Borders */
  --border-color: 214 32% 91%;      /* #e2e8f0 - Light border */

  /* Spacing */
  --sidebar-width: 280px;
  --header-height: 80px;

  /* Border Radius */
  --radius-xl: 24px;
  --radius-lg: 16px;
  --radius-md: 12px;
  --radius-sm: 8px;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.08), 0 4px 6px -4px rgb(0 0 0 / 0.05);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.05);

  /* Transitions */
  --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
  --transition-base: 300ms cubic-bezier(0.4, 0, 0.2, 1);

  /* Glassmorphism */
  --glass-bg: rgba(255, 255, 255, 0.7);
  --glass-sidebar: rgba(255, 255, 255, 0.8);

  /* Input & Form */
  --input-bg: 0 0% 100%;
  --input-border: 214 32% 91%;

  /* Dropdown & Menu */
  --dropdown-bg: 0 0% 100%;
  --dropdown-hover: 210 40% 96%;
}
```

### Dark Mode (Gaming Style)

```css
[data-theme="dark"] {
  /* Primary Colors */
  --primary: 43 89% 55%;            /* #d4a842 - Golden */
  --primary-text: 0 0% 92%;         /* #ebebeb - Off-white */
  --accent: 43 89% 52%;             /* #d4a842 - Golden accent */
  --accent-soft: 43 89% 15%;        /* Dark golden tint */

  /* Status Colors (Enhanced) */
  --success: 142 71% 45%;           /* Brighter green */
  --warning: 38 92% 55%;            /* Brighter amber */
  --danger: 0 84% 60%;              /* Same red */

  /* Chart Colors */
  --chart-purple: 263 70% 58%;      /* Lighter purple */
  --chart-cyan: 186 94% 42%;        /* Same cyan */
  --chart-gray: 0 0% 45%;           /* Lighter gray */

  /* Backgrounds (True Dark) */
  --sidebar-bg: 0 0% 6%;            /* #0f0f0f - Near black */
  --main-bg: 0 0% 4%;               /* #0a0a0a - True black */
  --card-bg: 0 0% 8%;               /* #141414 - Dark gray */

  /* Text Colors */
  --text-main: 0 0% 92%;            /* #ebebeb - Off-white */
  --text-muted: 0 0% 55%;           /* #8c8c8c - Mid gray */

  /* Borders */
  --border-color: 0 0% 16%;         /* #292929 - Subtle border */

  /* Shadows (Deeper) */
  --shadow-sm: 0 2px 4px 0 rgb(0 0 0 / 0.4);
  --shadow-md: 0 4px 8px -1px rgb(0 0 0 / 0.5), 0 2px 4px -2px rgb(0 0 0 / 0.4);
  --shadow-lg: 0 12px 24px -4px rgb(0 0 0 / 0.6), 0 4px 8px -4px rgb(0 0 0 / 0.5);
  --shadow-xl: 0 24px 48px -8px rgb(0 0 0 / 0.7);

  /* Glassmorphism (Dark glass) */
  --glass-bg: rgba(10, 10, 10, 0.85);
  --glass-sidebar: rgba(15, 15, 15, 0.95);

  /* Input & Form */
  --input-bg: 0 0% 10%;
  --input-border: 0 0% 20%;

  /* Dropdown & Menu */
  --dropdown-bg: 0 0% 9%;
  --dropdown-hover: 0 0% 12%;
}
```

## HSL Color Format

### Why HSL?

CSS variables use **HSL (Hue, Saturation, Lightness)** format without the `hsl()` wrapper:

```css
/* Define */
--primary: 224 71% 4%;

/* Use */
background: hsl(var(--primary));
color: hsl(var(--text-main));
```

### Benefits
1. **Opacity Support:** Easy alpha channel addition
   ```css
   background: hsl(var(--primary) / 0.5);  /* 50% opacity */
   border: 1px solid hsl(var(--border-color) / 0.3);
   ```

2. **Consistent Format:** All colors use same pattern
3. **Easy Adjustments:** Modify lightness without recalculating hex codes
4. **Modern CSS:** Native browser support

### Usage Patterns

**Solid Color:**
```css
background: hsl(var(--card-bg));
color: hsl(var(--text-main));
```

**With Opacity:**
```css
background: hsl(var(--primary) / 0.1);
border: 1px solid hsl(var(--border-color) / 0.5);
box-shadow: 0 4px 6px hsl(var(--primary) / 0.2);
```

## Using CSS Variables

### In CSS Files

```css
.my-card {
  background: hsl(var(--card-bg));
  color: hsl(var(--text-main));
  border: 1px solid hsl(var(--border-color));
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  transition: all var(--transition-base);
}

.my-card:hover {
  box-shadow: var(--shadow-lg);
  transform: translateY(-2px);
}
```

### In React Inline Styles

```javascript
const MyComponent = () => {
  return (
    <div style={{
      background: 'hsl(var(--card-bg))',
      color: 'hsl(var(--text-main))',
      padding: '24px',
      borderRadius: 'var(--radius-md)',
      boxShadow: 'var(--shadow-md)',
    }}>
      Content
    </div>
  )
}
```

### With Computed Styles

```javascript
const MyComponent = () => {
  const styles = {
    container: {
      background: 'hsl(var(--main-bg))',
      padding: '24px',
    },
    card: {
      background: 'hsl(var(--card-bg))',
      borderRadius: 'var(--radius-lg)',
    },
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>Card Content</div>
    </div>
  )
}
```

## Best Practices

### 1. Always Use CSS Variables

**Good:**
```css
.card {
  background: hsl(var(--card-bg));
  color: hsl(var(--text-main));
}
```

**Avoid:**
```css
.card {
  background: white;
  color: #0f172a;
}
```

**Why:** Hardcoded colors break dark mode.

### 2. Use Semantic Variable Names

**Good:**
```css
border-left: 3px solid hsl(var(--success));  /* Meaning clear */
```

**Avoid:**
```css
border-left: 3px solid #10b981;  /* Purpose unclear */
```

### 3. Leverage Opacity for Variants

**Good:**
```css
.badge {
  background: hsl(var(--primary) / 0.1);
  color: hsl(var(--primary));
}
```

**Creates:** Light badge with primary color text.

### 4. Use Theme-Aware Logic in JavaScript

```javascript
import { useTheme } from '../context/ThemeContext'

const MyComponent = () => {
  const { theme } = useTheme()
  const isDarkMode = theme === 'dark'

  return (
    <div style={{
      // For complex logic that CSS variables can't handle
      background: isDarkMode
        ? 'linear-gradient(135deg, #0a0a0a 0%, #1a1a1a 100%)'
        : 'linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%)',
    }}>
      Content
    </div>
  )
}
```

**Use Cases:**
- Complex gradients
- Conditional SVG colors
- Chart color configurations
- Image filters

## Dark Mode Overrides

### Global Element Overrides

```css
[data-theme="dark"] h1,
[data-theme="dark"] h2,
[data-theme="dark"] h3,
[data-theme="dark"] h4,
[data-theme="dark"] h5,
[data-theme="dark"] h6 {
  color: hsl(var(--text-main));
}
```

### Card Components

```css
[data-theme="dark"] .premium-card,
[data-theme="dark"] .stat-card,
[data-theme="dark"] .card-wide {
  background: hsl(var(--card-bg));
  border-color: hsl(var(--border-color));
}
```

### Form Elements

```css
[data-theme="dark"] input,
[data-theme="dark"] select,
[data-theme="dark"] textarea {
  background: hsl(var(--input-bg));
  border-color: hsl(var(--input-border));
  color: hsl(var(--text-main));
}

[data-theme="dark"] input::placeholder,
[data-theme="dark"] textarea::placeholder {
  color: hsl(var(--text-muted));
}
```

### Why Overrides?

Some elements don't automatically inherit CSS variables. Explicit overrides ensure consistency.

## Theme Toggle Implementation

### Header Component

```javascript
import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

const Header = () => {
  const { theme, toggleTheme } = useTheme()

  return (
    <button
      onClick={toggleTheme}
      style={{
        background: 'hsl(var(--card-bg))',
        border: '1px solid hsl(var(--border-color))',
        borderRadius: '8px',
        padding: '8px 12px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}
    >
      {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
      <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
    </button>
  )
}
```

### Smooth Transition

Add transition to root element for smooth theme switching:

```css
html {
  transition: background-color 0.3s ease, color 0.3s ease;
}

* {
  transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
}
```

**Note:** May cause performance issues. Use sparingly.

## Premium UI Patterns

### 1. Card Hover Effects

```css
.premium-card {
  background: hsl(var(--card-bg));
  border: 1px solid hsl(var(--border-color));
  border-radius: var(--radius-lg);
  padding: 24px;
  box-shadow: var(--shadow-md);
  transition: all var(--transition-base);
  cursor: pointer;
}

.premium-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-lg);
  border-color: hsl(var(--accent) / 0.3);
}
```

### 2. Accent Bars

```css
.card-with-accent {
  position: relative;
  background: hsl(var(--card-bg));
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.card-with-accent::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: 4px;
  height: 100%;
  background: linear-gradient(180deg, hsl(var(--accent)), hsl(var(--primary)));
}
```

### 3. KPI Cards with Colored Border

```css
.kpi-card {
  background: hsl(var(--card-bg));
  border-radius: var(--radius-md);
  padding: 20px;
  border-left: 3px solid hsl(var(--success));
}

.kpi-card.warning {
  border-left-color: hsl(var(--warning));
}

.kpi-card.danger {
  border-left-color: hsl(var(--danger));
}
```

### 4. Icon Backgrounds

```css
.icon-wrapper {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  background: hsl(var(--primary) / 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: hsl(var(--primary));
}
```

### 5. Status Badges

```css
.badge {
  display: inline-flex;
  align-items: center;
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 600;
  background: hsl(var(--success) / 0.1);
  color: hsl(var(--success));
}

.badge.warning {
  background: hsl(var(--warning) / 0.1);
  color: hsl(var(--warning));
}

.badge.danger {
  background: hsl(var(--danger) / 0.1);
  color: hsl(var(--danger));
}
```

## Chart Theme Integration

### Recharts with Theme Support

```javascript
import { useTheme } from '../context/ThemeContext'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts'

const ThemedChart = ({ data }) => {
  const { theme } = useTheme()
  const isDarkMode = theme === 'dark'

  const chartColors = {
    axis: isDarkMode ? '#94a3b8' : '#64748b',
    grid: isDarkMode ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    tooltipBg: isDarkMode ? 'hsl(0 0% 8%)' : 'white',
    tooltipBorder: isDarkMode ? 'hsl(0 0% 16%)' : 'hsl(214 32% 91%)',
    tooltipText: isDarkMode ? 'hsl(0 0% 92%)' : 'hsl(215 25% 15%)',
  }

  return (
    <LineChart data={data}>
      <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
      <XAxis
        dataKey="date"
        stroke={chartColors.axis}
        tick={{ fill: chartColors.axis }}
      />
      <YAxis
        stroke={chartColors.axis}
        tick={{ fill: chartColors.axis }}
      />
      <Tooltip
        contentStyle={{
          backgroundColor: chartColors.tooltipBg,
          border: `1px solid ${chartColors.tooltipBorder}`,
          color: chartColors.tooltipText,
          borderRadius: '8px',
        }}
      />
      <Legend wrapperStyle={{ color: chartColors.axis }} />
      <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} />
    </LineChart>
  )
}
```

## Animations

### Keyframes

```css
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
}
```

### Spin Animation (Loading)

```css
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.spinner {
  width: 48px;
  height: 48px;
  border: 4px solid hsl(var(--border-color));
  border-top-color: hsl(var(--primary));
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
```

## Typography

### Font Families

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&display=swap');

body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

h1, h2, h3, h4, h5, h6 {
  font-family: 'Space Grotesk', 'Inter', sans-serif;
}
```

### Font Sizes

```css
h1 { font-size: 2.5rem; font-weight: 700; }
h2 { font-size: 2rem; font-weight: 600; }
h3 { font-size: 1.5rem; font-weight: 600; }
h4 { font-size: 1.25rem; font-weight: 600; }
p { font-size: 1rem; line-height: 1.6; }
small { font-size: 0.875rem; }
```

## Responsive Design

### Breakpoints

```css
/* Mobile First */
.container {
  padding: 16px;
}

/* Tablet (768px+) */
@media (min-width: 768px) {
  .container {
    padding: 24px;
  }
}

/* Desktop (1024px+) */
@media (min-width: 1024px) {
  .container {
    padding: 32px;
  }
}
```

### Responsive Typography

```css
h1 {
  font-size: 1.875rem; /* Mobile */
}

@media (min-width: 768px) {
  h1 {
    font-size: 2.5rem; /* Tablet/Desktop */
  }
}
```

## Testing Theme Changes

### Manual Testing Checklist

- [ ] Toggle theme button works
- [ ] Theme persists on page refresh
- [ ] All text is readable in both themes
- [ ] Cards and borders visible in both themes
- [ ] Charts render correctly in both themes
- [ ] Form inputs styled correctly
- [ ] Hover states work in both themes
- [ ] Tooltips visible in both themes
- [ ] Icons contrast properly
- [ ] No hardcoded colors remaining

### Browser DevTools

1. Open DevTools → Elements tab
2. Inspect `:root` or `[data-theme="dark"]`
3. View computed CSS variables
4. Test variable overrides live

## Common Issues

### Issue: Dark Mode Not Applying

**Cause:** Theme attribute not set on root element
**Solution:** Verify ThemeContext sets `data-theme` attribute:
```javascript
document.documentElement.setAttribute('data-theme', theme)
```

### Issue: Hardcoded Colors Visible

**Cause:** Direct color values used instead of CSS variables
**Solution:** Search codebase for `#`, `rgb(`, `rgba(` and replace with variables

### Issue: Charts Look Broken in Dark Mode

**Cause:** Chart components not using theme-aware colors
**Solution:** Use `useTheme()` hook and configure chart colors dynamically

### Issue: Text Unreadable in Dark Mode

**Cause:** Insufficient contrast
**Solution:** Test contrast ratios, adjust lightness values

## Accessibility

### Color Contrast

**WCAG 2.1 AA Requirements:**
- Normal text: 4.5:1 contrast ratio
- Large text (18pt+): 3:1 contrast ratio

**Tools:**
- Chrome DevTools Color Picker (shows contrast ratio)
- WebAIM Contrast Checker: https://webaim.org/resources/contrastchecker/

### High Contrast Mode

Consider adding high contrast theme for accessibility:

```css
[data-theme="high-contrast"] {
  --text-main: 0 0% 0%;           /* Pure black */
  --bg-primary: 0 0% 100%;        /* Pure white */
  --border-color: 0 0% 0%;        /* Black borders */
}
```

## Related Documentation

- [Frontend Overview](../FRONTEND_OVERVIEW.md) - Complete architecture
- [index.css Documentation](../index-css.md) - Full CSS file breakdown
- [Recharts Guide](../charts/recharts-guide.md) - Theme-aware charts
- [Component Styling](../../developer-docs/docs/frontend/components/) - Component-specific styles

---

**Last Updated:** January 2026
**CSS Version:** CSS3 with Custom Properties
**Browser Support:** All modern browsers (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
