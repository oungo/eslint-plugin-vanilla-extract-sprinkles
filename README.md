# eslint-plugin-sprinkles-prefer

ESLint plugin to prefer sprinkles over vanilla-extract style for supported properties. This plugin dynamically analyzes your project's `sprinkles.css.ts` file to understand which properties should use sprinkles.

## Features

- **Dynamic Analysis**: Automatically finds and parses your project's `sprinkles.css.ts` file
- **Auto-fix**: Provides automatic fixes to transform code to use sprinkles
- **Preserves Context**: Maintains other style variables and complex expressions in style arrays
- **Comprehensive Support**: Works with `style()`, `styleVariants()`, and `recipe()` patterns
- **Smart Detection**: Only suggests changes for properties actually defined in your sprinkles

## Installation

```bash
npm install --save-dev eslint-plugin-sprinkles-prefer
# or
yarn add -D eslint-plugin-sprinkles-prefer
```

## Configuration

Add to your ESLint config:

```javascript
{
  "plugins": ["sprinkles-prefer"],
  "rules": {
    "sprinkles-prefer/prefer-sprinkles": "warn"
  }
}
```

Or use the recommended config:

```javascript
{
  "extends": ["plugin:sprinkles-prefer/recommended"]
}
```

## How It Works

The plugin automatically searches for your `sprinkles.css.ts` file in common locations:
- `**/sprinkles.css.ts`
- `**/src/style/sprinkles.css.ts`
- `**/src/styles/sprinkles.css.ts`
- And other common patterns

It then parses the `defineProperties` calls to understand which CSS properties and values are available through sprinkles.

## Examples

### Basic transformation:

```typescript
// Before
const myStyle = style({
  display: 'flex',
  flexDirection: 'column',
  padding: '16px',
});

// After (auto-fixed)
const myStyle = style([
  sprinkles({
    display: 'flex',
    flexDirection: 'column',
  }),
  {
    padding: '16px',
  }
]);
```

### Preserves other style variables:

```typescript
// Before
const combined = style([
  baseStyle,
  {
    display: 'flex',
    gap: 12,
  }
]);

// After (auto-fixed)
const combined = style([
  baseStyle,
  sprinkles({
    display: 'flex',
  }),
  {
    gap: 12,
  }
]);
```

### Works with styleVariants:

```typescript
// Before
export const variants = styleVariants({
  primary: {
    backgroundColor: 'blue-500',
    padding: '8px',
  }
});

// After (auto-fixed)
export const variants = styleVariants({
  primary: style([
    sprinkles({
      backgroundColor: 'blue-500',
    }),
    {
      padding: '8px',
    }
  ])
});
```

## Supported Properties

The plugin supports all properties defined in your project's sprinkles configuration. Common examples include:

- **Layout**: `display`, `position`, `flexDirection`, `justifyContent`, `alignItems`
- **Sizing**: `width`, `height`, `margin`
- **Typography**: `textAlign`, `whiteSpace`, `wordBreak`
- **Visual**: `overflow`, `borderRadius`
- **Colors**: `color`, `backgroundColor` (with theme tokens)
- **Z-index**: Named constants like `MODAL`, `STICKY`, etc.

## Requirements

- Node.js >= 14.0.0
- ESLint >= 7.0.0
- A vanilla-extract project with sprinkles configured

## License

MIT