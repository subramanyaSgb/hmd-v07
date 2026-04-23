# index.html Documentation

## Overview

The `index.html` file is the entry point for the HMD System frontend application. It provides the minimal HTML structure required to bootstrap the React application and serves as the single-page application (SPA) shell.

**Location:** `frontend/index.html`

**Type:** HTML5 Document

**Role:** Application entry point and static shell

## File Contents

```html
<!doctype html>
<html lang="en">

<head>
  <meta charset="UTF-8" />
  <link rel="icon" type="image/svg+xml" href="/vite.svg" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Deevia</title>
</head>

<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>

</html>
```

## Structure Breakdown

### DOCTYPE Declaration
```html
<!doctype html>
```

**Purpose:** Declares the document as HTML5.

**Why It Matters:**
- Ensures modern browser rendering mode
- Prevents quirks mode rendering
- Required for consistent CSS and JavaScript behavior

### HTML Element
```html
<html lang="en">
```

**Attributes:**
- `lang="en"` - Specifies document language as English

**Purpose:**
- Accessibility: Screen readers use language attribute for pronunciation
- SEO: Search engines use language for content indexing
- Browser features: Spell-check and translation detection

### Head Section

#### Character Encoding
```html
<meta charset="UTF-8" />
```

**Purpose:** Declares UTF-8 character encoding.

**Why UTF-8:**
- Supports all Unicode characters (multilingual support)
- Required for modern web applications
- Prevents character rendering issues

**Impact:**
- Enables proper display of special characters, emojis, and international text
- Prevents mojibake (character corruption)

#### Favicon
```html
<link rel="icon" type="image/svg+xml" href="/vite.svg" />
```

**Purpose:** Sets the browser tab icon (favicon).

**Current Implementation:**
- Uses Vite's default logo (`/vite.svg`)
- SVG format for scalability

**Customization Opportunity:**
- Replace `/vite.svg` with custom HMD logo
- Recommended: Create `public/favicon.ico` for broader browser support
- Consider multiple sizes for different contexts (16x16, 32x32, 192x192)

**Example Custom Favicon:**
```html
<link rel="icon" type="image/x-icon" href="/favicon.ico" />
<link rel="icon" type="image/svg+xml" href="/logo.svg" />
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
```

#### Viewport Meta Tag
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

**Purpose:** Controls viewport behavior on mobile devices.

**Attributes:**
- `width=device-width` - Sets viewport width to device screen width
- `initial-scale=1.0` - Sets initial zoom level to 100%

**Why It Matters:**
- **Critical for responsive design**
- Without this, mobile browsers render at desktop width and scale down
- Prevents pinch-to-zoom issues
- Ensures CSS media queries work correctly

**Impact:**
- Makes application mobile-friendly
- Prevents horizontal scrolling on small screens
- Enables proper touch interaction

#### Page Title
```html
<title>Deevia</title>
```

**Purpose:** Sets the document title shown in browser tab.

**Current Value:** "Deevia"

**Customization Opportunity:**
- Update to "HMD System - Hot Metal Distribution"
- Dynamic title updates handled by React Router and HeaderContext
- Appears in:
  - Browser tabs
  - Browser history
  - Bookmarks
  - Search engine results

**Recommended Update:**
```html
<title>HMD System - Hot Metal Distribution</title>
```

**Note:** Individual page titles are managed dynamically via `ROUTE_CONFIG` in `App.jsx`.

### Body Section

#### Root Container
```html
<div id="root"></div>
```

**Purpose:** Provides the mount point for the React application.

**Why This Matters:**
- React app renders inside this div via `ReactDOM.createRoot()`
- Must have `id="root"` to match `main.jsx` mounting code
- Initially empty - React populates content on load
- All React components live inside this container

**Mounting Code (from main.jsx):**
```javascript
ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

#### Module Script
```html
<script type="module" src="/src/main.jsx"></script>
```

**Purpose:** Loads the React application entry point.

**Attributes:**
- `type="module"` - Enables ES6 module syntax (import/export)
- `src="/src/main.jsx"` - Path to React entry point

**Why type="module":**
- Enables modern JavaScript features (import, export)
- Modules are deferred by default (non-blocking)
- Vite requires module type for HMR (Hot Module Replacement)

**Processing Flow:**
1. Browser loads `index.html`
2. Parses HTML and creates root div
3. Loads `main.jsx` as ES module
4. Vite transforms JSX to JavaScript
5. React mounts to `#root` div
6. Application renders

## How It Works

### Development Mode (npm run dev)

1. **Vite dev server** serves `index.html`
2. **Vite injects** HMR client code and transforms
3. **Script loads** `main.jsx` with hot module replacement
4. **React renders** application into `#root`
5. **HMR watches** for file changes and updates without full reload

### Production Build (npm run build)

1. **Vite processes** `index.html` as template
2. **Injects hashed assets** (JS and CSS bundles)
3. **Minifies HTML** by removing whitespace
4. **Outputs to** `dist/index.html`

**Production Output Example:**
```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <link rel="icon" type="image/svg+xml" href="/vite.svg"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Deevia</title>
  <script type="module" crossorigin src="/assets/index-a1b2c3d4.js"></script>
  <link rel="stylesheet" href="/assets/index-e5f6g7h8.css">
</head>
<body>
  <div id="root"></div>
</body>
</html>
```

**Key Differences:**
- Script path changed to hashed bundle: `index-a1b2c3d4.js`
- CSS link injected: `index-e5f6g7h8.css`
- HTML minified (whitespace removed)
- Hashes enable cache busting

## SPA Routing Considerations

### Problem: 404 on Direct Route Access

When deploying as SPA, direct navigation to routes like `/trips` or `/statistics` causes 404 errors because the server looks for physical files at those paths.

### Solution: Fallback Routing

Configure server to serve `index.html` for all routes except static assets.

**Examples:**

#### Nginx
```nginx
location / {
  try_files $uri $uri/ /index.html;
}
```

#### Apache (.htaccess)
```apache
RewriteEngine On
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ index.html [L]
```

#### Vercel (vercel.json)
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

#### Netlify (_redirects)
```
/*    /index.html   200
```

## Missing Meta Tags (Potential Enhancements)

### SEO Meta Tags
```html
<meta name="description" content="Hot Metal Distribution System - Manage torpedo ladle logistics and track hot metal transportation in steel plants" />
<meta name="keywords" content="hot metal, logistics, steel plant, torpedo ladle, fleet management" />
<meta name="author" content="HMD Development Team" />
```

### Open Graph (Social Sharing)
```html
<meta property="og:title" content="HMD System - Hot Metal Distribution" />
<meta property="og:description" content="Logistics management system for hot metal transportation" />
<meta property="og:image" content="/og-image.png" />
<meta property="og:type" content="website" />
```

### Theme Color (Mobile)
```html
<meta name="theme-color" content="#020617" />
<meta name="theme-color" content="#0a0a0a" media="(prefers-color-scheme: dark)" />
```

### Security Headers
```html
<meta http-equiv="X-UA-Compatible" content="IE=edge" />
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com;" />
```

**Note:** Security headers are better set via HTTP response headers (see `backend/utils/security.py`).

### Web App Manifest (PWA)
```html
<link rel="manifest" href="/manifest.json" />
```

**manifest.json Example:**
```json
{
  "name": "HMD System",
  "short_name": "HMD",
  "description": "Hot Metal Distribution System",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#f8fafc",
  "theme_color": "#020617",
  "icons": [
    {
      "src": "/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

## Performance Considerations

### Preload Critical Resources
```html
<link rel="preload" href="/src/main.jsx" as="script" />
<link rel="preload" href="/fonts/Inter-Regular.woff2" as="font" type="font/woff2" crossorigin />
```

### DNS Prefetch for External Resources
```html
<link rel="dns-prefetch" href="https://fonts.googleapis.com" />
<link rel="dns-prefetch" href="https://fonts.gstatic.com" />
```

### Preconnect for Critical Third-Party Origins
```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
```

**Note:** Google Fonts already preconnected in `index.css` via `@import`.

## Accessibility Enhancements

### Skip Navigation Link
```html
<body>
  <a href="#main-content" class="skip-to-main">Skip to main content</a>
  <div id="root"></div>
</body>
```

**CSS:**
```css
.skip-to-main {
  position: absolute;
  top: -40px;
  left: 0;
  background: var(--primary);
  color: white;
  padding: 8px;
  z-index: 100;
}

.skip-to-main:focus {
  top: 0;
}
```

### Language Alternatives
```html
<link rel="alternate" hreflang="en" href="https://hmd-system.com/en" />
<link rel="alternate" hreflang="es" href="https://hmd-system.com/es" />
```

## Loading State (Optional)

Add a loading spinner visible before React mounts:

```html
<body>
  <div id="root">
    <div style="display: flex; align-items: center; justify-content: center; height: 100vh;">
      <div style="text-align: center;">
        <div style="border: 4px solid #e2e8f0; border-top-color: #3b82f6; border-radius: 50%; width: 48px; height: 48px; animation: spin 1s linear infinite;"></div>
        <p style="margin-top: 16px; color: #64748b;">Loading HMD System...</p>
      </div>
    </div>
  </div>
  <script type="module" src="/src/main.jsx"></script>
  <style>
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</body>
```

**Why:** Provides immediate visual feedback while JavaScript loads.

**Note:** React replaces this content when mounting.

## Noscript Fallback

Handle browsers with JavaScript disabled:

```html
<body>
  <noscript>
    <div style="padding: 20px; text-align: center; background: #fee; border: 2px solid #c00; margin: 20px; border-radius: 8px;">
      <h1>JavaScript Required</h1>
      <p>The HMD System requires JavaScript to function. Please enable JavaScript in your browser settings.</p>
    </div>
  </noscript>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
```

## Environment-Specific Title

Differentiate development, staging, and production environments:

```html
<!-- Development -->
<title>🔧 [DEV] HMD System</title>

<!-- Staging -->
<title>🚧 [STAGING] HMD System</title>

<!-- Production -->
<title>HMD System - Hot Metal Distribution</title>
```

**Implementation:** Use Vite environment variables in `vite.config.js` to inject title.

## Common Issues

### Issue: Blank Page on Load

**Causes:**
- Missing `id="root"` on div
- Script path incorrect
- JavaScript errors in React code
- CORS issues with API

**Debugging:**
1. Open browser DevTools Console
2. Check for JavaScript errors
3. Verify network requests succeed
4. Check React mounting in Console

### Issue: Favicon Not Loading

**Causes:**
- Incorrect path in `href`
- File doesn't exist in `public/`
- Browser caching old favicon

**Solutions:**
- Place favicon in `public/favicon.ico`
- Update href: `<link rel="icon" href="/favicon.ico" />`
- Hard refresh browser (Ctrl+Shift+R)

### Issue: Mobile Viewport Issues

**Causes:**
- Missing or incorrect viewport meta tag
- CSS using fixed widths instead of responsive units

**Solutions:**
- Ensure viewport meta tag present
- Use `vw`, `vh`, `%`, `rem` instead of `px`
- Test with browser DevTools mobile emulation

## Related Files

### `src/main.jsx`
React entry point that mounts to `#root`.

**Connection:**
```javascript
ReactDOM.createRoot(document.getElementById('root')).render(...)
```

### `vite.config.js`
Build configuration that processes `index.html`.

**Transforms:**
- Injects script and link tags for bundles
- Minifies HTML in production
- Handles asset hashing

### `public/` Directory
Static assets served at root level.

**Contents:**
- `vite.svg` - Current favicon
- Future: `favicon.ico`, `robots.txt`, `manifest.json`

## Best Practices

1. **Keep It Minimal**
   - index.html should be as simple as possible
   - Let Vite handle asset injection
   - Move styles to CSS files

2. **Use Semantic HTML**
   - Proper DOCTYPE and lang attribute
   - Meaningful meta tags
   - Accessibility attributes

3. **Optimize for Performance**
   - Preload critical resources
   - Minimize render-blocking resources
   - Use async/defer for non-critical scripts

4. **Consider SEO**
   - Descriptive title and meta description
   - Open Graph tags for social sharing
   - Canonical URLs for production

5. **Ensure Accessibility**
   - Language attribute on html element
   - Meta viewport for responsive design
   - Noscript fallback message

## Customization Checklist

For production deployment, update:

- [ ] Page title to "HMD System - Hot Metal Distribution"
- [ ] Favicon to custom HMD logo
- [ ] Add meta description for SEO
- [ ] Add Open Graph tags for social sharing
- [ ] Add theme-color for mobile browsers
- [ ] Add web app manifest for PWA support
- [ ] Add noscript fallback message
- [ ] Add loading state before React mounts
- [ ] Test SPA routing on production server
- [ ] Verify meta tags with social media debuggers

## Related Documentation

- [Frontend Overview](FRONTEND_OVERVIEW.md) - Complete frontend architecture
- [Frontend Structure](structure.md) - Directory organization
- [main.jsx](../developer-docs/docs/frontend/main.md) - React entry point
- [App.jsx](../developer-docs/docs/frontend/app.md) - Router configuration
- [Vite Configuration](../developer-docs/docs/frontend/vite-config.md) - Build setup

---

**Last Updated:** January 2026
**HTML Version:** HTML5
**Browser Support:** All modern browsers (Chrome 90+, Firefox 88+, Safari 14+, Edge 90+)
